// ATLAS Detector ID Parser
// Based on the ATLANTIS event display project (CERN) ID dictionary system.
//
// Algorithm: Hierarchical bit-field extraction from 64-bit compact identifiers.
// Each field's bit-width = ceil(log2(num_values_across_all_regions_at_that_level)).
// Fields are packed MSB-first: bits [63..32] for 64-bit IDs.
//
// Derived from:
//   - IdDictATLAS.xml         → subdet field
//   - IdDictTileCalorimeter.xml → section/side/module/tower/sampling/pmt/adc
//   - IdDictLArCalorimeter.xml  → part/barrel-endcap/sampling/region/eta/phi
//
// Bit layout (all IDs start at offset=64, consuming MSB-first):
//
//   ATLAS root:
//     [subdet]  3 bits — discrete {2,4,5,7,10,11,12,13}
//
//   TileCalorimeter (subdet=5):
//     [section]  3 bits — continuous [0..4]  (0=Online,1=Barrel,2=ExtBarrel,3=ITC,4=Testbeam)
//     [level1]   4 bits — continuous [-1..10] (for offline cells: side ∈ {-1,+1})
//     [module]   8 bits — continuous [0..255]
//     [tower]    6 bits — continuous [0..63]
//     [sampling] 4 bits — continuous [0..15]
//     [pmt]      2 bits — continuous [0..3]
//     [adc]      2 bits — continuous [0..3]
//     Total: 3+3+4+8+6+4+2+2 = 32 bits in upper half of u64
//
//   LArCalorimeter (subdet=4):
//     [part] 3 bits — discrete {-3,-2,-1,1,2,3,4,5}
//     Then for LArEM (part=1 or -1):
//       [barrel-endcap] 3 bits — discrete {-3,-2,-1,1,2,3}
//       [sampling]      2 bits — [0..3]
//       [region]        3 bits — [0..5]
//       [eta]           9 bits — [0..447]
//       [phi]           8 bits — [0..255]
//     For LArHEC (part=2 or -2):
//       [barrel-endcap] 1 bit  — discrete {-2,+2}
//       [sampling]      2 bits — [0..3]
//       [region]        1 bit  — [0..1]
//       [eta]           4 bits — [0..9]
//       [phi]           6 bits — [0..63]
//     For LArFCAL (part=3 or -3):
//       [barrel-endcap] 1 bit  — discrete {-2,+2}
//       [module]        2 bits — discrete {1,2,3}
//       [eta-fcal]      6 bits — [0..63]
//       [phi-fcal]      4 bits — [0..15]

use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use std::f64::consts::PI;

// ─── Bit extraction helpers ──────────────────────────────────────────────────

/// Extract `bits` bits from `id` starting at `offset` from MSB (64-bit).
/// Returns the raw index (before value mapping).
#[inline]
fn extract(id: u64, offset: usize, bits: usize) -> usize {
    let shift = offset - bits;
    let mask = (1u64 << bits) - 1;
    ((id >> shift) & mask) as usize
}

/// Map index to a discrete set of values.
#[inline]
fn discrete(idx: usize, values: &[i32]) -> Option<i32> {
    values.get(idx).copied()
}

/// Map index to continuous range [min..].
#[inline]
fn continuous(idx: usize, min: i32) -> i32 {
    min + idx as i32
}

/// ceil(log2(n)) for n > 2, else 1.
#[allow(dead_code)]
fn bits_needed(n: usize) -> usize {
    if n <= 2 { 1 } else { (n as f64).log2().ceil() as usize }
}

// ─── Result types ─────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct IdField {
    pub name: String,
    pub value: i32,
    pub label: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ParsedId {
    /// Raw 64-bit input ID
    pub id: String,
    /// True if decoding succeeded
    pub valid: bool,
    /// Error message if invalid
    pub error: String,
    /// Decoded fields in order
    pub fields: Vec<IdField>,
    /// Official ATLAS "/" notation: "5/1/-1/0/0/0/0/0"
    pub full_id: String,
    /// Human-readable cell name: "LBC01 A1"
    pub cell_name: String,
    /// Subsystem name: "TILECAL", "LAr EM", "LAr HEC", "LAr FCAL"
    pub subsystem: String,
    /// Physical pseudorapidity (if computable)
    pub eta: f64,
    /// Physical azimuthal angle in radians (if computable)
    pub phi: f64,
    /// Summary string with all info
    pub summary: String,
}

// ─── TILE physical coordinate helpers ─────────────────────────────────────────

