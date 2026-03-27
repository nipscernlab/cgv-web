use wasm_bindgen::prelude::*;
use std::f32::consts::PI;
use std::collections::HashMap;

// ═══════════════════════════════════════════════════════════════════════════════
//  TILE CAL  –  tabela estática (inalterada)
// ═══════════════════════════════════════════════════════════════════════════════

struct TileCell {
    sub:       u8,
    eta_c:     f32,
    tile_vol:  &'static str,
    eta_i:     u8,
    phi_n:     u8,
    cell_name: &'static str,
}

static TILE_CELLS: &[TileCell] = &[
    // ── sub=3: LBA (η > 0) ─────────────────────────────────────────────────
    TileCell { sub:3, eta_c: 0.05, tile_vol:"Tile1p",  eta_i:0, phi_n:64, cell_name:"A1"  },
    TileCell { sub:3, eta_c: 0.15, tile_vol:"Tile1p",  eta_i:1, phi_n:64, cell_name:"A2"  },
    TileCell { sub:3, eta_c: 0.25, tile_vol:"Tile1p",  eta_i:2, phi_n:64, cell_name:"A3"  },
    TileCell { sub:3, eta_c: 0.35, tile_vol:"Tile1p",  eta_i:3, phi_n:64, cell_name:"A4"  },
    TileCell { sub:3, eta_c: 0.45, tile_vol:"Tile1p",  eta_i:4, phi_n:64, cell_name:"A5"  },
    TileCell { sub:3, eta_c: 0.55, tile_vol:"Tile1p",  eta_i:5, phi_n:64, cell_name:"A6"  },
    TileCell { sub:3, eta_c: 0.65, tile_vol:"Tile1p",  eta_i:6, phi_n:64, cell_name:"A7"  },
    TileCell { sub:3, eta_c: 0.75, tile_vol:"Tile1p",  eta_i:7, phi_n:64, cell_name:"A8"  },
    TileCell { sub:3, eta_c: 0.85, tile_vol:"Tile1p",  eta_i:8, phi_n:64, cell_name:"A9"  },
    TileCell { sub:3, eta_c: 0.95, tile_vol:"Tile1p",  eta_i:9, phi_n:64, cell_name:"A10" },
    TileCell { sub:3, eta_c: 0.05, tile_vol:"Tile23p", eta_i:0, phi_n:64, cell_name:"BC1" },
    TileCell { sub:3, eta_c: 0.15, tile_vol:"Tile23p", eta_i:1, phi_n:64, cell_name:"BC2" },
    TileCell { sub:3, eta_c: 0.25, tile_vol:"Tile23p", eta_i:2, phi_n:64, cell_name:"BC3" },
    TileCell { sub:3, eta_c: 0.35, tile_vol:"Tile23p", eta_i:3, phi_n:64, cell_name:"BC4" },
    TileCell { sub:3, eta_c: 0.45, tile_vol:"Tile23p", eta_i:4, phi_n:64, cell_name:"BC5" },
    TileCell { sub:3, eta_c: 0.55, tile_vol:"Tile23p", eta_i:5, phi_n:64, cell_name:"BC6" },
    TileCell { sub:3, eta_c: 0.65, tile_vol:"Tile23p", eta_i:6, phi_n:64, cell_name:"BC7" },
    TileCell { sub:3, eta_c: 0.75, tile_vol:"Tile23p", eta_i:7, phi_n:64, cell_name:"BC8" },
    TileCell { sub:3, eta_c: 0.85, tile_vol:"Tile23p", eta_i:8, phi_n:64, cell_name:"B9"  },
    TileCell { sub:3, eta_c: 0.00, tile_vol:"Tile4p",  eta_i:0, phi_n:64, cell_name:"D0"  },
    TileCell { sub:3, eta_c: 0.20, tile_vol:"Tile4p",  eta_i:1, phi_n:64, cell_name:"D1"  },
    TileCell { sub:3, eta_c: 0.40, tile_vol:"Tile4p",  eta_i:2, phi_n:64, cell_name:"D2"  },
    TileCell { sub:3, eta_c: 0.60, tile_vol:"Tile4p",  eta_i:3, phi_n:64, cell_name:"D3"  },
    // ── sub=2: LBC (η < 0) ─────────────────────────────────────────────────
    TileCell { sub:2, eta_c:-0.05, tile_vol:"Tile1n",  eta_i:0, phi_n:64, cell_name:"A1"  },
    TileCell { sub:2, eta_c:-0.15, tile_vol:"Tile1n",  eta_i:1, phi_n:64, cell_name:"A2"  },
    TileCell { sub:2, eta_c:-0.25, tile_vol:"Tile1n",  eta_i:2, phi_n:64, cell_name:"A3"  },
    TileCell { sub:2, eta_c:-0.35, tile_vol:"Tile1n",  eta_i:3, phi_n:64, cell_name:"A4"  },
    TileCell { sub:2, eta_c:-0.45, tile_vol:"Tile1n",  eta_i:4, phi_n:64, cell_name:"A5"  },
    TileCell { sub:2, eta_c:-0.55, tile_vol:"Tile1n",  eta_i:5, phi_n:64, cell_name:"A6"  },
    TileCell { sub:2, eta_c:-0.65, tile_vol:"Tile1n",  eta_i:6, phi_n:64, cell_name:"A7"  },
    TileCell { sub:2, eta_c:-0.75, tile_vol:"Tile1n",  eta_i:7, phi_n:64, cell_name:"A8"  },
    TileCell { sub:2, eta_c:-0.85, tile_vol:"Tile1n",  eta_i:8, phi_n:64, cell_name:"A9"  },
    TileCell { sub:2, eta_c:-0.95, tile_vol:"Tile1n",  eta_i:9, phi_n:64, cell_name:"A10" },
    TileCell { sub:2, eta_c:-0.05, tile_vol:"Tile23n", eta_i:0, phi_n:64, cell_name:"BC1" },
    TileCell { sub:2, eta_c:-0.15, tile_vol:"Tile23n", eta_i:1, phi_n:64, cell_name:"BC2" },
    TileCell { sub:2, eta_c:-0.25, tile_vol:"Tile23n", eta_i:2, phi_n:64, cell_name:"BC3" },
    TileCell { sub:2, eta_c:-0.35, tile_vol:"Tile23n", eta_i:3, phi_n:64, cell_name:"BC4" },
    TileCell { sub:2, eta_c:-0.45, tile_vol:"Tile23n", eta_i:4, phi_n:64, cell_name:"BC5" },
    TileCell { sub:2, eta_c:-0.55, tile_vol:"Tile23n", eta_i:5, phi_n:64, cell_name:"BC6" },
    TileCell { sub:2, eta_c:-0.65, tile_vol:"Tile23n", eta_i:6, phi_n:64, cell_name:"BC7" },
    TileCell { sub:2, eta_c:-0.75, tile_vol:"Tile23n", eta_i:7, phi_n:64, cell_name:"BC8" },
    TileCell { sub:2, eta_c:-0.85, tile_vol:"Tile23n", eta_i:8, phi_n:64, cell_name:"B9"  },
    TileCell { sub:2, eta_c:-0.20, tile_vol:"Tile4n",  eta_i:1, phi_n:64, cell_name:"D1"  },
    TileCell { sub:2, eta_c:-0.40, tile_vol:"Tile4n",  eta_i:2, phi_n:64, cell_name:"D2"  },
    TileCell { sub:2, eta_c:-0.60, tile_vol:"Tile4n",  eta_i:3, phi_n:64, cell_name:"D3"  },
    // ── sub=5: EBA regular (η > 0) ─────────────────────────────────────────
    TileCell { sub:5, eta_c: 1.0587, tile_vol:"Tile5p",  eta_i:0, phi_n:64, cell_name:"A12" },
    TileCell { sub:5, eta_c: 1.1594, tile_vol:"Tile5p",  eta_i:1, phi_n:64, cell_name:"A13" },
    TileCell { sub:5, eta_c: 1.2587, tile_vol:"Tile5p",  eta_i:2, phi_n:64, cell_name:"A14" },
    TileCell { sub:5, eta_c: 1.3579, tile_vol:"Tile5p",  eta_i:3, phi_n:64, cell_name:"A15" },
    TileCell { sub:5, eta_c: 1.4573, tile_vol:"Tile5p",  eta_i:4, phi_n:64, cell_name:"A16" },
    TileCell { sub:5, eta_c: 1.1580, tile_vol:"Tile6p",  eta_i:1, phi_n:64, cell_name:"B12" },
    TileCell { sub:5, eta_c: 1.2574, tile_vol:"Tile6p",  eta_i:2, phi_n:64, cell_name:"B13" },
    TileCell { sub:5, eta_c: 1.3568, tile_vol:"Tile6p",  eta_i:3, phi_n:64, cell_name:"B14" },
    TileCell { sub:5, eta_c: 1.4562, tile_vol:"Tile6p",  eta_i:4, phi_n:64, cell_name:"B15" },
    TileCell { sub:5, eta_c: 1.0074, tile_vol:"Tile8p",  eta_i:0, phi_n:64, cell_name:"D4"  },
    TileCell { sub:5, eta_c: 1.2064, tile_vol:"Tile7p",  eta_i:0, phi_n:64, cell_name:"D5"  },
    TileCell { sub:5, eta_c: 1.5566, tile_vol:"Tile7p",  eta_i:1, phi_n:64, cell_name:"D6"  },
    // ── sub=0: EBC regular (η < 0) ─────────────────────────────────────────
    TileCell { sub:0, eta_c:-1.0565, tile_vol:"Tile5n",  eta_i:0, phi_n:64, cell_name:"A12" },
    TileCell { sub:0, eta_c:-1.1570, tile_vol:"Tile5n",  eta_i:1, phi_n:64, cell_name:"A13" },
    TileCell { sub:0, eta_c:-1.2565, tile_vol:"Tile5n",  eta_i:2, phi_n:64, cell_name:"A14" },
    TileCell { sub:0, eta_c:-1.3559, tile_vol:"Tile5n",  eta_i:3, phi_n:64, cell_name:"A15" },
    TileCell { sub:0, eta_c:-1.4554, tile_vol:"Tile5n",  eta_i:4, phi_n:64, cell_name:"A16" },
    TileCell { sub:0, eta_c:-1.1560, tile_vol:"Tile6n",  eta_i:1, phi_n:64, cell_name:"B12" },
    TileCell { sub:0, eta_c:-1.2555, tile_vol:"Tile6n",  eta_i:2, phi_n:64, cell_name:"B13" },
    TileCell { sub:0, eta_c:-1.3551, tile_vol:"Tile6n",  eta_i:3, phi_n:64, cell_name:"B14" },
    TileCell { sub:0, eta_c:-1.4546, tile_vol:"Tile6n",  eta_i:4, phi_n:64, cell_name:"B15" },
    TileCell { sub:0, eta_c:-1.0056, tile_vol:"Tile8n",  eta_i:0, phi_n:64, cell_name:"D4"  },
    TileCell { sub:0, eta_c:-1.2048, tile_vol:"Tile7n",  eta_i:0, phi_n:64, cell_name:"D5"  },
    TileCell { sub:0, eta_c:-1.5550, tile_vol:"Tile7n",  eta_i:1, phi_n:64, cell_name:"D6"  },
    // ── sub=4: EBA especial (η > 0) ────────────────────────────────────────
    TileCell { sub:4, eta_c: 0.8580, tile_vol:"Tile9p",  eta_i:0, phi_n:64, cell_name:"C10" },
    TileCell { sub:4, eta_c: 0.9584, tile_vol:"Tile6p",  eta_i:0, phi_n:64, cell_name:"B11" },
    TileCell { sub:4, eta_c: 1.0589, tile_vol:"Tile10p", eta_i:0, phi_n:64, cell_name:"E1"  },
    TileCell { sub:4, eta_c: 1.1593, tile_vol:"Tile11p", eta_i:0, phi_n:64, cell_name:"E2"  },
    TileCell { sub:4, eta_c: 1.3098, tile_vol:"Tile12p", eta_i:0, phi_n:64, cell_name:"E3"  },
    TileCell { sub:4, eta_c: 1.5104, tile_vol:"Tile13p", eta_i:0, phi_n:64, cell_name:"E4"  },
    // ── sub=1: EBC especial (η < 0) ────────────────────────────────────────
    TileCell { sub:1, eta_c:-0.8560, tile_vol:"Tile9n",  eta_i:0, phi_n:64, cell_name:"C10" },
    TileCell { sub:1, eta_c:-0.9563, tile_vol:"Tile6n",  eta_i:0, phi_n:64, cell_name:"B11" },
    TileCell { sub:1, eta_c:-1.0567, tile_vol:"Tile10n", eta_i:0, phi_n:64, cell_name:"E1"  },
    TileCell { sub:1, eta_c:-1.1570, tile_vol:"Tile11n", eta_i:0, phi_n:64, cell_name:"E2"  },
    TileCell { sub:1, eta_c:-1.3074, tile_vol:"Tile12n", eta_i:0, phi_n:64, cell_name:"E3"  },
    TileCell { sub:1, eta_c:-1.5078, tile_vol:"Tile13n", eta_i:0, phi_n:64, cell_name:"E4"  },
    // ── sub=6: MBTS-A (η > 0, φ_n=8) ──────────────────────────────────────
    TileCell { sub:6, eta_c: 2.40, tile_vol:"Tile14p", eta_i:0, phi_n:8, cell_name:"MBTS2" },
    TileCell { sub:6, eta_c: 3.20, tile_vol:"Tile15p", eta_i:0, phi_n:8, cell_name:"MBTS1" },
    // ── sub=7: MBTS-C (η < 0, φ_n=8) ──────────────────────────────────────
    TileCell { sub:7, eta_c:-2.40, tile_vol:"Tile14n", eta_i:0, phi_n:8, cell_name:"MBTS2" },
    TileCell { sub:7, eta_c:-3.20, tile_vol:"Tile15n", eta_i:0, phi_n:8, cell_name:"MBTS1" },
];

