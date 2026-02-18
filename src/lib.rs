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
static HEC_SIZE: [usize; 7] = [14, 13, 12, 12, 11, 12, 11];

// ============================================================
// ATLAS PHYSICAL CONSTANTS — Crack / Gap region
// ============================================================
/// Barrel LAr ends at |η| ≈ 1.475
const BARREL_ETA_MAX: f64 = 1.475;
/// Endcap LAr starts at |η| ≈ 1.5
const ENDCAP_ETA_MIN: f64 = 1.5;

// ============================================================
// LAYER CONFIGURATION TABLE (26 XML layers → geometry params)
// ============================================================

#[derive(Clone, Copy)]
enum SubDet { Tile, Hec, LarBarrel, LarEndCap }

#[derive(Clone)]
struct LayerCfg {
    subdet:    SubDet,
    h1:        f64,
    h2:        f64,
    phi_seg:   usize,
    tile_row:  usize,
    tile_row2: usize,
    hec_row1:  usize,
    hec_row2:  usize,
    lar_layer: usize,
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
        /* l= 0 */ LayerCfg::tile(2300.0, 2600.0, 64, 0),
        /* l= 1 */ LayerCfg::tile_merge(2600.0, 3440.0, 1, 2),
        /* l= 2 */ LayerCfg::tile(3440.0, 3820.0, 64, 3),
        /* l= 3 */ LayerCfg::tile(2300.0, 2600.0, 64, 4),
        /* l= 4 */ LayerCfg::tile(2600.0, 3140.0, 64, 5),
        /* l= 5 */ LayerCfg::tile(3140.0, 3820.0, 64, 6),
        /* l= 6 */ LayerCfg::tile(3440.0, 3820.0, 64, 7),
        /* l= 7 */ LayerCfg::tile(2990.0, 3440.0, 64, 8),
        /* l= 8 */ LayerCfg::tile(2632.0, 2959.0, 64, 9),
        /* l= 9 */ LayerCfg::tile(2305.0, 2632.0, 64, 10),
        /* l=10 */ LayerCfg::tile(1885.0, 2305.0, 64, 11),
        /* l=11 */ LayerCfg::tile(1465.0, 1885.0, 64, 12),
        /* l=12 */ LayerCfg::tile(426.0,  876.0,   8, 13),
        /* l=13 */ LayerCfg::tile(153.0,  426.0,   8, 14),
        /* l=14 */ LayerCfg::hec(4350.0, 4630.0, 0, 0),
        /* l=15 */ LayerCfg::hec(4630.0, 5100.0, 1, 2),
        /* l=16 */ LayerCfg::hec(5130.0, 5590.0, 3, 4),
        /* l=17 */ LayerCfg::hec(5590.0, 6050.0, 5, 6),
        /* l=18 */ LayerCfg::lar_b(1421.73, 1438.58,  64, 0),
        /* l=19 */ LayerCfg::lar_b(1481.75, 1579.00,  64, 1),
        /* l=20 */ LayerCfg::lar_b(1581.00, 1840.00, 256, 2),
        /* l=21 */ LayerCfg::lar_b(1840.00, 1984.70, 256, 3),
        /* l=22 */ LayerCfg::lar_e( 64, 0),
        /* l=23 */ LayerCfg::lar_e( 64, 1),
        /* l=24 */ LayerCfg::lar_e(256, 2),
        /* l=25 */ LayerCfg::lar_e(256, 3),
    ]
}

// ============================================================
// PHYSICS: η → z using sinh
//   z = R · sinh(η)   where R is the transverse radius
// This is the exact physical relation and replaces linear mapping.
// ============================================================
#[inline]
fn eta_to_z(eta: f64, r_transverse: f64) -> f64 {
    r_transverse * eta.sinh()
}

/// Convert eta to transverse angle (elevation above beam plane).
/// theta = 2 * atan(exp(-eta))
#[inline]
fn eta_to_theta(eta: f64) -> f64 {
    2.0 * (-eta).exp().atan()
}