/// Physical |η| centre for a TILE cell.
/// Barrel (section=1): each tower=t → |η| = 0.05 + 0.1*t  (towers 0-9)
/// Extended barrel (section=2): towers 10-15 → |η| approx 1.05..1.55
fn tile_eta_center(section: i32, side: i32, tower: i32) -> f64 {
    let abs_eta = match section {
        1 => 0.05 + 0.1 * tower as f64,           // Barrel
        2 => 0.05 + 0.1 * tower as f64,           // Extended barrel (tower 10-15)
        3 => {
            // ITC / gap scintillators
            match tower {
                8  => 0.95,  // D4
                9  => 1.05,  // C10 gap
                10 => 1.15,  // E1
                11 => 1.25,  // E2
                13 => 1.45,  // E3
                15 => 1.65,  // E4
                _  => 0.05 + 0.1 * tower as f64,
            }
        }
        _ => 0.05 + 0.1 * tower as f64,
    };
    // side: +1 = positive η (A-side), -1 = negative η (C-side)
    if side == -1 { -abs_eta } else { abs_eta }
}

/// Physical φ centre for a TILE cell (64 modules covering full 2π).
fn tile_phi_center(module: i32) -> f64 {
    (module as f64 + 0.5) * 2.0 * PI / 64.0
}

/// TILE cell human-readable name.
/// section=1=Barrel, side=+1=A, side=-1=C, module 0-63 → 1-64
fn tile_cell_name(section: i32, side: i32, module: i32, tower: i32, sampling: i32) -> String {
    let sector = match (section, side) {
        (1, 1)  => format!("LBA{:02}", module + 1),
        (1, -1) => format!("LBC{:02}", module + 1),
        (2, 1)  => format!("EBA{:02}", module + 1),
        (2, -1) => format!("EBC{:02}", module + 1),
        (3, 1)  => format!("EBA{:02}", module + 1),
        (3, -1) => format!("EBC{:02}", module + 1),
        _       => format!("TILE{}", module + 1),
    };
    let cell = match sampling {
        0 => format!("A{}", tower + 1),
        1 => format!("B{}", tower + 1),
        2 => format!("D{}", tower / 2),
        3 => match tower {
            10 => "E1".to_string(),
            11 => "E2".to_string(),
            13 => "E3".to_string(),
            15 => "E4".to_string(),
            _  => format!("E?"),
        },
        _ => format!("?"),
    };
    format!("{} {}", sector, cell)
}

// ─── LAr physical coordinate helpers ──────────────────────────────────────────

/// Physical η centre for a LAr EM cell given the region parameters.
/// Each ATLAS region has (eta0, deta) published in IdDictLArCalorimeter.xml.
fn lar_em_eta(be: i32, sampling: i32, region: i32, eta_idx: i32) -> f64 {
    // (eta0, deta) table from IdDictLArCalorimeter.xml regions
    // Positive side; negative side flips sign.
    let abs_be = be.abs();
    let (eta0, deta): (f64, f64) = match (abs_be, sampling, region) {
        // Barrel
        (1, 0, 0) => (0.0,       0.025),       // LArEM-barrel-00
        (1, 1, 0) => (0.003125,  0.003125),    // LArEM-barrel-10
        (1, 1, 1) => (1.4,       0.025),       // LArEM-barrel-11
        (1, 2, 0) => (0.0,       0.025),       // LArEM-barrel-20
        (1, 2, 1) => (1.4,       0.075),       // LArEM-barrel-21
        (1, 3, 0) => (0.0,       0.05),        // LArEM-barrel-30
        // Outer wheel endcap
        (2, 0, 0) => (1.5,       0.025),       // LArEM-outer-wheel-00
        (2, 1, 0) => (1.375,     0.05),        // LArEM-outer-wheel-10
        (2, 1, 1) => (1.425,     0.025),       // LArEM-outer-wheel-11
        (2, 1, 2) => (1.5,       0.003125),    // LArEM-outer-wheel-12
        (2, 1, 3) => (1.8,       0.004167),    // LArEM-outer-wheel-13
        (2, 1, 4) => (2.0,       0.00625),     // LArEM-outer-wheel-14
        (2, 1, 5) => (2.4,       0.025),       // LArEM-outer-wheel-15
        (2, 2, 0) => (1.375,     0.05),        // LArEM-outer-wheel-20
        (2, 2, 1) => (1.425,     0.025),       // LArEM-outer-wheel-21
        (2, 3, 0) => (1.5,       0.05),        // LArEM-outer-wheel-30
        // Inner wheel endcap
        (3, 1, 0) => (2.5,       0.1),         // LArEM-inner-wheel-10
        (3, 2, 0) => (2.5,       0.1),         // LArEM-inner-wheel-20
        _         => (0.0,       0.1),          // fallback
    };
    let abs_eta = eta0 + eta_idx as f64 * deta + deta / 2.0;
    if be < 0 { -abs_eta } else { abs_eta }
}