fn lookup_tile_cell_nth(
    hit_eta: f32, hit_phi: f32, hit_sub: u8, nth: usize,
) -> Option<(String, &'static str)> {
    let min_dist = TILE_CELLS.iter()
        .filter(|c| c.sub == hit_sub)
        .map(|c| (c.eta_c - hit_eta).abs())
        .fold(f32::INFINITY, f32::min);
    if min_dist.is_infinite() { return None; }
    let tol = min_dist + 0.0005;
    let candidates: Vec<&TileCell> = TILE_CELLS.iter()
        .filter(|c| c.sub == hit_sub && (c.eta_c - hit_eta).abs() <= tol)
        .collect();
    let cell = candidates[nth % candidates.len()];
    let phi_n = cell.phi_n as f32;
    let raw = ((hit_phi + PI) * phi_n / (2.0 * PI)).floor() as i32;
    let j = raw.rem_euclid(cell.phi_n as i32) as usize;
    let vol = cell.tile_vol;
    let i = cell.eta_i as usize;
    Some((
        format!("Calorimeter\u{2192}{vol}_0\u{2192}{vol}{i}_{i}\u{2192}cell_{j}"),
        cell.cell_name,
    ))
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LAr EM  –  decodificação direta do ID (bit-shifting de CaloGeoXML.C)
//  Não usa eta/phi do XML — extrai layer, eta_idx, phi_idx, barrel/endcap do ID
// ═══════════════════════════════════════════════════════════════════════════════

const LABA_SIZES: [usize; 4] = [61, 451, 57, 27];
const LAEB_SIZES: [usize; 4] = [12, 216, 51, 34];
const LAR_PHI_BARREL: [usize; 4] = [64, 64, 256, 256];
const LAR_PHI_ENDCAP: [usize; 4] = [64, 64, 256, 256];
const LAR_NAMES: [&str; 4] = ["PS", "S1", "S2", "S3"];

// Tabelas de decodificação do compact identifier (CaloGeoXML.C)
const LAR_PART: [i32; 8] = [-3, -2, -1, 1, 2, 3, 4, 5];
const LAR_BARREL_ENDCAP: [i32; 6] = [-3, -2, -1, 1, 2, 3];

struct LarDecoded {
    barrel: bool,
    side:   bool,    // true = eta positivo
    layer:  usize,
    eta:    usize,
    phi:    usize,
}

/// Decodifica o compact identifier do LAr EM (lógica de CaloGeoXML.C).
/// Retorna None para células filtradas (barrel region==1) ou partições não tratadas.
fn decode_lar_id(id: i64) -> Option<LarDecoded> {
    let part_idx = ((id >> 26) & 7) as usize;
    if part_idx >= 8 { return None; }
    let larpart = LAR_PART[part_idx];

    let be_idx = ((id >> 23) & 7) as usize;
    if be_idx >= 6 { return None; }
    let barrel_endcap = LAR_BARREL_ENDCAP[be_idx];

    // Região — pula barrel region==1 (gap)
    let larregion = match larpart {
        1 => ((id >> 18) & 7) as i32,
        2 => ((id >> 22) & 1) as i32,
        _ => -1,
    };
    if barrel_endcap.unsigned_abs() == 1 && larregion == 1 {
        return None;
    }

    // Decodifica eta, layer, phi conforme larpart
    let eta = match larpart {
        1 => ((id >>  9) & 511) as usize,
        2 => ((id >> 18) &  15) as usize,
        3 => ((id >> 17) &  63) as usize,
        _ => return None,
    };
    let layer = match larpart {
        1     => ((id >> 21) & 3) as usize,
        2 | 3 => ((id >> 23) & 3) as usize,
        _     => return None,
    };
    let phi = match larpart {
        1 => ((id >>  1) & 255) as usize,
        2 => ((id >> 12) &  63) as usize,
        3 => ((id >> 13) &  15) as usize,
        _ => return None,
    };

    let barrel = barrel_endcap.unsigned_abs() == 1;
    let side   = barrel_endcap > 0;

    Some(LarDecoded { barrel, side, layer, eta, phi })
}

/// Converte célula LAr decodificada em (CGV path, label) para o visualizador.
fn lar_id_to_path(d: &LarDecoded) -> Option<(String, String)> {
    let s = if d.side { "p" } else { "n" };

    if d.barrel {
        let phi_size = LAR_PHI_BARREL[d.layer];
        if d.eta >= LABA_SIZES[d.layer] || d.phi >= phi_size { return None; }
        let j = phi_size - 1 - d.phi;

        let vol = format!("EMBarrel{}{}", d.layer, s);
        let label = format!("EMB {} η{}", LAR_NAMES[d.layer], d.eta);

        // cell2_ para células na região de overlap (CaloBuild.C)
        let pfx = match d.layer {
            1 if d.eta >= 450 => "cell2_",
            2 if d.eta >= 53  => "cell2_",
            3 if d.eta >= 25  => "cell2_",
            _                 => "cell_",
        };
        Some((
            format!("Calorimeter\u{2192}{vol}_0\u{2192}{vol}{}_{}\u{2192}{pfx}{j}", d.eta, d.eta),
            label,
        ))
    } else {
        let phi_size = LAR_PHI_ENDCAP[d.layer];
        if d.eta >= LAEB_SIZES[d.layer] || d.phi >= phi_size { return None; }
        let j = phi_size - 1 - d.phi;

        let vol = format!("EMEndCap{}{}", d.layer, s);
        let label = format!("EMEC {} η{}", LAR_NAMES[d.layer], d.eta);

        // CaloBuild.C: cell2_ para i < 3, cell_ para i >= 3
        let pfx = if d.eta < 3 { "cell2_" } else { "cell_" };
        Some((
            format!("Calorimeter\u{2192}{vol}_1\u{2192}{vol}{}_{}\u{2192}{pfx}{j}", d.eta, d.eta),
            label,
        ))
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  HEC  –  geometria computada de CaloGeoConst.h + CaloBuild.C
// ═══════════════════════════════════════════════════════════════════════════════

/// HECz[7][14] — posição radial (r em mm) de cada célula HEC.
/// Indexação: HECz[real_layer_0based][cell_index]
static HECZ: [[f32; 14]; 7] = [
    [1953.63, 1777.76, 1597.56, 1437.47, 1294.76, 1167.21, 1052.94, 950.382, 858.205, 775.278, 668.405, 545.996, 446.465, 386.875],
    [2008.09, 1881.11, 1690.42, 1521.01, 1370.00, 1235.03, 1114.11, 1005.59, 908.060, 820.287, 707.225, 577.746, 502.371, 0.0],
    [1951.08, 1774.10, 1596.30, 1437.80, 1296.15, 1169.26, 1060.37, 958.008, 860.888, 742.229, 606.344, 515.234, 0.0, 0.0],
    [2008.26, 1882.60, 1693.79, 1525.52, 1375.14, 1240.45, 1119.58, 1010.96, 913.220, 787.548, 643.565, 531.973, 0.0, 0.0],
    [1947.43, 1768.06, 1592.41, 1435.44, 1294.84, 1168.68, 1055.29, 953.266, 822.083, 671.786, 549.312, 0.0, 0.0, 0.0],
    [1986.52, 1842.34, 1659.31, 1495.74, 1349.24, 1217.77, 1099.62, 993.312, 856.619, 700.007, 572.389, 500.028, 0.0, 0.0],
    [1916.61, 1726.20, 1556.04, 1403.63, 1266.87, 1143.96, 1033.36, 891.153, 728.228, 595.465, 510.411, 0.0, 0.0, 0.0],
];
/// Nº de células por camada real (0-6)
#[allow(dead_code)]
static HEC_SIZES: [usize; 7] = [14, 13, 12, 12, 11, 12, 11];

/// HEC volume definitions matching CaloBuild.C structure.
/// For BuildHEC volumes: single layer, eta_count = HEC_SIZES[layer].
/// For MergeHEC volumes: two layers merged, eta_count = 1 + HEC_SIZES[layer2].
///   eta 0 → outermost cell from layer1
///   eta i (i≥1) → merged cell using layer1[i] + layer2[i-1]
struct HecVol {
    name:      &'static str,
    eta_count: usize,
    /// (real_layer_0based, z_center_mm) pairs; BuildHEC has 1, MergeHEC has 2
    segments:  &'static [(usize, f32)],
}

static HEC_VOLS: [HecVol; 4] = [
    HecVol { name: "HEC1",  eta_count: 14, segments: &[(0, 4490.0)] },
    HecVol { name: "HEC23", eta_count: 13, segments: &[(1, 4747.5), (2, 4982.5)] },
    HecVol { name: "HEC45", eta_count: 12, segments: &[(3, 5245.0), (4, 5475.0)] },
    HecVol { name: "HEC67", eta_count: 12, segments: &[(5, 5705.0), (6, 5935.0)] },
];

/// Computa η a partir de (r, z): η = -ln(tan(atan2(r, z)/2))
fn r_z_to_eta(r: f32, z: f32) -> f32 {
    let theta = r.atan2(z);
    -(theta * 0.5).tan().ln()
}

fn lookup_hec(hit_eta: f32, hit_phi: f32, nth: usize) -> Option<(String, String)> {
    let abs_eta = hit_eta.abs();
    if abs_eta < 1.4 || abs_eta > 3.3 { return None; }
    let side = if hit_eta >= 0.0 { "p" } else { "n" };

    struct Cand { vol_idx: usize, eta_i: usize, dist: f32 }
    let mut best_dist = f32::INFINITY;
    let mut cands: Vec<Cand> = Vec::with_capacity(8);

    for (vi, vol) in HEC_VOLS.iter().enumerate() {
        // Compute representative eta for each eta_index in this merged volume.
        // For BuildHEC (1 segment): eta_i maps directly to HECz[layer][eta_i]
        // For MergeHEC (2 segments): eta_0 uses layer1[0], eta_i (i≥1) averages layer1[i] + layer2[i-1]
        let n = vol.eta_count;
        for ei in 0..n {
            let cell_eta = if vol.segments.len() == 1 {
                let (rl, zc) = vol.segments[0];
                r_z_to_eta(HECZ[rl][ei], zc)
            } else {
                let (rl1, zc1) = vol.segments[0];
                let (rl2, zc2) = vol.segments[1];
                if ei == 0 {
                    r_z_to_eta(HECZ[rl1][0], zc1)
                } else {
                    // Merged cell: average eta from both layers
                    let e1 = r_z_to_eta(HECZ[rl1][ei], zc1);
                    let e2 = r_z_to_eta(HECZ[rl2][ei - 1], zc2);
                    (e1 + e2) * 0.5
                }
            };
            let d = (cell_eta - abs_eta).abs();
            if d < 0.08 {
                if d < best_dist { best_dist = d; }
                cands.push(Cand { vol_idx: vi, eta_i: ei, dist: d });
            }
        }
    }
    if cands.is_empty() { return None; }
    cands.retain(|c| c.dist <= best_dist + 0.005);
    cands.sort_by(|a, b| a.dist.partial_cmp(&b.dist).unwrap());
    let c = &cands[nth % cands.len()];

    let vol_name = HEC_VOLS[c.vol_idx].name;
    let raw = ((hit_phi + PI) * 64.0 / (2.0 * PI)).floor() as i32;
    let j = raw.rem_euclid(64) as usize;
    let ei = c.eta_i;
    let vol = format!("{}{}", vol_name, side);
    let label = format!("{} η{}", vol_name, ei);
    // MergeHEC copy number: CaloBuild.C AddNode(etaslice, i) where i=0 for eta 0,
    // and i=0..N-1 for merged cells (eta 1..N). So copy = max(0, ei-1) for merged.
    // BuildHEC: copy = ei directly.
    let is_merged = HEC_VOLS[c.vol_idx].segments.len() > 1;
    let copy = if is_merged && ei > 0 { ei - 1 } else { ei };
    Some((
        format!("Calorimeter\u{2192}{vol}_0\u{2192}{vol}{ei}_{copy}\u{2192}cell_{j}"),
        label,
    ))
}

// ═══════════════════════════════════════════════════════════════════════════════
//  API pública
// ═══════════════════════════════════════════════════════════════════════════════

#[wasm_bindgen]
pub fn load_cgv(cgv_text: &str) -> usize {
    cgv_text.lines()
        .filter(|l| {
            let t = l.trim();
            !t.is_empty() && !t.starts_with('#') && {
                let last = t.split('\t')
                    .filter(|s| !s.trim().is_empty() && *s != "\u{2192}")
                    .last();
                last.map(|s| s.starts_with("cell")).unwrap_or(false)
            }
        })
        .count()
}

#[wasm_bindgen]
pub fn process_event(xml_text: &str) -> String {
    let mut hits     = String::with_capacity(512 * 1024);
    let mut mapped   = 0usize;
    let mut unmapped = 0usize;
    let mut e_min_g  = f32::INFINITY;
    let mut e_max_g  = f32::NEG_INFINITY;
    let mut tile_mapped   = 0usize;
    let mut tile_unmapped = 0usize;
    let mut mbts_mapped   = 0usize;
    let mut lar_mapped    = 0usize;
    let mut lar_unmapped  = 0usize;
    let mut hec_mapped    = 0usize;
    let mut hec_unmapped  = 0usize;

    // ── 1. TILE ─────────────────────────────────────────────────────────────
    if let Some((energy, eta, phi, sub)) = parse_calo_arrays(xml_text, "TILE", &["energy","eta","phi","sub"]) {
        let n = energy.len().min(eta.len()).min(phi.len()).min(sub.len());
        for v in &energy[..n] { e_min_g = e_min_g.min(*v); e_max_g = e_max_g.max(*v); }

        let mut seen: HashMap<(i32, u8, u8), usize> = HashMap::new();
        for i in 0..n {
            let hit_sub = sub[i].round() as u8;
            let hit_eta = eta[i];
            let hit_phi = phi[i];
            let phi_j_key = {
                let raw = ((hit_phi + PI) * 64.0 / (2.0 * PI)).floor() as i32;
                raw.rem_euclid(64) as u8
            };
            let eta_key  = (hit_eta * 1000.0).round() as i32;
            let seen_key = (eta_key, phi_j_key, hit_sub);
            let nth = *seen.get(&seen_key).unwrap_or(&0);
            seen.insert(seen_key, nth + 1);

            match lookup_tile_cell_nth(hit_eta, hit_phi, hit_sub, nth) {
                Some((path, cell_name)) => {
                    append_hit(&mut hits, &path, energy[i], hit_eta, hit_phi, cell_name, "TILE");
                    tile_mapped += 1;
                    mapped += 1;
                }
                None => { tile_unmapped += 1; unmapped += 1; }
            }
        }
    }

    // ── 2. MBTS ─────────────────────────────────────────────────────────────
    if let Some((me, mch, mmd, meta, mph)) = parse_mbts_arrays(xml_text) {
        for v in &me { e_min_g = e_min_g.min(*v); e_max_g = e_max_g.max(*v); }
        let n = me.len().min(mch.len()).min(mmd.len()).min(meta.len());
        for i in 0..n {
            let ch   = mch[i].round() as i32;
            let md   = mmd[i].round() as usize;
            let side = if meta[i] >= 0.0 { "p" } else { "n" };
            let (vol, cell_name, eta_out) = match ch {
                0 => (format!("Tile14{side}"), "MBTS2", if meta[i] >= 0.0 { 2.40_f32 } else { -2.40 }),
                1 => (format!("Tile15{side}"), "MBTS1", if meta[i] >= 0.0 { 3.20_f32 } else { -3.20 }),
                _ => continue,
            };
            let phi_out = if i < mph.len() { mph[i] } else { 0.0 };
            let path = format!("Calorimeter\u{2192}{vol}_0\u{2192}{vol}0_0\u{2192}cell_{md}");
            append_hit(&mut hits, &path, me[i], eta_out, phi_out, cell_name, "MBTS");
            mbts_mapped += 1;
            mapped += 1;
        }
    }

    // ── 3. LAr  (decodificação via ID — CaloGeoXML.C) ──────────────────────
    if let Some((energy, ids, eta_xml, phi_xml)) = parse_lar_arrays(xml_text) {
        let n = energy.len().min(ids.len());
        for v in &energy[..n] { e_min_g = e_min_g.min(*v); e_max_g = e_max_g.max(*v); }

        for i in 0..n {
            let hit_eta = if i < eta_xml.len() { eta_xml[i] } else { 0.0 };
            let hit_phi = if i < phi_xml.len() { phi_xml[i] } else { 0.0 };

            match decode_lar_id(ids[i]).and_then(|d| lar_id_to_path(&d)) {
                Some((path, label)) => {
                    append_hit(&mut hits, &path, energy[i], hit_eta, hit_phi, &label, "LAr");
                    lar_mapped += 1;
                    mapped += 1;
                }
                None => { lar_unmapped += 1; unmapped += 1; }
            }
        }
    }

    // ── 4. HEC ──────────────────────────────────────────────────────────────
    if let Some((energy, eta, phi, _slot)) = parse_calo_arrays(xml_text, "HEC", &["energy","eta","phi","slot"]) {
        let n = energy.len().min(eta.len()).min(phi.len());
        for v in &energy[..n] { e_min_g = e_min_g.min(*v); e_max_g = e_max_g.max(*v); }

        let mut seen: HashMap<(i32, i32), usize> = HashMap::new();
        for i in 0..n {
            let hit_eta = eta[i];
            let hit_phi = phi[i];
            let eta_key = (hit_eta * 10000.0).round() as i32;
            let phi_key = (hit_phi * 1000.0).round() as i32;
            let seen_key = (eta_key, phi_key);
            let nth = *seen.get(&seen_key).unwrap_or(&0);
            seen.insert(seen_key, nth + 1);

            match lookup_hec(hit_eta, hit_phi, nth) {
                Some((path, label)) => {
                    append_hit(&mut hits, &path, energy[i], hit_eta, hit_phi, &label, "HEC");
                    hec_mapped += 1;
                    mapped += 1;
                }
                None => { hec_unmapped += 1; unmapped += 1; }
            }
        }
    }

    // ── Resultado ───────────────────────────────────────────────────────────
    format!(
        concat!(
            r#"{{"ok":true,"cells_mapped":{},"cells_unmapped":{},"#,
            r#""e_min":{:.4},"e_max":{:.4},"#,
            r#""tile_mapped":{},"tile_unmapped":{},"#,
            r#""mbts_mapped":{},"#,
            r#""lar_mapped":{},"lar_unmapped":{},"#,
            r#""hec_mapped":{},"hec_unmapped":{},"#,
            r#""hits":[{}]}}"#,
        ),
        mapped, unmapped,
        e_min_g, e_max_g,
        tile_mapped, tile_unmapped,
        mbts_mapped,
        lar_mapped, lar_unmapped,
        hec_mapped, hec_unmapped,
        hits,
    )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════════════════════

fn append_hit(hits: &mut String, path: &str, energy: f32, eta: f32, phi: f32, cell: &str, det: &str) {
    if !hits.is_empty() { hits.push(','); }
    hits.push_str(&format!(
        r#"{{"path":{},"energy":{:.4},"eta":{:.4},"phi":{:.4},"cell":{},"det":{}}}"#,
        js(path), energy, eta, phi, js(cell), js(det),
    ));
}

fn js(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '"'  => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\t' => out.push_str("\\t"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            c    => out.push(c),
        }
    }
    out.push('"');
    out
}

fn find_tag(text: &str, tag: &str) -> Option<usize> {
    text.find(&format!("<{}", tag))
}

fn extract_array(content: &str, tag: &str) -> Option<Vec<f32>> {
    let open  = format!("<{}>",  tag);
    let close = format!("</{}>", tag);
    let s = content.find(&open)?  + open.len();
    let e = content[s..].find(&close)? + s;
    Some(content[s..e].split_whitespace().filter_map(|t| t.parse().ok()).collect())
}

/// Extrai bloco XML e retorna arrays solicitados. Retorna None se tag ausente.
fn parse_calo_arrays(xml_text: &str, tag: &str, fields: &[&str]) -> Option<(Vec<f32>, Vec<f32>, Vec<f32>, Vec<f32>)> {
    let pos = find_tag(xml_text, tag)?;
    let inner_start = xml_text[pos..].find('>')? + pos + 1;
    let close_tag = format!("</{}>", tag);
    let inner_end = xml_text[inner_start..].find(&close_tag)? + inner_start;
    let inner = &xml_text[inner_start..inner_end];

    let a = extract_array(inner, fields[0]).unwrap_or_default();
    let b = if fields.len() > 1 { extract_array(inner, fields[1]).unwrap_or_default() } else { Vec::new() };
    let c = if fields.len() > 2 { extract_array(inner, fields[2]).unwrap_or_default() } else { Vec::new() };
    let d = if fields.len() > 3 { extract_array(inner, fields[3]).unwrap_or_default() } else { Vec::new() };
    Some((a, b, c, d))
}

fn extract_i64_array(content: &str, tag: &str) -> Option<Vec<i64>> {
    let open  = format!("<{}>",  tag);
    let close = format!("</{}>", tag);
    let s = content.find(&open)?  + open.len();
    let e = content[s..].find(&close)? + s;
    Some(content[s..e].split_whitespace().filter_map(|t| t.parse::<i64>().ok()).collect())
}

/// Extrai arrays do bloco LAr: energy (f32), id (i64), eta (f32), phi (f32).
/// IDs devem ser i64 para preservar bits baixos usados na decodificação.
fn parse_lar_arrays(xml_text: &str) -> Option<(Vec<f32>, Vec<i64>, Vec<f32>, Vec<f32>)> {
    let pos = find_tag(xml_text, "LAr")?;
    let inner_start = xml_text[pos..].find('>')? + pos + 1;
    let inner_end = xml_text[inner_start..].find("</LAr>")? + inner_start;
    let inner = &xml_text[inner_start..inner_end];

    let energy = extract_array(inner, "energy").unwrap_or_default();
    let id     = extract_i64_array(inner, "id").unwrap_or_default();
    let eta    = extract_array(inner, "eta").unwrap_or_default();
    let phi    = extract_array(inner, "phi").unwrap_or_default();

    if energy.is_empty() || id.is_empty() { return None; }
    Some((energy, id, eta, phi))
}

fn parse_mbts_arrays(xml_text: &str) -> Option<(Vec<f32>, Vec<f32>, Vec<f32>, Vec<f32>, Vec<f32>)> {
    let pos = find_tag(xml_text, "MBTS")?;
    let inner_start = xml_text[pos..].find('>')? + pos + 1;
    let inner_end = xml_text[inner_start..].find("</MBTS>")? + inner_start;
    let inner = &xml_text[inner_start..inner_end];
    Some((
        extract_array(inner, "energy")?,
        extract_array(inner, "channel")?,
        extract_array(inner, "module")?,
        extract_array(inner, "eta")?,
        extract_array(inner, "phi").unwrap_or_default(),
    ))
}