// ============================================================
// LAr Barrel eta tables
// ============================================================
fn laba_eta(layer: usize, idx: usize) -> f64 {
    match layer {
        0 => 0.0125 + 0.025 * idx as f64,
        1 => 0.0015625 + 0.003125 * idx as f64,
        2 => {
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
// LAr EndCap eta tables
// ============================================================
fn laeb_eta(layer: usize, idx: usize) -> f64 {
    match layer {
        0 => 1.52078 + 0.025 * idx as f64,
        1 => {
            let coarse: [f64;4] = [1.40828, 1.44578, 1.47078, 1.49578];
            if idx < 4 { coarse[idx] }
            else if idx < 4+96 { 1.50984 + 0.003125 * (idx-4) as f64 }
            else if idx < 4+96+48 { 1.81036 + 0.00416667 * (idx-4-96) as f64 }
            else if idx < 4+96+48+60 { 2.01141 + 0.00625 * (idx-4-96-48) as f64 }
            else { 2.42078 + 0.025 * (idx-4-96-48-60) as f64 }
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

fn laeb_h1(layer: usize, idx: usize) -> f64 {
    match layer {
        2 => { if idx < 44 { 3800.73 } else { 3754.24 } }
        3 => { if idx < 27 { 4156.24 } else { 4201.25 } }
        _ => [3680.75, 3754.24, 3800.73, 4156.24][layer],
    }
}
fn laeb_h2(layer: usize, _idx: usize) -> f64 {
    [3714.25, 3800.73, 4156.24, 4243.26][layer]
}

// ============================================================
// PHI CENTRE
// ============================================================
#[inline]
fn phi_center(j: usize, phi_seg: usize) -> f64 {
    let dphi = 2.0 * PI / phi_seg as f64;
    dphi / 2.0 + PI / 2.0 + j as f64 * dphi
}

// ============================================================
// CRACK / GAP GUARD
// Returns true if |eta| falls inside the physical barrel/endcap
// crack region and should be suppressed from barrel LAr.
// ============================================================
#[inline]
fn in_barrel_crack(eta_abs: f64, is_barrel: bool) -> bool {
    if is_barrel {
        // Barrel LAr: reject cells beyond barrel max
        eta_abs > BARREL_ETA_MAX
    } else {
        // EndCap: reject cells below endcap min
        eta_abs < ENDCAP_ETA_MIN
    }
}

// ============================================================
// CELL POSITION COMPUTATION — Physics-based sinh(η) z-mapping
// ============================================================
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
            let dz_final = if cfg.tile_row2 != row && TILE_DZ[cfg.tile_row2][eta_abs] > 0.0 {
                (dz + TILE_DZ[cfg.tile_row2][eta_abs]) / 2.0
            } else { dz };

            let cx = -r_mid * sin_phi;
            let cy =  r_mid * cos_phi;
            let cz =  z_sign * z_val;

            Some((cx, cy, cz, dr / 2.0, r_mid * dphi / 2.0, dz_final / 2.0))
        }

        SubDet::Hec => {
            let (r_val, dr_val) = if cfg.hec_row1 == cfg.hec_row2 {
                if eta_abs >= HEC_SIZE[cfg.hec_row1] { return None; }
                (HEC_R[cfg.hec_row1][eta_abs], HEC_DR[cfg.hec_row1][eta_abs])
            } else {
                if eta_abs == 0 {
                    (HEC_R[cfg.hec_row1][0], HEC_DR[cfg.hec_row1][0])
                } else {
                    let i2 = eta_abs - 1;
                    if i2 >= HEC_SIZE[cfg.hec_row2] { return None; }
                    (HEC_R[cfg.hec_row2][i2], HEC_DR[cfg.hec_row2][i2])
                }
            };
            if r_val == 0.0 { return None; }

            let z_mid = (cfg.h1 + cfg.h2) / 2.0;
            let dz    = cfg.h2 - cfg.h1;
            let cx = -r_val * sin_phi;
            let cy =  r_val * cos_phi;
            let cz =  z_sign * z_mid;

            Some((cx, cy, cz, dr_val / 2.0, r_val * dphi / 2.0, dz / 2.0))
        }

        SubDet::LarBarrel => {
            let lar = cfg.lar_layer;
            if eta_abs >= laba_ncells(lar) { return None; }

            let eta_c = laba_eta(lar, eta_abs);
            let eta_c_abs = eta_c.abs();

            // CRACK GUARD: suppress cells in the crack region
            if in_barrel_crack(eta_c_abs, true) { return None; }

            let r_mid = (cfg.h1 + cfg.h2) / 2.0;
            let dr    = cfg.h2 - cfg.h1;

            // Physics-based z from sinh(η):  z = R · sinh(η)
            let cz = z_sign * eta_to_z(eta_c_abs, r_mid);

            let cx = -r_mid * sin_phi;
            let cy =  r_mid * cos_phi;

            // z half-extent from deta using chain rule: dz = R · cosh(η) · dη
            let deta = laba_deta(lar, eta_abs);
            let sz = (r_mid * eta_c_abs.cosh() * deta / 2.0).min(800.0);

            Some((cx, cy, cz, dr / 2.0, r_mid * dphi / 2.0, sz.max(1.0)))
        }

        SubDet::LarEndCap => {
            let lar = cfg.lar_layer;
            if eta_abs >= laeb_ncells(lar) { return None; }

            let eta_c = laeb_eta(lar, eta_abs);
            if eta_c == 0.0 { return None; }
            let eta_c_abs = eta_c.abs();

            // CRACK GUARD: suppress endcap cells in the crack region
            if in_barrel_crack(eta_c_abs, false) { return None; }

            let h1 = laeb_h1(lar, eta_abs);
            let h2 = laeb_h2(lar, eta_abs);
            let z_mid = (h1 + h2) / 2.0;
            let dz    = h2 - h1;

            // Transverse radius at the z face using sinh: r_perp = z / sinh(η) · cosh(η)
            // Equivalently, r_perp = z_mid / tan(theta/2 ... ) — use standard formula:
            // r_perp = z_mid · exp(-eta_c) * 2 / (1 - exp(-2*eta_c))  → simplifies to:
            // r_perp = z_mid / sinh(eta_c_abs)   (exact)
            let sinh_eta = eta_c_abs.sinh().max(0.001);
            let r_perp = z_mid / sinh_eta;

            let cx = -r_perp * sin_phi;
            let cy =  r_perp * cos_phi;
            let cz =  z_sign * z_mid;

            // Radial extent from deta using: dr = dz * dη / sinh²(η) * cosh(η)  — approximate
            let deta = laeb_deta(lar, eta_abs);
            let dr_approx = (z_mid * deta / (sinh_eta * sinh_eta) * eta_c_abs.cosh()).abs().min(500.0);

            Some((cx, cy, cz, dr_approx.max(5.0), r_perp * dphi / 2.0, dz / 2.0))
        }
    }
}

/// Build a column-major 4×4 instance matrix for Three.js InstancedMesh.
fn build_matrix(cx:f64,cy:f64,cz:f64,sx:f64,sy:f64,sz:f64,phi:f64) -> [f32;16] {
    let (s, c) = (phi.sin(), phi.cos());
    let s32 = |v:f64| v as f32;
    [
        s32(-s*sx),  s32(c*sx),  0.0, 0.0,
        s32(-c*sy),  s32(-s*sy), 0.0, 0.0,
        0.0,         0.0,        s32(sz), 0.0,
        s32(cx),     s32(cy),    s32(cz), 1.0,
    ]
}

/// Energy → normalised t ∈ [0,1] colour mapping done in shader.
/// Here we just pass back the t value as the red channel for lookup.
fn energy_color(t: f32) -> (f32, f32, f32) {
    let t = t.clamp(0.0, 1.0);
    if t < 0.25 {
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
    }
}

// ============================================================
// PUBLIC WASM ENTRY POINT
// ============================================================

#[wasm_bindgen]
pub fn process_xml_data(xml_bytes: &[u8]) -> Result<JsValue, JsValue> {
    console_error_panic_hook::set_once();

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
                            b"l"   => layer = std::str::from_utf8(&attr.value).ok().and_then(|s| s.trim().parse().ok()),
                            b"eta" => eta   = std::str::from_utf8(&attr.value).ok().and_then(|s| s.trim().parse().ok()),
                            b"phi" => phi   = std::str::from_utf8(&attr.value).ok().and_then(|s| s.trim().parse().ok()),
                            b"e"   => e_val = std::str::from_utf8(&attr.value).ok().and_then(|s| s.trim().parse().ok()),
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

    let layers = build_layer_table();
    let scale  = 0.001_f64; // mm → metres

    let max_e = energy_map.values().copied()
        .filter(|e| *e > 0.0)
        .fold(f64::NEG_INFINITY, f64::max).max(1.0);
    let min_e = energy_map.values().copied()
        .filter(|e| *e > 0.0)
        .fold(f64::INFINITY, f64::min).min(max_e);

    let mut matrices:    Vec<f32> = Vec::new();
    let mut colors:      Vec<f32> = Vec::new();
    let mut energies:    Vec<f32> = Vec::new();
    let mut layers_out:  Vec<f32> = Vec::new();
    let mut etas_out:    Vec<f32> = Vec::new();
    let mut phis_out:    Vec<f32> = Vec::new();

    for (&(l, et, ph), &energy) in &energy_map {
        if energy <= 0.0 { continue; }
        let l_idx = l as usize;
        if l_idx >= layers.len() { continue; }
        let cfg = &layers[l_idx];
        if (ph as usize) >= cfg.phi_seg { continue; }

        if let Some((cx,cy,cz,sx,sy,sz)) = compute_cell(cfg, et, ph as usize) {
            let phi_a = phi_center(ph as usize, cfg.phi_seg);
            let mat = build_matrix(
                cx*scale, cy*scale, cz*scale,
                sx*scale, sy*scale, sz*scale,
                phi_a
            );
            matrices.extend_from_slice(&mat);

            let t = if max_e > min_e {
                ((energy - min_e) / (max_e - min_e)) as f32
            } else { 1.0_f32 };

            let (r,g,b) = energy_color(t);
            colors.push(r);
            colors.push(g);
            colors.push(b);
            energies.push(t);
            layers_out.push(l as f32);
            etas_out.push(et as f32);
            phis_out.push(ph as f32);
        }
    }

    let count = (matrices.len() / 16) as u32;

    let mat_array = Float32Array::new_with_length(matrices.len() as u32);
    mat_array.copy_from(&matrices);

    let col_array = Float32Array::new_with_length(colors.len() as u32);
    col_array.copy_from(&colors);

    let eng_array = Float32Array::new_with_length(energies.len() as u32);
    eng_array.copy_from(&energies);

    let lay_array = Float32Array::new_with_length(layers_out.len() as u32);
    lay_array.copy_from(&layers_out);

    let eta_array = Float32Array::new_with_length(etas_out.len() as u32);
    eta_array.copy_from(&etas_out);

    let phi_array = Float32Array::new_with_length(phis_out.len() as u32);
    phi_array.copy_from(&phis_out);

    let obj = Object::new();
    Reflect::set(&obj, &"matrices".into(),  &mat_array).unwrap();
    Reflect::set(&obj, &"colors".into(),    &col_array).unwrap();
    Reflect::set(&obj, &"energies".into(),  &eng_array).unwrap();
    Reflect::set(&obj, &"layers".into(),    &lay_array).unwrap();
    Reflect::set(&obj, &"etas".into(),      &eta_array).unwrap();
    Reflect::set(&obj, &"phis".into(),      &phi_array).unwrap();
    Reflect::set(&obj, &"count".into(),     &(count as f64).into()).unwrap();
    Reflect::set(&obj, &"maxEnergy".into(), &max_e.into()).unwrap();
    Reflect::set(&obj, &"minEnergy".into(), &min_e.into()).unwrap();

    Ok(obj.into())
}