/// Physical η for LAr HEC.
fn lar_hec_eta(be: i32, sampling: i32, region: i32, eta_idx: i32) -> f64 {
    let (eta0, deta): (f64, f64) = match (sampling, region) {
        (0, 0) => (1.5, 0.1),
        (1, 0) => (1.5, 0.1),
        (2, 0) => (1.6, 0.1),
        (3, 0) => (1.7, 0.1),
        (0, 1) => (2.5, 0.2),
        (1, 1) => (2.5, 0.2),
        (2, 1) => (2.5, 0.2),
        (3, 1) => (2.5, 0.2),
        _      => (1.5, 0.1),
    };
    let abs_eta = eta0 + eta_idx as f64 * deta + deta / 2.0;
    if be < 0 { -abs_eta } else { abs_eta }
}

/// Physical η for LAr FCAL (approximate centre per module).
fn lar_fcal_eta(be: i32, module: i32, eta_idx: i32) -> f64 {
    let (eta0, deta): (f64, f64) = match module {
        1 => (3.2, 0.025),
        2 => (3.2, 0.05),
        3 => (3.2, 0.1),
        _ => (3.2, 0.05),
    };
    let abs_eta = eta0 + eta_idx as f64 * deta + deta / 2.0;
    if be < 0 { -abs_eta } else { abs_eta }
}

/// Physical φ for LAr cells given phi index and total phi bins.
fn lar_phi(phi_idx: i32, n_phi: i32) -> f64 {
    (phi_idx as f64 + 0.5) * 2.0 * PI / n_phi as f64
}

/// Rough total phi bins for LAr EM from dphi column in XML.
fn lar_em_phi_bins(be: i32, sampling: i32, region: i32) -> i32 {
    let abs_be = be.abs();
    match (abs_be, sampling, region) {
        (1, _, 1) => 256,
        (1, 2, _) => 256,
        (1, 3, _) => 256,
        (1, _, _) => 64,
        (2, 2, _) => 256,
        (2, 3, _) => 256,
        (2, _, _) => 64,
        (3, _, _) => 64,
        _         => 64,
    }
}

// ─── Core decode function ──────────────────────────────────────────────────────

