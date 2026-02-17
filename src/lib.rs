use wasm_bindgen::prelude::*;
use js_sys::{Float32Array, Object, Reflect};
use quick_xml::Reader;
use quick_xml::events::Event;
use std::collections::HashMap;

// ============================================================
// PORTED FROM CaloGeoConst.h  (all values in mm)
// ============================================================

const PI: f64 = std::f64::consts::PI;

// --- Tile: z-positions and z-widths [row][eta_idx] -----------
// Rows 0-14 match Tilez / Tiledz in the header.
// Row 0 = A barrel, 1 = B barrel, 2 = C barrel (in Tile_size sense),
// 3 = D barrel, 4 = A ext, 5 = B ext, 6 = D ext, 7 = D4,
// 8 = C9, 9-12 = scintillators, 13-14 = MBTS
static TILE_Z: [[f64; 10]; 15] = [
    [123.240, 369.720, 620.760, 876.365, 1141.10, 1419.53, 1707.10, 2012.91, 2341.54, 2656.48],
    [141.495, 424.490, 707.485, 999.605, 1300.86, 1615.80, 1949.00, 2300.46, 2642.79, 0.0],
    [159.755, 483.830, 812.465, 1150.23, 1497.13, 1857.71, 2241.12, 2619.97, 0.0, 0.0],
    [0.0, 734.870, 1497.13, 2346.10, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [3646.64, 3956.95, 4440.67, 4970.03, 5681.91, 0.0, 0.0, 0.0, 0.0, 0.0],
    [3710.53, 4102.98, 4623.21, 5189.07, 5800.57, 0.0, 0.0, 0.0, 0.0, 0.0],
    [4167.74, 5445.49, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [3405.00, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [3511.85, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [3551.50, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [3551.50, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [3536.00, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [3536.00, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [3566.00, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [3566.00, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
];

static TILE_DZ: [[f64; 10]; 15] = [
    [246.480, 246.480, 255.600, 255.610, 273.860, 283.000, 292.120, 319.510, 337.760, 292.120],
    [282.990, 283.000, 282.990, 301.250, 301.250, 328.640, 337.760, 365.160, 319.500, 0.0],
    [319.510, 328.640, 328.630, 346.900, 346.900, 374.280, 392.540, 365.150, 0.0, 0.0],
    [730.300, 739.440, 785.070, 912.880, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [164.280, 461.912, 511.100, 547.610, 876.170, 0.0, 0.0, 0.0, 0.0, 0.0],
    [292.060, 492.840, 547.610, 584.120, 638.870, 0.0, 0.0, 0.0, 0.0, 0.0],
    [1186.48, 1369.02, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [309.000, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [94.710, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [15.000, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [15.000, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [8.000, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [8.000, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [20.000, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [20.000, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
];

// --- HEC: radial positions and widths [row][eta_idx] ---------
// 7 sub-rows, up to 14 cells each.
static HEC_R: [[f64; 14]; 7] = [
    [1953.63,1777.76,1597.56,1437.47,1294.76,1167.21,1052.94,950.382,858.205,775.278,668.405,545.996,446.465,386.875],
    [2008.09,1881.11,1690.42,1521.01,1370.00,1235.03,1114.11,1005.59,908.060,820.287,707.225,577.746,502.371,0.0],
    [1951.08,1774.10,1596.30,1437.80,1296.15,1169.26,1060.37,958.008,860.888,742.229,606.344,515.234,0.0,0.0],
    [2008.26,1882.60,1693.79,1525.52,1375.14,1240.45,1119.58,1010.96,913.220,787.548,643.565,531.973,0.0,0.0],
    [1947.43,1768.06,1592.41,1435.44,1294.84,1168.68,1055.29,953.266,822.083,671.786,549.312,0.0,0.0,0.0],
    [1986.52,1842.34,1659.31,1495.74,1349.24,1217.77,1099.62,993.312,856.619,700.007,572.389,500.028,0.0,0.0],
    [1916.61,1726.20,1556.04,1403.63,1266.87,1143.96,1033.36,891.153,728.228,595.465,510.411,0.0,0.0,0.0],
];
static HEC_DR: [[f64; 14]; 7] = [
    [160.737,191.003,169.396,150.788,134.625,120.488,108.053,97.0569,87.2970,78.5560,135.189,109.630,89.431,29.75],
    [51.825,202.126,179.258,159.561,142.456,127.495,114.335,102.699,92.371,83.174,142.951,116.007,34.742,0.0],
    [165.839,188.131,167.459,149.535,133.779,119.994,97.783,106.943,87.297,150.022,121.749,60.469,0.0,0.0],
    [51.487,199.818,177.818,158.723,142.030,127.352,114.378,102.866,92.616,158.728,129.238,93.946,0.0,0.0],
    [173.132,185.615,165.683,148.259,132.936,119.394,107.377,96.676,165.689,134.906,110.042,0.0,0.0,0.0],
    [94.958,193.413,172.644,154.486,138.521,124.410,111.887,100.738,172.649,140.573,114.665,30.056,0.0,0.0],
    [201.210,179.604,160.715,144.105,129.425,116.399,104.799,179.610,146.239,119.288,50.821,0.0,0.0,0.0],
];
// Number of valid cells per HEC sub-row
static HEC_SIZE: [usize; 7] = [14, 13, 12, 12, 11, 12, 11];

// ============================================================
// LAYER CONFIGURATION TABLE (26 XML layers → geometry params)
// ============================================================

#[derive(Clone, Copy)]
enum SubDet { Tile, Hec, LarBarrel, LarEndCap }

#[derive(Clone)]
struct LayerCfg {
    subdet:   SubDet,
    h1:       f64,    // inner radius or z for endcaps (mm)
    h2:       f64,    // outer radius or z
    phi_seg:  usize,  // number of phi cells
    tile_row: usize,  // index into TILE_Z/DZ (Tile only)
    tile_row2: usize, // second row for MergeTile (layer 1 only)
    hec_row1: usize,  // first  HEC sub-row
    hec_row2: usize,  // second HEC sub-row (merge) — same as row1 if no merge
    lar_layer: usize, // 0-3 for LAr
}

impl LayerCfg {
    fn tile(h1:f64,h2:f64,phi_seg:usize,row:usize)->Self {
        LayerCfg{subdet:SubDet::Tile,h1,h2,phi_seg,
            tile_row:row,tile_row2:row,hec_row1:0,hec_row2:0,lar_layer:0}
    }
    fn tile_merge(h1:f64,h2:f64,row1:usize,row2:usize)->Self {
        LayerCfg{subdet:SubDet::Tile,h1,h2,phi_seg:64,
            tile_row:row1,tile_row2:row2,hec_row1:0,hec_row2:0,lar_layer:0}
    }
    fn hec(h1:f64,h2:f64,row1:usize,row2:usize)->Self {
        LayerCfg{subdet:SubDet::Hec,h1,h2,phi_seg:64,
            tile_row:0,tile_row2:0,hec_row1:row1,hec_row2:row2,lar_layer:0}
    }
    fn lar_b(h1:f64,h2:f64,phi_seg:usize,lyr:usize)->Self {
        LayerCfg{subdet:SubDet::LarBarrel,h1,h2,phi_seg,
            tile_row:0,tile_row2:0,hec_row1:0,hec_row2:0,lar_layer:lyr}
    }
    fn lar_e(phi_seg:usize,lyr:usize)->Self {
        LayerCfg{subdet:SubDet::LarEndCap,h1:0.0,h2:0.0,phi_seg,
            tile_row:0,tile_row2:0,hec_row1:0,hec_row2:0,lar_layer:lyr}
    }
}

fn build_layer_table() -> Vec<LayerCfg> {
    vec![
        // ---- Tile barrel / extended ----
        /* l= 0 */ LayerCfg::tile(2300.0, 2600.0, 64, 0),   // A barrel
        /* l= 1 */ LayerCfg::tile_merge(2600.0, 3440.0, 1, 2), // B+C barrel
        /* l= 2 */ LayerCfg::tile(3440.0, 3820.0, 64, 3),   // D barrel
        /* l= 3 */ LayerCfg::tile(2300.0, 2600.0, 64, 4),   // A extended
        /* l= 4 */ LayerCfg::tile(2600.0, 3140.0, 64, 5),   // B extended
        /* l= 5 */ LayerCfg::tile(3140.0, 3820.0, 64, 6),   // D extended
        /* l= 6 */ LayerCfg::tile(3440.0, 3820.0, 64, 7),   // D4
        /* l= 7 */ LayerCfg::tile(2990.0, 3440.0, 64, 8),   // C9
        /* l= 8 */ LayerCfg::tile(2632.0, 2959.0, 64, 9),
        /* l= 9 */ LayerCfg::tile(2305.0, 2632.0, 64, 10),
        /* l=10 */ LayerCfg::tile(1885.0, 2305.0, 64, 11),
        /* l=11 */ LayerCfg::tile(1465.0, 1885.0, 64, 12),
        /* l=12 */ LayerCfg::tile(426.0,  876.0,   8, 13), // MBTS outer
        /* l=13 */ LayerCfg::tile(153.0,  426.0,   8, 14), // MBTS inner
        // ---- HEC (endcap hadronic) ----
        // row pairs map to CaloBuild: BuildHEC(1)=row0, MergeHEC(2,3)=rows1+2, etc.
        /* l=14 */ LayerCfg::hec(4350.0, 4630.0, 0, 0),
        /* l=15 */ LayerCfg::hec(4630.0, 5100.0, 1, 2),
        /* l=16 */ LayerCfg::hec(5130.0, 5590.0, 3, 4),
        /* l=17 */ LayerCfg::hec(5590.0, 6050.0, 5, 6),
        // ---- LAr EM Barrel ----
        /* l=18 */ LayerCfg::lar_b(1421.73, 1438.58,  64, 0),
        /* l=19 */ LayerCfg::lar_b(1481.75, 1579.00,  64, 1),
        /* l=20 */ LayerCfg::lar_b(1581.00, 1840.00, 256, 2),
        /* l=21 */ LayerCfg::lar_b(1840.00, 1984.70, 256, 3),
        // ---- LAr EM EndCap ----
        /* l=22 */ LayerCfg::lar_e( 64, 0),
        /* l=23 */ LayerCfg::lar_e( 64, 1),
        /* l=24 */ LayerCfg::lar_e(256, 2),
        /* l=25 */ LayerCfg::lar_e(256, 3),
    ]
}

// ============================================================
// LAr Barrel: analytically reconstruct eta centres
//   Row 0 : 61 cells, deta=0.025, eta_0=0.0125
//   Row 1 : 451 cells, deta=0.003125, eta_0=0.0015625
//   Row 2 : 57 cells, from geometry (see below)
//   Row 3 : 27 cells, deta=0.05, eta_0=0.025
// ============================================================
fn laba_eta(layer: usize, idx: usize) -> f64 {
    match layer {
        0 => 0.0125 + 0.025 * idx as f64,
        1 => 0.0015625 + 0.003125 * idx as f64,
        2 => {
            // First 44 cells: step 0.025 from 0.025
            // Last 13 cells: step 0.1 from 1.125 to 2.225 (approx outer region)
            if idx < 44 { 0.025 + 0.025 * idx as f64 }
            else { 1.125 + 0.1 * (idx - 44) as f64 }
        }
        3 => 0.025 + 0.05 * idx as f64,
        _ => 0.0,
    }
}
fn laba_deta(layer: usize, idx: usize) -> f64 {
    match layer {
        0 => 0.025,
        1 => 0.003125,
        2 => { if idx < 44 { 0.025 } else { 0.1 } }
        3 => 0.05,
        _ => 0.05,
    }
}
fn laba_ncells(layer: usize) -> usize {
    [61, 451, 57, 27][layer]
}

// ============================================================
// LAr EndCap eta / h1 / h2
// ============================================================
// eta centres from the file (LaEb_eta).
static LAEB_ETA: [[f64; 216]; 4] = [
    // Layer 0: 12 cells starting 1.52078, step 0.025
    {
        let mut a = [0.0f64; 216];
        // filled at compile-time by const initialiser below
        a
    },
    // (will be replaced by actual fn below)
    {let a=[0.0f64;216];a},
    {let a=[0.0f64;216];a},
    {let a=[0.0f64;216];a},
];

// Because Rust doesn't allow complex static initialisers, we use a function:
fn laeb_eta(layer: usize, idx: usize) -> f64 {
    match layer {
        0 => 1.52078 + 0.025 * idx as f64, // 12 cells
        1 => {
            // Complex grid: first 4 cells coarse, then fine, then medium
            let coarse: [f64;4] = [1.40828, 1.44578, 1.47078, 1.49578];
            if idx < 4 { coarse[idx] }
            else if idx < 4+96 {
                // fine cells from 1.50984, step 0.003125 for ~96 cells
                1.50984 + 0.003125 * (idx-4) as f64
            } else if idx < 4+96+48 {
                // medium cells
                let start_idx = idx - (4+96);
                1.81036 + 0.00416667 * start_idx as f64
            } else if idx < 4+96+48+60 {
                let start_idx = idx - (4+96+48);
                2.01141 + 0.00625 * start_idx as f64
            } else {
                let start_idx = idx - (4+96+48+60);
                2.42078 + 0.025 * start_idx as f64
            }
        }
        2 => {
            let coarse: [f64;4] = [1.40828, 1.44578, 1.47078, 1.49578];
            if idx < 4 { coarse[idx] }
            else if idx < 4+40 { 1.52078 + 0.025*(idx-4) as f64 }
            else if idx < 4+40+7 { 2.55828 + 0.1*(idx-44) as f64 }
            else { 0.0 }
        }
        3 => {
            if idx < 12 { 1.47078 + 0.025*idx as f64 }
            else if idx < 12+15 { 1.78328 + 0.05*(idx-12) as f64 }
            else if idx < 12+15+7 { 2.55828 + 0.1*(idx-27) as f64 }
            else { 0.0 }
        }
        _ => 0.0,
    }
}
fn laeb_deta(layer: usize, idx: usize) -> f64 {
    match layer {
        0 => 0.025,
        1 => {
            if idx < 1 { 0.05 }
            else if idx < 4 { 0.025 }
            else if idx < 4+96 { 0.003125 }
            else if idx < 4+96+48 { 0.00416667 }
            else if idx < 4+96+48+60 { 0.00625 }
            else { 0.025 }
        }
        2 => {
            if idx < 1 { 0.05 }
            else if idx < 44 { 0.025 }
            else { 0.1 }
        }
        3 => {
            if idx < 12 { 0.025 }
            else if idx < 27 { 0.05 }
            else { 0.1 }
        }
        _ => 0.05,
    }
}
fn laeb_ncells(layer: usize) -> usize { [12, 216, 51, 34][layer] }

// h1 / h2 for LAr EndCap (z-positions, mm)
static LAEB_H1: [[f64; 2]; 4] = [
    [3680.75, 3680.75],  // layer 0: constant h1
    [3754.24, 3754.24],
    [3800.73, 3754.24],  // layer 2: first 44 cells 3800.73, then 3754.24
    [4156.24, 4201.25],  // layer 3: first 27 cells 4156.24, rest 4201.25
];
static LAEB_H2: [[f64; 2]; 4] = [
    [3714.25, 3714.25],
    [3800.73, 3800.73],
    [4156.24, 4156.24],
    [4243.26, 4243.26],
];
fn laeb_h1(layer: usize, idx: usize) -> f64 {
    match layer {
        2 => { if idx < 44 { 3800.73 } else { 3754.24 } }
        3 => { if idx < 27 { 4156.24 } else { 4201.25 } }
        _ => LAEB_H1[layer][0],
    }
}
fn laeb_h2(layer: usize, _idx: usize) -> f64 { LAEB_H2[layer][0] }

// ============================================================
// ETA → POLAR-ELEVATION ANGLE (from CaloBuild.C eta2rad)
//   eta2rad(η) = π/2 − 2·atan(e^{−η})   (elevation above transverse plane)
// ============================================================
#[inline]
fn eta2rad(eta: f64) -> f64 {
    PI / 2.0 - 2.0 * (-eta).exp().atan()
}

// ============================================================
// CELL POSITION + BOX-SCALE COMPUTATION
//
// Returns (cx, cy, cz, sx, sy, sz, phi_angle)
//   cx/cy/cz  – world-space centre  (mm)
//   sx/sy/sz  – half-extents of approximate box  (mm)
//   phi_angle – rotation around Z axis
// ============================================================

/// φ-centre angle for bin j in a phi_seg-element ring.
/// Matches CaloBuild convention: phi_0 = dphi/2 + π/2
#[inline]
fn phi_center(j: usize, phi_seg: usize) -> f64 {
    let dphi = 2.0 * PI / phi_seg as f64;
    dphi / 2.0 + PI / 2.0 + j as f64 * dphi
}

fn compute_cell(cfg: &LayerCfg, eta_idx: i32, phi_idx: usize)
    -> Option<(f64,f64,f64, f64,f64,f64)>
{
    let eta_abs  = eta_idx.unsigned_abs() as usize;
    let z_sign   = if eta_idx >= 0 { 1.0_f64 } else { -1.0_f64 };
    let phi      = phi_center(phi_idx, cfg.phi_seg);
    let dphi     = 2.0 * PI / cfg.phi_seg as f64;
    let sin_phi  = phi.sin();
    let cos_phi  = phi.cos();

    match cfg.subdet {
        SubDet::Tile => {
            let row = cfg.tile_row;
            if eta_abs >= 10 { return None; }
            let z_val = TILE_Z[row][eta_abs];
            let dz    = TILE_DZ[row][eta_abs];
            if z_val == 0.0 || dz == 0.0 { return None; }

            let r_mid = (cfg.h1 + cfg.h2) / 2.0;
            let dr    = cfg.h2 - cfg.h1;
            // Tile row2 might differ for MergeTile layer; for dz use second row if available
            let dz_final = if cfg.tile_row2 != row && TILE_DZ[cfg.tile_row2][eta_abs] > 0.0 {
                (dz + TILE_DZ[cfg.tile_row2][eta_abs]) / 2.0
            } else { dz };

            let cx = -r_mid * sin_phi;
            let cy =  r_mid * cos_phi;
            let cz =  z_sign * z_val;

            // half-extents
            let sx = dr / 2.0;
            let sy = r_mid * dphi / 2.0;
            let sz = dz_final / 2.0;

            Some((cx, cy, cz, sx, sy, sz))
        }

        SubDet::Hec => {
            // Determine which HEC sub-row owns this eta cell.
            // HEC merged layers: row1 is primary, row2 is secondary.
            // "first cell" comes from row1[0], remaining from row2.
            let (r_val, dr_val, use_z) = if cfg.hec_row1 == cfg.hec_row2 {
                // non-merged, direct lookup
                if eta_abs >= HEC_SIZE[cfg.hec_row1] { return None; }
                let r = HEC_R[cfg.hec_row1][eta_abs];
                let dr = HEC_DR[cfg.hec_row1][eta_abs];
                (r, dr, true)
            } else {
                // merged: eta_idx 0 → row1[0]; eta_idx 1..N → row2[0..N-1]
                if eta_abs == 0 {
                    let r = HEC_R[cfg.hec_row1][0];
                    let dr = HEC_DR[cfg.hec_row1][0];
                    (r, dr, true)
                } else {
                    let i2 = eta_abs - 1;
                    if i2 >= HEC_SIZE[cfg.hec_row2] { return None; }
                    let r = HEC_R[cfg.hec_row2][i2];
                    let dr = HEC_DR[cfg.hec_row2][i2];
                    (r, dr, true)
                }
            };
            if r_val == 0.0 { return None; }
            let _ = use_z;

            let z_mid = (cfg.h1 + cfg.h2) / 2.0;
            let dz    = cfg.h2 - cfg.h1;

            let cx = -r_val * sin_phi;
            let cy =  r_val * cos_phi;
            let cz =  z_sign * z_mid;

            let sx = dr_val / 2.0;
            let sy = r_val * dphi / 2.0;
            let sz = dz / 2.0;

            Some((cx, cy, cz, sx, sy, sz))
        }

        SubDet::LarBarrel => {
            let lar = cfg.lar_layer;
            if eta_abs >= laba_ncells(lar) { return None; }
            let eta_c  = laba_eta(lar, eta_abs);
            let _deta  = laba_deta(lar, eta_abs);
            let elev   = eta2rad(eta_c);   // elevation angle above transverse plane
            let r_mid  = (cfg.h1 + cfg.h2) / 2.0;
            let dr     = cfg.h2 - cfg.h1;

            // z = r * tan(elevation) — exactly as CaloBuild h1/tan(pi/2 - eta2rad(eta))
            // = r * tan(elev) ... because tan(pi/2-elev) = cot(elev), h1 * cot(elev) = h1 / tan(elev)
            // but the CaloBuild line: h1/tan(pi/2 - eta2rad(eta)) = h1 * tan(eta2rad(eta)) = h1 * tan(elev)
            let cz = z_sign * r_mid * elev.tan();

            let cx = -r_mid * sin_phi;
            let cy =  r_mid * cos_phi;

            let sx = dr / 2.0;
            let sy = r_mid * dphi / 2.0;
            // approximate z extent from deta
            let sz = r_mid * laba_deta(lar, eta_abs) / elev.cos().max(0.1) / 2.0;

            Some((cx, cy, cz, sx, sy, sz))
        }

        SubDet::LarEndCap => {
            let lar = cfg.lar_layer;
            if eta_abs >= laeb_ncells(lar) { return None; }
            let eta_c = laeb_eta(lar, eta_abs);
            if eta_c == 0.0 { return None; }
            let h1    = laeb_h1(lar, eta_abs);
            let h2    = laeb_h2(lar, eta_abs);
            let z_mid = (h1 + h2) / 2.0;
            let dz    = h2 - h1;

            // Transverse radius from beam at eta_c:
            //   tan(pi/2 - elev) = r_perp / z  →  r_perp = z * tan(pi/2-elev)
            let elev   = eta2rad(eta_c);
            // tan(pi/2 - elev) = cot(elev) = 1/tan(elev)
            let r_perp = h1 / elev.tan();  // same as h1 * tan(pi/2 - elev)

            let cx = -r_perp * sin_phi;
            let cy =  r_perp * cos_phi;
            let cz =  z_sign * z_mid;

            let deta   = laeb_deta(lar, eta_abs);
            // dr = approximate radial width in transverse plane
            let dr     = (h1 / (eta_c - deta/2.0).max(0.001).atanh().max(0.001) -
                          h1 / (eta_c + deta/2.0).atanh().max(0.001)).abs().min(500.0);
            let sx = dr.max(5.0) / 2.0;
            let sy = r_perp * dphi / 2.0;
            let sz = dz / 2.0;

            Some((cx, cy, cz, sx, sy, sz))
        }
    }
}

/// Build a column-major 4×4 instance matrix for Three.js InstancedMesh.
/// The box local axes:
///   X → radial outward direction (sx scaled)
///   Y → tangential / phi direction (sy scaled)
///   Z → beam / depth direction (sz scaled)
/// Then translation to cell centre.
fn build_matrix(cx:f64,cy:f64,cz:f64,sx:f64,sy:f64,sz:f64,phi:f64) -> [f32;16] {
    // Radial direction at angle phi: (-sin(phi), cos(phi), 0)
    // Tangential direction:          (-cos(phi), -sin(phi), 0)
    let (s, c) = (phi.sin(), phi.cos());
    let s32 = |v:f64| v as f32;

    // col-major layout (col0, col1, col2, col3)
    // col0 = local-X in world = radial * sx
    // col1 = local-Y in world = tangential * sy
    // col2 = local-Z in world = (0,0,1) * sz
    // col3 = translation
    [
        s32(-s*sx),  s32(c*sx),  0.0, 0.0,    // col0
        s32(-c*sy),  s32(-s*sy), 0.0, 0.0,    // col1
        0.0,         0.0,        s32(sz), 0.0, // col2
        s32(cx),     s32(cy),    s32(cz), 1.0, // col3
    ]
}

/// Energy → RGB colour (Blue=low … Cyan … Green … Yellow … Red=high)
fn energy_color(t: f32) -> (f32, f32, f32) {
    let t = t.clamp(0.0, 1.0);
    let (r, g, b) = if t < 0.25 {
        let u = t / 0.25;
        (0.0, u, 1.0)
    } else if t < 0.5 {
        let u = (t - 0.25) / 0.25;
        (0.0, 1.0, 1.0 - u)
    } else if t < 0.75 {
        let u = (t - 0.5) / 0.25;
        (u, 1.0, 0.0)
    } else {
        let u = (t - 0.75) / 0.25;
        (1.0, 1.0 - u, 0.0)
    };
    (r, g, b)
}

// ============================================================
// PUBLIC WASM ENTRY POINT
// ============================================================

#[wasm_bindgen]
pub fn process_xml_data(xml_bytes: &[u8]) -> Result<JsValue, JsValue> {
    console_error_panic_hook::set_once();

    // --- Step 1 & 2: Parse XML + pile-up aggregation ---------
    // Key: (layer, eta, phi) where eta is signed i32
    let mut energy_map: HashMap<(i32, i32, i32), f64> = HashMap::new();
    let mut reader = Reader::from_reader(xml_bytes);
    reader.config_mut().trim_text(true);

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Empty(e)) | Ok(Event::Start(e)) => {
                if e.name().as_ref() == b"cell" {
                    let mut layer = None::<i32>;
                    let mut eta   = None::<i32>;
                    let mut phi   = None::<i32>;
                    let mut e_val = None::<f64>;

                    for attr in e.attributes().flatten() {
                        match attr.key.as_ref() {
                            b"l"   => layer = std::str::from_utf8(&attr.value).ok()
                                               .and_then(|s| s.trim().parse().ok()),
                            b"eta" => eta   = std::str::from_utf8(&attr.value).ok()
                                               .and_then(|s| s.trim().parse().ok()),
                            b"phi" => phi   = std::str::from_utf8(&attr.value).ok()
                                               .and_then(|s| s.trim().parse().ok()),
                            b"e"   => e_val = std::str::from_utf8(&attr.value).ok()
                                               .and_then(|s| s.trim().parse().ok()),
                            _ => {}
                        }
                    }
                    if let (Some(l), Some(et), Some(ph), Some(en)) = (layer,eta,phi,e_val) {
                        *energy_map.entry((l, et, ph)).or_insert(0.0) += en;
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }

    // --- Step 3 & 4: Geometry + filter ----------------------
    let layers = build_layer_table();
    let scale  = 0.001_f64;   // mm → Three.js units (metres)

    // Find energy range for normalisation
    let max_e = energy_map.values()
        .copied()
        .filter(|e| *e > 0.0)
        .fold(f64::NEG_INFINITY, f64::max)
        .max(1.0);
    let min_e = energy_map.values()
        .copied()
        .filter(|e| *e > 0.0)
        .fold(f64::INFINITY, f64::min)
        .min(max_e);

    let mut matrices: Vec<f32> = Vec::new();
    let mut colors:   Vec<f32> = Vec::new();
    let mut cell_info: Vec<(i32,i32,i32,f64)> = Vec::new(); // for JS metadata

    for (&(l, et, ph), &energy) in &energy_map {
        if energy <= 0.0 { continue; }
        let l_idx = l as usize;
        if l_idx >= layers.len() { continue; }
        let cfg = &layers[l_idx];
        if (ph as usize) >= cfg.phi_seg { continue; }

        if let Some((cx,cy,cz,sx,sy,sz)) = compute_cell(cfg, et, ph as usize) {
            let phi = phi_center(ph as usize, cfg.phi_seg);
            let mat = build_matrix(
                cx*scale, cy*scale, cz*scale,
                sx*scale, sy*scale, sz*scale,
                phi
            );
            matrices.extend_from_slice(&mat);

            // colour
            let t = if max_e > min_e {
                ((energy - min_e) / (max_e - min_e)) as f32
            } else { 1.0_f32 };
            let (r,g,b) = energy_color(t);
            colors.push(r);
            colors.push(g);
            colors.push(b);

            cell_info.push((l, et, ph, energy));
        }
    }

    let count = (matrices.len() / 16) as u32;

    // --- Step 5: Pack into JS object -------------------------
    let mat_array = Float32Array::new_with_length(matrices.len() as u32);
    mat_array.copy_from(&matrices);

    let col_array = Float32Array::new_with_length(colors.len() as u32);
    col_array.copy_from(&colors);

    let obj = Object::new();
    Reflect::set(&obj, &"matrices".into(), &mat_array).unwrap();
    Reflect::set(&obj, &"colors".into(),   &col_array).unwrap();
    Reflect::set(&obj, &"count".into(),    &(count as f64).into()).unwrap();
    Reflect::set(&obj, &"maxEnergy".into(),&max_e.into()).unwrap();
    Reflect::set(&obj, &"minEnergy".into(),&min_e.into()).unwrap();

    Ok(obj.into())
}