pub fn decode_id(id: u64) -> ParsedId {
    let id_str = id.to_string();
    let mut fields: Vec<IdField> = Vec::new();
    let mut offset = 64usize;  // always 64-bit mode (all ATLAS IDs > 2^31)

    macro_rules! field {
        ($name:expr, $val:expr, $label:expr) => {{
            fields.push(IdField {
                name: $name.to_string(),
                value: $val,
                label: $label.to_string(),
            });
            $val
        }};
    }

    macro_rules! err {
        ($msg:expr) => {
            return ParsedId {
                id: id_str,
                valid: false,
                error: $msg.to_string(),
                fields,
                full_id: String::new(),
                cell_name: String::new(),
                subsystem: String::new(),
                eta: 0.0,
                phi: 0.0,
                summary: format!("Error: {}", $msg),
            }
        };
    }

    // ── subdet (ATLAS root, 3 bits) ───────────────────────────────────────────
    // Range: discrete[2,4,5,7,10,11,12,13], 8 values, bits=3
    let subdet_values: &[i32] = &[2, 4, 5, 7, 10, 11, 12, 13];
    let idx = extract(id, offset, 3); offset -= 3;
    let subdet = match discrete(idx, subdet_values) {
        Some(v) => v,
        None => err!(format!("Invalid subdet index {}", idx)),
    };
    let subdet_label = match subdet {
        2  => "InnerDetector",
        4  => "LArCalorimeter",
        5  => "TileCalorimeter",
        7  => "MuonSpectrometer",
        10 => "Calorimeter (dead material)",
        11 => "LArHighVoltage",
        12 => "LArElectrode",
        13 => "ForwardDetectors",
        _  => "Unknown",
    };
    field!("subdet", subdet, subdet_label);

    // ── Route by subdet ───────────────────────────────────────────────────────
    match subdet {

        // ══ TILE CALORIMETER ══════════════════════════════════════════════════
        5 => {
            // section: continuous [0..4], 5 values, bits=3
            let idx = extract(id, offset, 3); offset -= 3;
            let section = continuous(idx, 0);
            let section_label = match section {
                0 => "Online",
                1 => "Barrel",
                2 => "Extended-barrel",
                3 => "ITC-gap-scintillator",
                4 => "Testbeam",
                _ => "Unknown",
            };
            field!("section", section, section_label);

            // level1 / side: continuous [-1..10], 12 values, bits=4
            // For offline Barrel/Extended-barrel cells this is always -1 or +1
            let idx = extract(id, offset, 4); offset -= 4;
            let side = continuous(idx, -1);
            let side_label = match side {
                -1 => "negative (C-side)",
                1  => "positive (A-side)",
                _  => "online/other",
            };
            field!("side", side, side_label);

            // module: continuous [0..255], 8 bits
            let idx = extract(id, offset, 8); offset -= 8;
            let module = continuous(idx, 0);
            field!("module", module, "phi sector [0-63]");

            // tower: continuous [0..63], 6 bits
            let idx = extract(id, offset, 6); offset -= 6;
            let tower = continuous(idx, 0);
            field!("tower", tower, "eta index");

            // sampling: continuous [0..15], 4 bits
            // For real cells: 0=A-layer, 1=B/BC-layer, 2=D-layer, 3=special (E-cells)
            let idx = extract(id, offset, 4); offset -= 4;
            let sampling = continuous(idx, 0);
            let sampling_label = match (section, sampling) {
                (_, 0) => "A-layer",
                (_, 1) => "B-layer (BC in barrel)",
                (_, 2) => "D-layer",
                (_, 3) => "E-cell (gap/crack scintillator)",
                _      => "Unknown",
            };
            field!("sampling", sampling, sampling_label);

            // pmt: continuous [0..3], 2 bits (real cells use 0 or 1)
            let idx = extract(id, offset, 2); offset -= 2;
            let pmt = continuous(idx, 0);
            field!("pmt", pmt, "photomultiplier tube index");

            // adc: continuous [0..3], 2 bits (real cells use 0=high-gain, 1=low-gain)
            let idx = extract(id, offset, 2); offset -= 2;
            let adc = continuous(idx, 0);
            let adc_label = match adc {
                0 => "high gain",
                1 => "low gain",
                _ => "other",
            };
            field!("adc", adc, adc_label);

            let full_id = format!("5/{}/{}/{}/{}/{}/{}/{}", section, side, module, tower, sampling, pmt, adc);
            let cell_name = tile_cell_name(section, side, module, tower, sampling);
            let eta = tile_eta_center(section, side, tower);
            let phi = tile_phi_center(module);

            // Δη and Δφ for context
            let delta_eta = 0.1f64; // all TILE cells Δη=0.1
            let delta_phi = 2.0 * PI / 64.0;

            let summary = format!(
                "TILE CALORIMETER\n\
                 Cell:      {cell_name}\n\
                 Full ID:   {full_id}\n\
                 Section:   {} ({})\n\
                 Side:      {} ({}) \n\
                 Module:    {} (φ-sector)\n\
                 Tower:     {} (η-index)\n\
                 Sampling:  {} ({})\n\
                 PMT:       {}\n\
                 ADC:       {} ({})\n\
                 ─────────────────────\n\
                 Physical η ≈ {:.4}  Δη = {:.3}\n\
                 Physical φ ≈ {:.4} rad  Δφ = {:.4} rad",
                section, section_label,
                side, side_label,
                module,
                tower,
                sampling, sampling_label,
                pmt,
                adc, adc_label,
                eta, delta_eta,
                phi, delta_phi,
            );

            return ParsedId {
                id: id_str, valid: true, error: String::new(),
                fields, full_id, cell_name,
                subsystem: "TILECAL".to_string(),
                eta, phi, summary,
            };
        }

        // ══ LAR CALORIMETER ═══════════════════════════════════════════════════
        4 => {
            // part: discrete[-3,-2,-1,1,2,3,4,5], 8 values, bits=3
            // Values represent:
            //  -3=LArFCALdisc, -2=LArHECdisc, -1=LArEMdisc
            //   1=LArEM,        2=LArHEC,       3=LArFCAL, 4=LArOnline, 5=LArOnlineCalib
            let part_values: &[i32] = &[-3, -2, -1, 1, 2, 3, 4, 5];
            let idx = extract(id, offset, 3); offset -= 3;
            let part = match discrete(idx, part_values) {
                Some(v) => v,
                None => err!(format!("Invalid LAr part index {}", idx)),
            };
            let part_label = match part {
                1  => "LArEM (electromagnetic)",
                -1 => "LArEMdisc (disconnected EM)",
                2  => "LArHEC (hadronic end-cap)",
                -2 => "LArHECdisc (disconnected HEC)",
                3  => "LArFCAL (forward calorimeter)",
                -3 => "LArFCALdisc (disconnected FCAL)",
                4  => "LArOnline",
                5  => "LArOnlineCalib",
                _  => "Unknown",
            };
            field!("part", part, part_label);

            match part.abs() {

                // ── LAr EM (part=±1) ────────────────────────────────────────
                1 => {
                    // barrel-endcap: discrete[-3,-2,-1,1,2,3], 6 values, bits=3
                    let be_values: &[i32] = &[-3, -2, -1, 1, 2, 3];
                    let idx = extract(id, offset, 3); offset -= 3;
                    let be = match discrete(idx, be_values) {
                        Some(v) => v,
                        None => err!(format!("Invalid barrel-endcap index {}", idx)),
                    };
                    let be_label = match be {
                        -3 => "negative endcap inner wheel (C)",
                        -2 => "negative endcap outer wheel (C)",
                        -1 => "negative barrel (C-side)",
                         1 => "positive barrel (A-side)",
                         2 => "positive endcap outer wheel (A)",
                         3 => "positive endcap inner wheel (A)",
                         _ => "Unknown",
                    };
                    field!("barrel-endcap", be, be_label);

                    // sampling: continuous [0..3], 2 bits
                    let idx = extract(id, offset, 2); offset -= 2;
                    let sampling = continuous(idx, 0);
                    let samp_label = match sampling {
                        0 => "presampler (PS)",
                        1 => "front strips (S1)",
                        2 => "middle (S2)",
                        3 => "back (S3)",
                        _ => "Unknown",
                    };
                    field!("sampling", sampling, samp_label);

                    // region: continuous [0..5], 6 values, bits=3
                    let idx = extract(id, offset, 3); offset -= 3;
                    let region = continuous(idx, 0);
                    field!("region", region, "sub-region within sampling");

                    // eta: continuous [0..447], 9 bits
                    let idx = extract(id, offset, 9); offset -= 9;
                    let eta_idx = continuous(idx, 0);
                    field!("eta", eta_idx, "eta index");

                    // phi: continuous [0..255], 8 bits
                    let idx = extract(id, offset, 8); offset -= 8;
                    let phi_idx = continuous(idx, 0);
                    field!("phi", phi_idx, "phi index");

                    let full_id = format!("4/{}/{}/{}/{}/{}/{}", part, be, sampling, region, eta_idx, phi_idx);
                    let region_name = match be.abs() {
                        1 => if be > 0 { "EMBA" } else { "EMBC" },
                        2 => if be > 0 { "EMECA" } else { "EMECC" },
                        3 => if be > 0 { "EMECA (inner)" } else { "EMECC (inner)" },
                        _ => "?",
                    };
                    let cell_name = format!("{} s={} r={} η={} φ={}", region_name, sampling, region, eta_idx, phi_idx);

                    let eta = lar_em_eta(be, sampling, region, eta_idx);
                    let n_phi = lar_em_phi_bins(be, sampling, region);
                    let phi = lar_phi(phi_idx, n_phi);

                    let summary = format!(
                        "LAr ELECTROMAGNETIC CALORIMETER\n\
                         Cell:           {cell_name}\n\
                         Full ID:        {full_id}\n\
                         Part:           {} ({})\n\
                         Barrel-Endcap:  {} ({})\n\
                         Sampling:       {} ({})\n\
                         Region:         {}\n\
                         η index:        {}\n\
                         φ index:        {}\n\
                         ─────────────────────────────\n\
                         Physical η ≈ {:.4}\n\
                         Physical φ ≈ {:.4} rad",
                        part, part_label,
                        be, be_label,
                        sampling, samp_label,
                        region, eta_idx, phi_idx,
                        eta, phi,
                    );

                    return ParsedId {
                        id: id_str, valid: true, error: String::new(),
                        fields, full_id, cell_name,
                        subsystem: "LAr EM".to_string(),
                        eta, phi, summary,
                    };
                }

                // ── LAr HEC (part=±2) ────────────────────────────────────────
                2 => {
                    // barrel-endcap: discrete[-2,+2], 2 values, bits=1
                    let be_values: &[i32] = &[-2, 2];
                    let idx = extract(id, offset, 1); offset -= 1;
                    let be = match discrete(idx, be_values) {
                        Some(v) => v,
                        None => err!(format!("Invalid HEC barrel-endcap index {}", idx)),
                    };
                    let be_label = if be > 0 { "positive endcap (A/HECA)" } else { "negative endcap (C/HECC)" };
                    field!("barrel-endcap", be, be_label);

                    // sampling: continuous [0..3], 2 bits
                    let idx = extract(id, offset, 2); offset -= 2;
                    let sampling = continuous(idx, 0);
                    let samp_label = match sampling {
                        0 => "HEC front (wheel 1, front)",
                        1 => "HEC middle (wheel 1, back)",
                        2 => "HEC back (wheel 2, front)",
                        3 => "HEC rear (wheel 2, back)",
                        _ => "Unknown",
                    };
                    field!("sampling", sampling, samp_label);

                    // region: continuous [0..1], 1 bit
                    let idx = extract(id, offset, 1); offset -= 1;
                    let region = continuous(idx, 0);
                    let reg_label = match region {
                        0 => "inner (1.5 < |η| < 2.5)",
                        1 => "outer (2.5 < |η| < 3.2)",
                        _ => "Unknown",
                    };
                    field!("region", region, reg_label);

                    // eta: continuous [0..9], 4 bits
                    let idx = extract(id, offset, 4); offset -= 4;
                    let eta_idx = continuous(idx, 0);
                    field!("eta", eta_idx, "eta index");

                    // phi: continuous [0..63], 6 bits
                    let idx = extract(id, offset, 6); offset -= 6;
                    let phi_idx = continuous(idx, 0);
                    field!("phi", phi_idx, "phi index");

                    let full_id = format!("4/{}/{}/{}/{}/{}/{}", part, be, sampling, region, eta_idx, phi_idx);
                    let side_str = if be > 0 { "HECA" } else { "HECC" };
                    let cell_name = format!("{} s={} r={} η={} φ={}", side_str, sampling, region, eta_idx, phi_idx);

                    let eta = lar_hec_eta(be, sampling, region, eta_idx);
                    let n_phi = if region == 0 { 64 } else { 32 };
                    let phi = lar_phi(phi_idx, n_phi);

                    let summary = format!(
                        "LAr HADRONIC END-CAP (HEC)\n\
                         Cell:           {cell_name}\n\
                         Full ID:        {full_id}\n\
                         Part:           {} ({})\n\
                         Side:           {} ({})\n\
                         Sampling:       {} ({})\n\
                         Region:         {} ({})\n\
                         η index:        {}\n\
                         φ index:        {}\n\
                         ─────────────────────────────\n\
                         Physical η ≈ {:.4}\n\
                         Physical φ ≈ {:.4} rad",
                        part, part_label,
                        be, be_label,
                        sampling, samp_label,
                        region, reg_label,
                        eta_idx, phi_idx,
                        eta, phi,
                    );

                    return ParsedId {
                        id: id_str, valid: true, error: String::new(),
                        fields, full_id, cell_name,
                        subsystem: "LAr HEC".to_string(),
                        eta, phi, summary,
                    };
                }

                // ── LAr FCAL (part=±3) ───────────────────────────────────────
                3 => {
                    // barrel-endcap: discrete[-2,+2], 1 bit
                    let be_values: &[i32] = &[-2, 2];
                    let idx = extract(id, offset, 1); offset -= 1;
                    let be = match discrete(idx, be_values) {
                        Some(v) => v,
                        None => err!(format!("Invalid FCAL barrel-endcap index {}", idx)),
                    };
                    let be_label = if be > 0 { "positive endcap (A/FCALA)" } else { "negative endcap (C/FCALC)" };
                    field!("barrel-endcap", be, be_label);

                    // module: discrete[1,2,3], 2 bits
                    let mod_values: &[i32] = &[1, 2, 3];
                    let idx = extract(id, offset, 2); offset -= 2;
                    let module = match discrete(idx, mod_values) {
                        Some(v) => v,
                        None => err!(format!("Invalid FCAL module index {}", idx)),
                    };
                    let mod_label = match module {
                        1 => "FCAL1 (EM, copper absorber)",
                        2 => "FCAL2 (hadronic, tungsten)",
                        3 => "FCAL3 (hadronic, tungsten)",
                        _ => "Unknown",
                    };
                    field!("module", module, mod_label);

                    // eta-fcal: continuous [0..63], 6 bits
                    let idx = extract(id, offset, 6); offset -= 6;
                    let eta_fcal = continuous(idx, 0);
                    field!("eta-fcal", eta_fcal, "FCAL eta index");

                    // phi-fcal: continuous [0..15], 4 bits
                    let idx = extract(id, offset, 4); offset -= 4;
                    let phi_fcal = continuous(idx, 0);
                    field!("phi-fcal", phi_fcal, "FCAL phi index (0-15)");

                    let full_id = format!("4/{}/{}/{}/{}/{}", part, be, module, eta_fcal, phi_fcal);
                    let side_str = if be > 0 { "FCALA" } else { "FCALC" };
                    let cell_name = format!("{} m={} η={} φ={}", side_str, module, eta_fcal, phi_fcal);

                    let eta = lar_fcal_eta(be, module, eta_fcal);
                    let phi = lar_phi(phi_fcal, 16);

                    let summary = format!(
                        "LAr FORWARD CALORIMETER (FCAL)\n\
                         Cell:           {cell_name}\n\
                         Full ID:        {full_id}\n\
                         Part:           {} ({})\n\
                         Side:           {} ({})\n\
                         Module:         {} ({})\n\
                         η-FCAL index:   {}\n\
                         φ-FCAL index:   {}\n\
                         ─────────────────────────────\n\
                         Physical η ≈ {:.4}\n\
                         Physical φ ≈ {:.4} rad",
                        part, part_label,
                        be, be_label,
                        module, mod_label,
                        eta_fcal, phi_fcal,
                        eta, phi,
                    );

                    return ParsedId {
                        id: id_str, valid: true, error: String::new(),
                        fields, full_id, cell_name,
                        subsystem: "LAr FCAL".to_string(),
                        eta, phi, summary,
                    };
                }

                _ => {
                    err!(format!("LAr part {} not supported (Online/Calib IDs not decoded here)", part));
                }
            }
        }

        _ => {
            err!(format!("Subdetector {} ({}) not implemented in this parser", subdet, subdet_label));
        }
    }
}

// ─── WASM public API ──────────────────────────────────────────────────────────

/// Parse an ATLAS compact 64-bit detector ID.
/// Returns a JSON string with all decoded fields, physical coordinates, and a summary.
///
/// # Arguments
/// * `id_str` - 64-bit unsigned integer as decimal string (e.g. "4899916394579099648")
#[wasm_bindgen]
pub fn parse_atlas_id(id_str: &str) -> JsValue {
    let id: u64 = match id_str.trim().parse() {
        Ok(v) => v,
        Err(e) => {
            let result = ParsedId {
                id: id_str.to_string(),
                valid: false,
                error: format!("Cannot parse '{}' as u64: {}", id_str, e),
                fields: vec![],
                full_id: String::new(),
                cell_name: String::new(),
                subsystem: String::new(),
                eta: 0.0,
                phi: 0.0,
                summary: format!("Parse error: {}", e),
            };
            return serde_wasm_bindgen::to_value(&result).unwrap();
        }
    };

    let result = decode_id(id);
    serde_wasm_bindgen::to_value(&result).unwrap()
}

// ─── ID Encoder (for testing and UI examples) ────────────────────────────────

/// Encode a TILE offline cell ID from its logical fields.
///
/// # Arguments
/// * `section`  — 0=Online, 1=Barrel, 2=Extended-barrel, 3=ITC, 4=Testbeam
/// * `side`     — -1=C-side, +1=A-side
/// * `module`   — 0..63
/// * `tower`    — 0..15
/// * `sampling` — 0=A, 1=B/BC, 2=D, 3=E
/// * `pmt`      — 0 or 1
/// * `adc`      — 0=high-gain, 1=low-gain
pub fn encode_tile_id(section: i32, side: i32, module: i32, tower: i32, sampling: i32, pmt: i32, adc: i32) -> u64 {
    // subdet=5 → index 2 in [2,4,5,7,10,11,12,13]
    let subdet_idx: u64 = 2;
    // section: continuous [0..4], index = section
    let section_idx: u64 = section as u64;
    // side: continuous [-1..10], index = side - (-1) = side + 1
    let side_idx: u64 = (side + 1) as u64;
    // module: continuous [0..255], index = module
    let module_idx: u64 = module as u64;
    // tower: continuous [0..63], index = tower
    let tower_idx: u64 = tower as u64;
    // sampling: continuous [0..15], index = sampling
    let sampling_idx: u64 = sampling as u64;
    // pmt: continuous [0..3], index = pmt
    let pmt_idx: u64 = pmt as u64;
    // adc: continuous [0..3], index = adc
    let adc_idx: u64 = adc as u64;

    (subdet_idx  << 61) |
    (section_idx << 58) |
    (side_idx    << 54) |
    (module_idx  << 46) |
    (tower_idx   << 40) |
    (sampling_idx<< 36) |
    (pmt_idx     << 34) |
    (adc_idx     << 32)
}

/// Return a JSON array of example IDs for the UI.
#[wasm_bindgen]
pub fn example_ids() -> JsValue {
    #[derive(Serialize)]
    struct Example { label: String, id: String }

    let examples = vec![
        Example { label: "TILE LBC01 A1  (Barrel C-side, module=0, tower=0, A-layer)".into(),
                  id: encode_tile_id(1, -1, 0, 0, 0, 0, 0).to_string() },
        Example { label: "TILE LBA01 A1  (Barrel A-side, module=0, tower=0, A-layer)".into(),
                  id: encode_tile_id(1, 1, 0, 0, 0, 0, 0).to_string() },
        Example { label: "TILE LBC32 B5  (Barrel C-side, module=31, tower=4, B-layer)".into(),
                  id: encode_tile_id(1, -1, 31, 4, 1, 0, 0).to_string() },
        Example { label: "TILE LBA64 D3  (Barrel A-side, module=63, tower=6, D-layer)".into(),
                  id: encode_tile_id(1, 1, 63, 6, 2, 0, 0).to_string() },
        Example { label: "TILE EBC01 A11 (Extended Barrel C-side, module=0, tower=10)".into(),
                  id: encode_tile_id(2, -1, 0, 10, 0, 0, 0).to_string() },
        Example { label: "TILE EBA32 B12 (Extended Barrel A-side, module=31, tower=11, B-layer)".into(),
                  id: encode_tile_id(2, 1, 31, 11, 1, 0, 0).to_string() },
        Example { label: "TILE ITC EBA01 E1  (ITC/gap E1 scintillator)".into(),
                  id: encode_tile_id(3, 1, 0, 10, 3, 0, 0).to_string() },
    ];

    serde_wasm_bindgen::to_value(&examples).unwrap()
}

// ─── Native tests ─────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tile_lbc01_a1() {
        // ID: 4899916394579099648  = 0x4400000000000000
        // Expected: TileCalorimeter / Barrel / C-side / module=0 / tower=0 / sampling=0 / pmt=0 / adc=0
        let result = decode_id(4899916394579099648u64);
        assert!(result.valid, "Should be valid: {}", result.error);
        assert_eq!(result.subsystem, "TILECAL");
        assert_eq!(result.full_id, "5/1/-1/0/0/0/0/0");
        assert_eq!(result.cell_name, "LBC01 A1");
        assert!((result.eta - (-0.05)).abs() < 0.01, "eta = {}", result.eta);
    }

    #[test]
    fn test_encoder_roundtrip() {
        // Encode then decode and check round-trip
        let cases = vec![
            (1, -1, 0, 0, 0, 0, 0, "LBC01", "A1"),
            (1,  1, 0, 0, 0, 0, 0, "LBA01", "A1"),
            (1, -1, 31, 4, 1, 0, 0, "LBC32", "B5"),
            (1,  1, 63, 6, 2, 0, 0, "LBA64", "D3"),
            (2, -1, 0, 10, 0, 0, 0, "EBC01", "A11"),
        ];
        for (sec, side, module, tower, samp, pmt, adc, _sector, _cell) in cases {
            let id = encode_tile_id(sec, side, module, tower, samp, pmt, adc);
            let r = decode_id(id);
            assert!(r.valid, "Invalid for sec={sec} side={side} mod={module} tow={tower} samp={samp}: {}", r.error);
            assert_eq!(r.subsystem, "TILECAL");
            // Check each decoded field
            let f = |name: &str| r.fields.iter().find(|f| f.name == name).map(|f| f.value).unwrap_or(i32::MIN);
            assert_eq!(f("section"), sec, "section mismatch");
            assert_eq!(f("side"), side, "side mismatch");
            assert_eq!(f("module"), module, "module mismatch");
            assert_eq!(f("tower"), tower, "tower mismatch");
            assert_eq!(f("sampling"), samp, "sampling mismatch");
        }
    }

    #[test]
    fn test_bit_extraction() {
        let id = 0x4400000000000000u64;
        assert_eq!(extract(id, 64, 3), 2);  // subdet index 2 → value 5
        assert_eq!(extract(id, 61, 3), 1);  // section index 1 → value 1 (Barrel)
        assert_eq!(extract(id, 58, 4), 0);  // side index 0 → value -1 (negative)
        assert_eq!(extract(id, 54, 8), 0);  // module = 0
        assert_eq!(extract(id, 46, 6), 0);  // tower = 0
        assert_eq!(extract(id, 40, 4), 0);  // sampling = 0
        assert_eq!(extract(id, 36, 2), 0);  // pmt = 0
        assert_eq!(extract(id, 34, 2), 0);  // adc = 0
    }
}
