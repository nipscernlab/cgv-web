// =============================================================================
// lib.rs — Módulo WASM para visualização do calorímetro do detector ATLAS (CERN)
//          Projeto: CGV-WEB
//
// VISÃO GERAL DO FLUXO DE DADOS:
//   1. JavaScript chama `process_xml_data(bytes)` enviando um arquivo XML bruto
//   2. O WASM (este código Rust compilado) analisa o XML e extrai energia por célula
//   3. Para cada célula com energia > 0, calcula a posição 3D física no detector
//   4. Gera matrizes 4×4 de transformação para o Three.js (InstancedMesh)
//   5. Retorna para o JavaScript um objeto com arrays Float32 prontos para a GPU
//   6. O Three.js usa esses dados para renderizar milhares de células 3D na tela
//
// GEOMETRIA: todos os valores provêm de CaloGeoConst.h (fonte única de verdade)
//   - TILE:      14 camadas lógicas, dados em TILE_Z / TILE_DZ
//   - HEC:       4 camadas lógicas (7 linhas de tabela), dados em HEC_R / HEC_DR
//   - LAr Barril: 4 camadas (l=18..21), LaBa_eta / LaBa_deta / LaBa_size
//   - LAr Tampa:  4 camadas (l=22..25), LaEb_eta / LaEb_deta / LaEb_h1 / LaEb_h2
//
// CORREÇÕES APLICADAS (vs versão anterior):
//   [BUG-1] laba_eta(camada=2): fórmula estava errada — iniciava em 0.025 e usava
//           slope 0.1 para idx>=44, produzindo η até 2.325 (fora do detector!).
//           Correto: 0.0125 + 0.025*idx para idx<56, 1.4375 para idx=56.
//   [BUG-2] laba_deta(camada=2): retornava 0.1 para idx>=44.
//           Correto: 0.025 para idx<56, 0.05 para idx=56.
//   [BUG-3] laba_eta/deta(camada=1): idx=448,449,450 são células de transição
//           especiais (Δη=0.025) em η=1.4125/1.4375/1.4625.
//           A fórmula uniforme de 0.003125 gerava posições ~0.003 erradas.
//   [BUG-4] laeb_h2(camada=2): sempre retornava 4156.24 mm.
//           Para idx>=44 (7 células finais da tampa LAr 2), o correto é 4201.25 mm.
// =============================================================================

use wasm_bindgen::prelude::*;
use js_sys::{Float32Array, Object, Reflect};
use quick_xml::Reader;
use quick_xml::events::Event;
use std::collections::HashMap;

// =============================================================================
// CONSTANTES FÍSICAS DO CALORÍMETRO — Portadas de CaloGeoConst.h
// Todos os valores estão em milímetros (mm)
// =============================================================================

const PI: f64 = std::f64::consts::PI;

// --- Calorímetro TILE (hadrônico de telhas de cintilação) --------------------
//
// TILE_Z[linha][idx_eta]: posição central em Z de cada célula Tile (mm)
// Dimensão [15 linhas físicas][10 slots de eta]
// Valor 0.0 => célula inexistente nessa posição
//
// Correspondência entre linhas e sub-detectores (de CaloGeoConst.h Tilez):
//   Linha  0 → A barril      (até 10 células em eta, Tile_size[0]=10)
//   Linha  1 → B barril      (9 células,  Tile_size[1]=9)
//   Linha  2 → C barril      (8 células,  Tile_size[2]=8)  ← mesclada com B na camada l=1
//   Linha  3 → D barril      (4 células,  Tile_size[3]=4)
//   Linha  4 → A extensão    (5 células,  Tile_size[4]=5)
//   Linha  5 → B extensão    (5 células,  Tile_size[5]=5)
//   Linha  6 → D extensão    (2 células,  Tile_size[6]=2)
//   Linha  7 → D4 (gap)      (1 célula,   Tile_size[7]=1)
//   Linha  8 → C9 (gap)      (1 célula,   Tile_size[8]=1)
//   Linhas 9-12 → Cintiladores especiais (1 célula cada)
//   Linhas 13-14 → MBTS outer / inner (1 célula cada, phi_seg=8)
static TILE_Z: [[f64; 10]; 15] = [
    // Linha 0: camada A do barril central (Tile_size[0]=10)
    [123.240, 369.720, 620.760, 876.365, 1141.10, 1419.53, 1707.10, 2012.91, 2341.54, 2656.48],
    // Linha 1: camada B do barril central (Tile_size[1]=9)
    [141.495, 424.490, 707.485, 999.605, 1300.86, 1615.80, 1949.00, 2300.46, 2642.79,    0.0],
    // Linha 2: camada C do barril central (Tile_size[2]=8) — mesclada com B em l=1
    [159.755, 483.830, 812.465, 1150.23, 1497.13, 1857.71, 2241.12, 2619.97,    0.0,    0.0],
    // Linha 3: camada D do barril central (Tile_size[3]=4)
    [   0.0,  734.870, 1497.13, 2346.10,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0],
    // Linha 4: camada A da extensão do barril (Tile_size[4]=5)
    [3646.64, 3956.95, 4440.67, 4970.03, 5681.91,    0.0,    0.0,    0.0,    0.0,    0.0],
    // Linha 5: camada B da extensão do barril (Tile_size[5]=5)
    [3710.53, 4102.98, 4623.21, 5189.07, 5800.57,    0.0,    0.0,    0.0,    0.0,    0.0],
    // Linha 6: camada D da extensão do barril (Tile_size[6]=2)
    [4167.74, 5445.49,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0],
    // Linha 7: célula D4 — região de transição barril↔tampa (Tile_size[7]=1)
    [3405.00,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0],
    // Linha 8: célula C9 (Tile_size[8]=1)
    [3511.85,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0],
    // Linha 9: cintilador especial (Tile_size[9]=1)
    [3551.50,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0],
    // Linha 10: cintilador especial (Tile_size[10]=1)
    [3551.50,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0],
    // Linha 11: célula de gap (Tile_size[11]=1)
    [3536.00,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0],
    // Linha 12: célula de crack (Tile_size[12]=1)
    [3536.00,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0],
    // Linha 13: MBTS outer (Tile_size[13]=1, phi_seg=8)
    [3566.00,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0],
    // Linha 14: MBTS inner (Tile_size[14]=1, phi_seg=8)
    [3566.00,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0],
];

// TILE_DZ[linha][idx_eta]: largura total em Z de cada célula Tile (mm)
// Metade desse valor é usada como semi-extensão na construção da caixa 3D
static TILE_DZ: [[f64; 10]; 15] = [
    // Linha 0: A barril
    [246.480, 246.480, 255.600, 255.610, 273.860, 283.000, 292.120, 319.510, 337.760, 292.120],
    // Linha 1: B barril
    [282.990, 283.000, 282.990, 301.250, 301.250, 328.640, 337.760, 365.160, 319.500,    0.0],
    // Linha 2: C barril (mesclada com B)
    [319.510, 328.640, 328.630, 346.900, 346.900, 374.280, 392.540, 365.150,    0.0,    0.0],
    // Linha 3: D barril
    [730.300, 739.440, 785.070, 912.880,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0],
    // Linha 4: A extensão
    [164.280, 461.912, 511.100, 547.610, 876.170,    0.0,    0.0,    0.0,    0.0,    0.0],
    // Linha 5: B extensão
    [292.060, 492.840, 547.610, 584.120, 638.870,    0.0,    0.0,    0.0,    0.0,    0.0],
    // Linha 6: D extensão
    [1186.48, 1369.02,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0],
    // Linha 7: D4
    [309.000,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0],
    // Linha 8: C9
    [94.7100,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0],
    // Linha 9: cintilador 1
    [15.0000,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0],
    // Linha 10: cintilador 2
    [15.0000,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0],
    // Linha 11: gap
    [ 8.0000,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0],
    // Linha 12: crack
    [ 8.0000,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0],
    // Linha 13: MBTS outer
    [20.0000,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0],
    // Linha 14: MBTS inner
    [20.0000,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0,    0.0],
];

// --- Calorímetro HEC (Hadronic End-Cap) ----------------------------------------
//
// HEC_R[linha][idx_eta]: raio transversal central da célula HEC (mm)
// O HEC fica nas tampas do detector → usa raio polar R em vez de Z como coordenada
// Z é fixo por camada lógica (definido em LayerCfg::h1/h2).
//
// Estrutura de linhas (de HECz/HECdz do .h):
//   Linhas 0-1 → camada lógica HEC 0 (duas sub-regiões de módulos)
//   Linhas 2-3 → camada lógica HEC 1
//   Linhas 4-5 → camada lógica HEC 2
//   Linha  6   → camada lógica HEC 3
//
// Número real de células em eta por linha (HEC_size[7]={14,13,12,12,11,12,11}):
static HEC_SIZE: [usize; 7] = [14, 13, 12, 12, 11, 12, 11];

static HEC_R: [[f64; 14]; 7] = [
    // Linha 0 — HEC camada 0, sub-região 1 (14 células)
    [1953.63, 1777.76, 1597.56, 1437.47, 1294.76, 1167.21, 1052.94,  950.382,  858.205,  775.278,  668.405,  545.996,  446.465,  386.875],
    // Linha 1 — HEC camada 0, sub-região 2 (13 células)
    [2008.09, 1881.11, 1690.42, 1521.01, 1370.00, 1235.03, 1114.11, 1005.59,   908.060,  820.287,  707.225,  577.746,  502.371,    0.0  ],
    // Linha 2 — HEC camada 1, sub-região 1 (12 células)
    [1951.08, 1774.10, 1596.30, 1437.80, 1296.15, 1169.26, 1060.37,  958.008,  860.888,  742.229,  606.344,  515.234,    0.0  ,    0.0  ],
    // Linha 3 — HEC camada 1, sub-região 2 (12 células)
    [2008.26, 1882.60, 1693.79, 1525.52, 1375.14, 1240.45, 1119.58, 1010.96,   913.220,  787.548,  643.565,  531.973,    0.0  ,    0.0  ],
    // Linha 4 — HEC camada 2, sub-região 1 (11 células)
    [1947.43, 1768.06, 1592.41, 1435.44, 1294.84, 1168.68, 1055.29,  953.266,  822.083,  671.786,  549.312,    0.0  ,    0.0  ,    0.0  ],
    // Linha 5 — HEC camada 2, sub-região 2 (12 células)
    [1986.52, 1842.34, 1659.31, 1495.74, 1349.24, 1217.77, 1099.62,  993.312,  856.619,  700.007,  572.389,  500.028,    0.0  ,    0.0  ],
    // Linha 6 — HEC camada 3 (11 células)
    [1916.61, 1726.20, 1556.04, 1403.63, 1266.87, 1143.96, 1033.36,  891.153,  728.228,  595.465,  510.411,    0.0  ,    0.0  ,    0.0  ],
];

// HEC_DR[linha][idx_eta]: largura radial (ΔR) de cada célula HEC (mm)
static HEC_DR: [[f64; 14]; 7] = [
    // Linha 0
    [160.737, 191.003, 169.396, 150.788, 134.625, 120.488, 108.053,  97.0569,  87.2970,  78.5560, 135.189, 109.630,  89.431,  29.75 ],
    // Linha 1
    [ 51.825, 202.126, 179.258, 159.561, 142.456, 127.495, 114.335, 102.699,   92.371,   83.174,  142.951, 116.007,  34.742,   0.0  ],
    // Linha 2
    [165.839, 188.131, 167.459, 149.535, 133.779, 119.994,  97.783, 106.943,   87.297,  150.022,  121.749,  60.469,   0.0  ,   0.0  ],
    // Linha 3
    [ 51.487, 199.818, 177.818, 158.723, 142.030, 127.352, 114.378, 102.866,   92.616,  158.728,  129.238,  93.946,   0.0  ,   0.0  ],
    // Linha 4
    [173.132, 185.615, 165.683, 148.259, 132.936, 119.394, 107.377,  96.676,  165.689,  134.906,  110.042,   0.0  ,   0.0  ,   0.0  ],
    // Linha 5
    [ 94.958, 193.413, 172.644, 154.486, 138.521, 124.410, 111.887, 100.738,  172.649,  140.573,  114.665,  30.056,   0.0  ,   0.0  ],
    // Linha 6
    [201.210, 179.604, 160.715, 144.105, 129.425, 116.399, 104.799, 179.610,  146.239,  119.288,   50.821,   0.0  ,   0.0  ,   0.0  ],
];

// =============================================================================
// LIMITES DA REGIÃO DE CRACK (transição barril ↔ tampa)
// Células fora desses limites são suprimidas na visualização
// =============================================================================
// O barril LAr termina em |η| ≈ 1.475 (BARREL_ETA_MAX)
const BARREL_ETA_MAX: f64 = 1.475;
// A tampa LAr começa em |η| ≈ 1.5 (ENDCAP_ETA_MIN)
const ENDCAP_ETA_MIN: f64 = 1.5;

// =============================================================================
// ENUMERAÇÃO DOS SUBDETECTORES
// =============================================================================
#[derive(Clone, Copy)]
enum SubDet {
    Tile,       // Hadrônico de telhas: barril, |η| < 1.7
    Hec,        // Hadrônico de tampas em LAr: 1.5 < |η| < 3.2
    LarBarrel,  // Eletromagnético de barril em LAr: |η| < 1.475
    LarEndCap,  // Eletromagnético de tampas em LAr: 1.375 < |η| < 3.2
}

// =============================================================================
// ESTRUTURA DE CONFIGURAÇÃO DE CAMADA
// Mapeia cada uma das 26 camadas lógicas do XML para seus parâmetros físicos
// =============================================================================
#[derive(Clone)]
struct LayerCfg {
    subdet:    SubDet, // Subdetector físico
    h1:        f64,    // Raio interno (Tile/LAr barril) ou z inicial (HEC), em mm
    h2:        f64,    // Raio externo (Tile/LAr barril) ou z final (HEC), em mm
    phi_seg:   usize,  // Número de segmentos em φ: 8, 64 ou 256
    tile_row:  usize,  // Linha primária em TILE_Z/TILE_DZ
    tile_row2: usize,  // Linha secundária (para camadas mescladas B+C)
    hec_row1:  usize,  // Linha HEC primária (ou única, quando hec_row1==hec_row2)
    hec_row2:  usize,  // Linha HEC secundária (para o merge de sub-regiões)
    lar_layer: usize,  // Índice de camada dentro do LAr (0–3)
}

impl LayerCfg {
    // Camada Tile simples: h1/h2 = raio interno/externo (mm), row = linha em TILE_Z
    fn tile(h1: f64, h2: f64, phi_seg: usize, row: usize) -> Self {
        LayerCfg {
            subdet: SubDet::Tile, h1, h2, phi_seg,
            tile_row: row, tile_row2: row,
            hec_row1: 0, hec_row2: 0, lar_layer: 0,
        }
    }

    // Camada Tile que funde (merge) duas linhas da tabela: usada em l=1 (BC barril)
    // O dz final é a média dos dois dz das sub-linhas
    fn tile_merge(h1: f64, h2: f64, row1: usize, row2: usize) -> Self {
        LayerCfg {
            subdet: SubDet::Tile, h1, h2, phi_seg: 64,
            tile_row: row1, tile_row2: row2,
            hec_row1: 0, hec_row2: 0, lar_layer: 0,
        }
    }

    // Camada HEC: h1/h2 = limites em z (mm) da rodela de absorção
    // row1==row2 → única sub-região; row1≠row2 → duas sub-regiões mescladas
    fn hec(h1: f64, h2: f64, row1: usize, row2: usize) -> Self {
        LayerCfg {
            subdet: SubDet::Hec, h1, h2, phi_seg: 64,
            tile_row: 0, tile_row2: 0, hec_row1: row1, hec_row2: row2, lar_layer: 0,
        }
    }

    // LAr Barril: h1/h2 = raio interno/externo (mm)
    // phi_seg = 64 (camadas 0,1) ou 256 (camadas 2,3)
    fn lar_b(h1: f64, h2: f64, phi_seg: usize, lyr: usize) -> Self {
        LayerCfg {
            subdet: SubDet::LarBarrel, h1, h2, phi_seg,
            tile_row: 0, tile_row2: 0, hec_row1: 0, hec_row2: 0, lar_layer: lyr,
        }
    }

    // LAr Tampa: h1/h2 não usados (calculados dinamicamente por laeb_h1/h2)
    fn lar_e(phi_seg: usize, lyr: usize) -> Self {
        LayerCfg {
            subdet: SubDet::LarEndCap, h1: 0.0, h2: 0.0, phi_seg,
            tile_row: 0, tile_row2: 0, hec_row1: 0, hec_row2: 0, lar_layer: lyr,
        }
    }
}

// =============================================================================
// TABELA DE CAMADAS — mapeia l=0..25 (índice XML) para LayerCfg
//
// NLAYER = NLAY_TILE + NLAY_HEC + 2*NLAY_LAR = 14 + 4 + 8 = 26
//
// Mapeamento dos índices e tamanhos (de eta_size[] e phi_size[] do .h):
//   l= 0..13 → TILE  (eta_size: 10,9,4,5,5,2,1,1,1,1,1,1,1,1 ; phi: 64,64,...,8,8)
//   l=14..17 → HEC   (eta_size: 14,13,12,12               ; phi: 64,64,64,64)
//   l=18..21 → LArBa (eta_size: 61,451,57,27               ; phi: 64,64,256,256)
//   l=22..25 → LArEb (eta_size: 12,216,51,34               ; phi: 64,64,256,256)
// =============================================================================
fn build_layer_table() -> Vec<LayerCfg> {
    vec![
        // ---- TILE BARRIL (l=0..2) ------------------------------------------------
        /* l= 0 */ LayerCfg::tile(2300.0, 2600.0, 64,  0), // A barril (eta_size=10)
        /* l= 1 */ LayerCfg::tile_merge(2600.0, 3440.0, 1, 2), // BC barril mesclados (eta_size=9)
        /* l= 2 */ LayerCfg::tile(3440.0, 3820.0, 64,  3), // D barril (eta_size=4)

        // ---- TILE EXTENSÃO DO BARRIL (l=3..5) ------------------------------------
        /* l= 3 */ LayerCfg::tile(2300.0, 2600.0, 64,  4), // A extensão (eta_size=5)
        /* l= 4 */ LayerCfg::tile(2600.0, 3140.0, 64,  5), // B extensão (eta_size=5)
        /* l= 5 */ LayerCfg::tile(3140.0, 3820.0, 64,  6), // D extensão (eta_size=2)

        // ---- TILE CÉLULAS DE TRANSIÇÃO / GAP / CRACK (l=6..13) ------------------
        /* l= 6 */ LayerCfg::tile(3440.0, 3820.0, 64,  7), // D4 gap (eta_size=1)
        /* l= 7 */ LayerCfg::tile(2990.0, 3440.0, 64,  8), // C9 crack (eta_size=1)
        /* l= 8 */ LayerCfg::tile(2632.0, 2959.0, 64,  9), // cintilador (eta_size=1)
        /* l= 9 */ LayerCfg::tile(2305.0, 2632.0, 64, 10), // cintilador (eta_size=1)
        /* l=10 */ LayerCfg::tile(1885.0, 2305.0, 64, 11), // gap cell (eta_size=1)
        /* l=11 */ LayerCfg::tile(1465.0, 1885.0, 64, 12), // crack cell (eta_size=1)
        /* l=12 */ LayerCfg::tile( 426.0,  876.0,  8, 13), // MBTS outer (eta_size=1, phi=8)
        /* l=13 */ LayerCfg::tile( 153.0,  426.0,  8, 14), // MBTS inner (eta_size=1, phi=8)

        // ---- HEC (l=14..17) -------------------------------------------------------
        // hec(h1,h2,row1,row2): h1/h2 em mm (posição z da rodela de absorção)
        // row1==row2 → sub-região única; row1≠row2 → eta=0 usa row1, eta≥1 usa row2
        /* l=14 */ LayerCfg::hec(4350.0, 4630.0, 0, 0), // HEC cam.0 (eta_size=14)
        /* l=15 */ LayerCfg::hec(4630.0, 5100.0, 1, 2), // HEC cam.1 (eta_size=13)
        /* l=16 */ LayerCfg::hec(5130.0, 5590.0, 3, 4), // HEC cam.2 (eta_size=12)
        /* l=17 */ LayerCfg::hec(5590.0, 6050.0, 5, 6), // HEC cam.3 (eta_size=12)

        // ---- LAr BARRIL (l=18..21) ------------------------------------------------
        // lar_b(r_interno_mm, r_externo_mm, phi_seg, camada_lar)
        /* l=18 */ LayerCfg::lar_b(1421.73, 1438.58,  64, 0), // pré-amostragem (eta_size=61)
        /* l=19 */ LayerCfg::lar_b(1481.75, 1579.00,  64, 1), // tiras finas     (eta_size=451)
        /* l=20 */ LayerCfg::lar_b(1581.00, 1840.00, 256, 2), // células médias  (eta_size=57)
        /* l=21 */ LayerCfg::lar_b(1840.00, 1984.70, 256, 3), // traseira        (eta_size=27)

        // ---- LAr TAMPA (l=22..25) -------------------------------------------------
        // lar_e(phi_seg, camada_lar): posições z calculadas por laeb_h1/h2
        /* l=22 */ LayerCfg::lar_e( 64, 0), // pré-amostragem (eta_size=12)
        /* l=23 */ LayerCfg::lar_e( 64, 1), // tiras           (eta_size=216)
        /* l=24 */ LayerCfg::lar_e(256, 2), // células médias  (eta_size=51)
        /* l=25 */ LayerCfg::lar_e(256, 3), // traseira        (eta_size=34)
    ]
}

// =============================================================================
// FÍSICA: η → z (pseudorapidez para coordenada axial)
//
// Definição: η = -ln[tan(θ/2)], portanto z = R · sinh(η)
// Usada no LAr barril onde R é fixo e z varia com η
// =============================================================================
#[inline]
fn eta_to_z(eta: f64, r_transverse: f64) -> f64 {
    r_transverse * eta.sinh()
}

// Conversão η → θ (ângulo polar) — para diagnóstico
#[inline]
fn eta_to_theta(eta: f64) -> f64 {
    2.0 * (-eta).exp().atan()
}

// =============================================================================
// ETA DO LAr BARRIL — posições centrais de cada célula (LaBa_eta do .h)
//
// Camada 0 (pré-amostragem, LaBa_size[0]=61):
//   Δη = 0.025, células em η = 0.0125, 0.0375, ..., 1.5125
//
// Camada 1 (tiras, LaBa_size[1]=451):
//   Δη = 0.003125 para idx=0..447 (448 células finas)
//   Δη = 0.025    para idx=448,449,450 (3 células de transição: η=1.4125/1.4375/1.4625)
//
// Camada 2 (meio, LaBa_size[2]=57):  ← [BUG-1 CORRIGIDO]
//   Δη = 0.025 para idx=0..55 (η = 0.0125 + 0.025*idx)
//   Δη = 0.05  para idx=56   (η = 1.4375, célula de transição)
//
// Camada 3 (traseira, LaBa_size[3]=27):
//   Δη = 0.05, células em η = 0.025, 0.075, ..., 1.325
// =============================================================================
fn laba_eta(layer: usize, idx: usize) -> f64 {
    match layer {
        // Camada 0: 61 células uniformes a partir de η=0.0125, passo 0.025
        0 => 0.0125 + 0.025 * idx as f64,

        // Camada 1: 451 células — 448 finas + 3 especiais de transição
        // Os últimos 3 índices (448, 449, 450) têm posições distintas do padrão
        // conforme LaBa_eta[1] do .h (linha terminada em ..., 1.4125, 1.4375, 1.4625)
        1 => {
            if idx < 448 {
                // Região fina: Δη = 0.003125
                0.0015625 + 0.003125 * idx as f64
            } else {
                // [BUG-3 CORRIGIDO] Células de transição barril↔crack (Δη=0.025 cada)
                // η=1.4125 (idx=448), 1.4375 (idx=449), 1.4625 (idx=450)
                [1.4125, 1.4375, 1.4625][idx - 448]
            }
        }

        // Camada 2: 57 células — todas com Δη=0.025, última (idx=56) é célula especial
        // [BUG-1 CORRIGIDO] Antes iniciava em 0.025 e usava slope 0.1 para idx>=44
        2 => {
            if idx < 56 {
                // 56 células regulares: η = 0.0125, 0.0375, ..., 1.3875
                0.0125 + 0.025 * idx as f64
            } else {
                // Célula de transição: 1.3875 + 0.05 = 1.4375 (pula 1.4125)
                1.4375
            }
        }

        // Camada 3: 27 células uniformes, passo 0.05, a partir de η=0.025
        3 => 0.025 + 0.05 * idx as f64,

        _ => 0.0,
    }
}

// Largura em eta (Δη) de cada célula do LAr barril — de LaBa_deta do .h
fn laba_deta(layer: usize, idx: usize) -> f64 {
    match layer {
        // Camada 0: granularidade uniforme
        0 => 0.025,

        // Camada 1: granularidade variável
        // [BUG-3 CORRIGIDO] as células de transição (448..450) têm Δη=0.025
        1 => {
            if idx < 448 { 0.003125 }
            else         { 0.025    } // células de transição finais
        }

        // Camada 2: granularidade variável
        // [BUG-2 CORRIGIDO] Antes usava 0.1 para idx>=44 — completamente errado
        // O .h mostra Δη=0.025 para todos, exceto a última célula (idx=56) com Δη=0.05
        2 => {
            if idx < 56 { 0.025 }
            else        { 0.05  } // célula de transição final (η=1.4375)
        }

        // Camada 3: granularidade uniforme
        3 => 0.05,

        _ => 0.05,
    }
}

// Número de células em eta por camada do LAr barril (LaBa_size[4]={61,451,57,27})
fn laba_ncells(layer: usize) -> usize {
    [61, 451, 57, 27][layer]
}

// =============================================================================
// ETA DO LAr TAMPA (EndCap) — posições centrais (LaEb_eta do .h)
//
// Camada 0 (pré-amostragem, LaEb_size[0]=12):
//   Δη=0.025, de η=1.52078 a 1.79578
//
// Camada 1 (tiras, LaEb_size[1]=216): estrutura complexa com 5 sub-regiões
//   idx=0:    η=1.40828, Δη=0.05  (1 célula coarse na região de overlap)
//   idx=1..3: η=1.44578/1.47078/1.49578, Δη=0.025 (3 células coarse)
//   idx=4..99:    Δη=0.003125 (96 células finas, η de 1.50984 a 1.80672)
//   idx=100..147: Δη=0.00416667 (48 células médias, η de 1.81036 a 1.99786)
//   idx=148..207: Δη=0.00625 (60 células médias, η de 2.01141 a 2.40516)
//   idx=208..215: Δη=0.025 (8 células grossas, η de 2.42078 a 2.49578)
//
// Camada 2 (meio, LaEb_size[2]=51):
//   idx=0..3: coarse [1.40828, 1.44578, 1.47078, 1.49578] (< ENDCAP_ETA_MIN → suprimidas)
//   idx=4..43: Δη=0.025 (40 células, η de 1.52078 a 2.49578)
//   idx=44..50: Δη=0.1  (7 células, η de 2.55828 a 3.15828)
//
// Camada 3 (traseira, LaEb_size[3]=34):
//   idx=0..11:  Δη=0.025 (η de 1.47078 a 1.74578)
//   idx=12..26: Δη=0.05  (η de 1.78328 a 2.48328)
//   idx=27..33: Δη=0.1   (η de 2.55828 a 3.15828)
// =============================================================================
fn laeb_eta(layer: usize, idx: usize) -> f64 {
    match layer {
        // Camada 0: pré-amostragem da tampa, uniforme
        0 => 1.52078 + 0.025 * idx as f64,

        // Camada 1: tiras da tampa com estrutura de 5 sub-regiões
        1 => {
            // 4 células de transição barril↔tampa explicitadas no .h
            let coarse: [f64; 4] = [1.40828, 1.44578, 1.47078, 1.49578];
            if idx < 4 {
                coarse[idx]
            } else if idx < 4 + 96 {
                // Células finas: Δη=0.003125
                1.50984 + 0.003125 * (idx - 4) as f64
            } else if idx < 4 + 96 + 48 {
                // Células médias: Δη=0.00416667
                1.81036 + 0.00416667 * (idx - 4 - 96) as f64
            } else if idx < 4 + 96 + 48 + 60 {
                // Células médias-grossas: Δη=0.00625
                2.01141 + 0.00625 * (idx - 4 - 96 - 48) as f64
            } else {
                // Células grossas: Δη=0.025
                2.42078 + 0.025 * (idx - 4 - 96 - 48 - 60) as f64
            }
        }

        // Camada 2: meio da tampa
        2 => {
            let coarse: [f64; 4] = [1.40828, 1.44578, 1.47078, 1.49578];
            if idx < 4 {
                coarse[idx] // serão suprimidas pelo crack guard (< ENDCAP_ETA_MIN)
            } else if idx < 4 + 40 {
                // Região central: Δη=0.025
                1.52078 + 0.025 * (idx - 4) as f64
            } else if idx < 4 + 40 + 7 {
                // Alta eta: Δη=0.1
                2.55828 + 0.1 * (idx - 44) as f64
            } else {
                0.0 // inválido
            }
        }

        // Camada 3: traseira da tampa com 3 sub-regiões
        3 => {
            if idx < 12 {
                // Baixo eta: Δη=0.025
                1.47078 + 0.025 * idx as f64
            } else if idx < 12 + 15 {
                // Médio eta: Δη=0.05
                1.78328 + 0.05 * (idx - 12) as f64
            } else if idx < 12 + 15 + 7 {
                // Alto eta: Δη=0.1
                2.55828 + 0.1 * (idx - 27) as f64
            } else {
                0.0
            }
        }

        _ => 0.0,
    }
}

// Largura em eta (Δη) de cada célula da tampa LAr — de LaEb_deta do .h
fn laeb_deta(layer: usize, idx: usize) -> f64 {
    match layer {
        // Camada 0: uniforme
        0 => 0.025,

        // Camada 1: estrutura idêntica à de laeb_eta
        // Atenção: idx=0 tem Δη=0.05 (primeira célula de transição é mais larga)
        1 => {
            if idx < 1          { 0.05       } // célula de transição coarse-1
            else if idx < 4     { 0.025      } // células de transição coarse-2,3,4
            else if idx < 4+96  { 0.003125   } // finas
            else if idx < 4+96+48 { 0.00416667 } // médias
            else if idx < 4+96+48+60 { 0.00625 } // médias-grossas
            else                { 0.025      } // grossas finais
        }

        // Camada 2: variável
        2 => {
            if idx < 1 { 0.05 }         // primeira célula coarse
            else if idx < 44 { 0.025 }  // região central
            else             { 0.1   }  // alta eta
        }

        // Camada 3: variável por sub-região
        3 => {
            if idx < 12      { 0.025 }
            else if idx < 27 { 0.05  }
            else             { 0.1   }
        }

        _ => 0.05,
    }
}

// Número de células em eta por camada da tampa LAr (LaEb_size[4]={12,216,51,34})
fn laeb_ncells(layer: usize) -> usize {
    [12, 216, 51, 34][layer]
}

// =============================================================================
// LIMITES z DA TAMPA LAr — face interna (LaEb_h1) e externa (LaEb_h2)
//
// Esses valores definem a espessura e posição axial de cada camada da tampa.
// Para a maioria das camadas o valor é fixo, mas camada 2 e 3 têm variação
// interna conforme o índice de eta (estrutura em "escada").
//
// De LaEb_h1[4][216] do .h:
//   Camada 0: h1 = 3680.75 mm (12 células)
//   Camada 1: h1 = 3754.24 mm (todas 216 células)
//   Camada 2: h1 = 3800.73 mm (idx 0..43) ou 3754.24 mm (idx 44..50)
//   Camada 3: h1 = 4156.24 mm (idx 0..26) ou 4201.25 mm (idx 27..33)
//
// De LaEb_h2[4][216] do .h:
//   Camada 0: h2 = 3714.25 mm
//   Camada 1: h2 = 3800.73 mm
//   Camada 2: h2 = 4156.24 mm (idx 0..43) ou 4201.25 mm (idx 44..50)
//   Camada 3: h2 = 4243.26 mm
// =============================================================================

// Posição z da face interna (mais próxima do IP) da camada da tampa LAr (mm)
fn laeb_h1(layer: usize, idx: usize) -> f64 {
    match layer {
        // Camada 2: variação conforme eta (estrutura em escada)
        2 => if idx < 44 { 3800.73 } else { 3754.24 },
        // Camada 3: variação conforme eta
        3 => if idx < 27 { 4156.24 } else { 4201.25 },
        // Camadas 0 e 1: valor fixo
        _ => [3680.75, 3754.24, 3800.73, 4156.24][layer],
    }
}

// Posição z da face externa (mais afastada do IP) da camada da tampa LAr (mm)
// [BUG-4 CORRIGIDO]: camada 2 retornava sempre 4156.24, mas idx>=44 devem ter 4201.25
fn laeb_h2(layer: usize, idx: usize) -> f64 {
    match layer {
        // Camada 2: as 7 células finais (idx=44..50) têm h2=4201.25 conforme LaEb_h2 do .h
        2 => if idx < 44 { 4156.24 } else { 4201.25 },
        // Demais camadas: valor fixo (uniform nas tabelas do .h)
        _ => [3714.25, 3800.73, 4156.24, 4243.26][layer],
    }
}

// =============================================================================
// ÂNGULO PHI CENTRAL DA FATIA j
//
// O detector é dividido em `phi_seg` fatias uniformes de 0 a 2π.
// O offset de π/2 alinha φ=0 com o eixo +Y no sistema Three.js.
// =============================================================================
#[inline]
fn phi_center(j: usize, phi_seg: usize) -> f64 {
    let dphi = 2.0 * PI / phi_seg as f64; // largura angular de cada fatia
    dphi / 2.0 + PI / 2.0 + j as f64 * dphi
}

// =============================================================================
// GUARDA DE CRACK (transição barril ↔ tampa)
//
// Retorna `true` se a célula deve ser suprimida (está na região morta).
// - Células do barril além de |η|=1.475 são suprimidas
// - Células da tampa abaixo de |η|=1.5 são suprimidas
// =============================================================================
#[inline]
fn in_barrel_crack(eta_abs: f64, is_barrel: bool) -> bool {
    if is_barrel {
        eta_abs > BARREL_ETA_MAX   // barril: suprime se além do limite
    } else {
        eta_abs < ENDCAP_ETA_MIN   // tampa: suprime se antes do início
    }
}

// =============================================================================
// CÁLCULO DA POSIÇÃO 3D DA CÉLULA
//
// Entrada: configuração da camada + índices (eta, phi)
// Saída:   (cx, cy, cz, sx, sy, sz) em mm
//   cx,cy,cz = centro da célula no espaço 3D cartesiano
//   sx,sy,sz = semi-extensões (metade do tamanho) em cada eixo
//
// Retorna None se a célula é inválida (fora do range, 0.0 na tabela, crack)
// =============================================================================
fn compute_cell(cfg: &LayerCfg, eta_idx: i32, phi_idx: usize)
    -> Option<(f64, f64, f64, f64, f64, f64)>
{
    let eta_abs = eta_idx.unsigned_abs() as usize;
    // z_sign: +1 para o lado A (η>0), -1 para o lado C (η<0)
    let z_sign  = if eta_idx >= 0 { 1.0_f64 } else { -1.0_f64 };
    let phi     = phi_center(phi_idx, cfg.phi_seg);
    let dphi    = 2.0 * PI / cfg.phi_seg as f64;
    let sin_phi = phi.sin();
    let cos_phi = phi.cos();

    match cfg.subdet {
        // -----------------------------------------------------------------
        // TILE — barras cilíndricas com z da tabela TILE_Z
        // Geometria: raio fixo [h1, h2], posição z e largura lidas da tabela
        // -----------------------------------------------------------------
        SubDet::Tile => {
            let row = cfg.tile_row;
            if eta_abs >= 10 { return None; } // TILE_Z tem no máximo 10 slots de eta

            let z_val = TILE_Z[row][eta_abs];
            let dz    = TILE_DZ[row][eta_abs];
            if z_val == 0.0 || dz == 0.0 { return None; } // célula inexistente

            let r_mid = (cfg.h1 + cfg.h2) / 2.0;
            let dr    = cfg.h2 - cfg.h1;

            // Para camadas mescladas (l=1, BC barril): média dos dz das duas sub-linhas
            // Isso suaviza a transição visual entre as sub-regiões B e C
            let dz_final = if cfg.tile_row2 != row && TILE_DZ[cfg.tile_row2][eta_abs] > 0.0 {
                (dz + TILE_DZ[cfg.tile_row2][eta_abs]) / 2.0
            } else {
                dz
            };

            // Conversão polar→cartesiano: x = -r·sin(φ), y = r·cos(φ)
            let cx = -r_mid * sin_phi;
            let cy =  r_mid * cos_phi;
            let cz =  z_sign * z_val;

            // semi-extensões: (dr/2, r·Δφ/2, dz/2)
            Some((cx, cy, cz, dr / 2.0, r_mid * dphi / 2.0, dz_final / 2.0))
        }

        // -----------------------------------------------------------------
        // HEC — anéis no plano z=cte, raio lido de HEC_R
        // Geometria: z fixo por camada [h1,h2], raio e ΔR da tabela
        // -----------------------------------------------------------------
        SubDet::Hec => {
            let (r_val, dr_val) = if cfg.hec_row1 == cfg.hec_row2 {
                // Sub-região única: consulta diretamente HEC_R[row1][eta_abs]
                if eta_abs >= HEC_SIZE[cfg.hec_row1] { return None; }
                (HEC_R[cfg.hec_row1][eta_abs], HEC_DR[cfg.hec_row1][eta_abs])
            } else {
                // Duas sub-regiões: eta=0 usa row1, eta>=1 usa row2 com offset
                if eta_abs == 0 {
                    (HEC_R[cfg.hec_row1][0], HEC_DR[cfg.hec_row1][0])
                } else {
                    let i2 = eta_abs - 1;
                    if i2 >= HEC_SIZE[cfg.hec_row2] { return None; }
                    (HEC_R[cfg.hec_row2][i2], HEC_DR[cfg.hec_row2][i2])
                }
            };

            if r_val == 0.0 { return None; } // posição inválida na tabela

            let z_mid = (cfg.h1 + cfg.h2) / 2.0;
            let dz    = cfg.h2 - cfg.h1;

            let cx = -r_val * sin_phi;
            let cy =  r_val * cos_phi;
            let cz =  z_sign * z_mid;

            // semi-extensões: (dr/2, r·Δφ/2, dz/2)
            Some((cx, cy, cz, dr_val / 2.0, r_val * dphi / 2.0, dz / 2.0))
        }

        // -----------------------------------------------------------------
        // LAr BARRIL — cilindros concêntricos, z calculado por z = R·sinh(η)
        // Geometria: raio fixo por camada [h1,h2], z varia com η
        // -----------------------------------------------------------------
        SubDet::LarBarrel => {
            let lar = cfg.lar_layer;
            if eta_abs >= laba_ncells(lar) { return None; }

            let eta_c     = laba_eta(lar, eta_abs);
            let eta_c_abs = eta_c.abs();

            // Suprime células além do limite do barril (região de crack)
            if in_barrel_crack(eta_c_abs, true) { return None; }

            let r_mid = (cfg.h1 + cfg.h2) / 2.0;
            let dr    = cfg.h2 - cfg.h1;

            // FÍSICA: z = R·sinh(η) — mapeamento exato, não linear!
            let cz = z_sign * eta_to_z(eta_c_abs, r_mid);
            let cx = -r_mid * sin_phi;
            let cy =  r_mid * cos_phi;

            // Extensão em z por regra da cadeia: dz = R·cosh(η)·Δη
            // Limitada a 800 mm para evitar artefatos visuais em células muito grandes
            let deta = laba_deta(lar, eta_abs);
            let sz   = (r_mid * eta_c_abs.cosh() * deta / 2.0).min(800.0);

            // semi-extensões: (dr/2, r·Δφ/2, sz)
            // sz mínimo de 1 mm para manter células visíveis
            Some((cx, cy, cz, dr / 2.0, r_mid * dphi / 2.0, sz.max(1.0)))
        }

        // -----------------------------------------------------------------
        // LAr TAMPA — discos em z=cte, raio calculado por r = z/sinh(η)
        // Geometria: z fixo por célula [laeb_h1, laeb_h2], r varia com η
        // -----------------------------------------------------------------
        SubDet::LarEndCap => {
            let lar = cfg.lar_layer;
            if eta_abs >= laeb_ncells(lar) { return None; }

            let eta_c = laeb_eta(lar, eta_abs);
            if eta_c == 0.0 { return None; } // eta=0 → célula inválida
            let eta_c_abs = eta_c.abs();

            // Suprime células abaixo do limite da tampa (região de crack)
            if in_barrel_crack(eta_c_abs, false) { return None; }

            // Limites z da célula (variam com eta para camada 2 e 3)
            // [BUG-4 CORRIGIDO] laeb_h2 agora retorna 4201.25 para camada 2, idx>=44
            let h1    = laeb_h1(lar, eta_abs);
            let h2    = laeb_h2(lar, eta_abs);
            let z_mid = (h1 + h2) / 2.0;
            let dz    = h2 - h1;

            // FÍSICA INVERSA: dado z e η → r = z/sinh(η)
            // .max(0.001) evita divisão por zero em η ≈ 0
            let sinh_eta = eta_c_abs.sinh().max(0.001);
            let r_perp   = z_mid / sinh_eta;

            let cx = -r_perp * sin_phi;
            let cy =  r_perp * cos_phi;
            let cz =  z_sign * z_mid;

            // Extensão radial aproximada: dr ≈ dz·Δη·cosh(η)/sinh²(η)
            // Limitada a 500 mm para evitar células excessivamente grandes
            let deta      = laeb_deta(lar, eta_abs);
            let dr_approx = (z_mid * deta / (sinh_eta * sinh_eta) * eta_c_abs.cosh())
                .abs().min(500.0);

            // semi-extensões: (dr/2, r·Δφ/2, dz/2)
            // dr mínimo de 5 mm para manter células visíveis
            Some((cx, cy, cz, dr_approx.max(5.0), r_perp * dphi / 2.0, dz / 2.0))
        }
    }
}

// =============================================================================
// CONSTRUÇÃO DA MATRIZ DE TRANSFORMAÇÃO 4×4 (column-major para Three.js)
//
// Three.js InstancedMesh espera a matriz em ordem column-major (colunas primeiro).
// A matriz combina:
//   - Escala não-uniforme: (sx, sy, sz) — tamanho da caixa em cada eixo
//   - Rotação em φ: orienta a célula azimutalmente no detector
//   - Translação: posiciona a célula em (cx, cy, cz) no espaço 3D
//
// Os parâmetros cx,cy,cz e sx,sy,sz devem estar em METROS (fator 0.001 aplicado
// antes de chamar esta função, convertendo de mm para m).
// =============================================================================
fn build_matrix(cx: f64, cy: f64, cz: f64, sx: f64, sy: f64, sz: f64, phi: f64) -> [f32; 16] {
    let (s, c) = (phi.sin(), phi.cos()); // sin/cos do ângulo azimutal
    let s32 = |v: f64| v as f32;        // converte f64 → f32

    // Matriz 4×4 column-major (16 floats):
    // Coluna 0: eixo X local (perpendicular ao raio, direção φ), escalado por sx
    // Coluna 1: eixo Y local (direção radial, aponta para fora), escalado por sy
    // Coluna 2: eixo Z local (ao longo do feixe), escalado por sz
    // Coluna 3: posição de translação (cx, cy, cz, 1.0)
    [
        s32(-s * sx),  s32(c * sx),  0.0,     0.0,  // Coluna 0
        s32(-c * sy),  s32(-s * sy), 0.0,     0.0,  // Coluna 1
        0.0,           0.0,          s32(sz), 0.0,  // Coluna 2
        s32(cx),       s32(cy),      s32(cz), 1.0,  // Coluna 3 (translação)
    ]
}

// =============================================================================
// MAPEAMENTO DE ENERGIA → COR (escala "jet" arco-íris normalizada)
//
// t ∈ [0,1] onde t=0 → azul (energia mínima), t=1 → vermelho (energia máxima)
// Idêntico à escala "jet" usada em displays de física de partículas:
//   [0.00, 0.25]: azul → ciano    (g cresce, b=1)
//   [0.25, 0.50]: ciano → verde   (b cai, g=1)
//   [0.50, 0.75]: verde → amarelo (r cresce, g=1)
//   [0.75, 1.00]: amarelo → verm. (g cai, r=1)
// =============================================================================
fn energy_color(t: f32) -> (f32, f32, f32) {
    let t = t.clamp(0.0, 1.0);
    if t < 0.25 {
        let u = t / 0.25;
        (0.0, u, 1.0)          // azul → ciano
    } else if t < 0.5 {
        let u = (t - 0.25) / 0.25;
        (0.0, 1.0, 1.0 - u)   // ciano → verde
    } else if t < 0.75 {
        let u = (t - 0.5) / 0.25;
        (u, 1.0, 0.0)          // verde → amarelo
    } else {
        let u = (t - 0.75) / 0.25;
        (1.0, 1.0 - u, 0.0)   // amarelo → vermelho
    }
}

// =============================================================================
// PONTO DE ENTRADA PÚBLICO DO WASM
//
// Única função exportada para JavaScript.
//
// FLUXO:
//   1. Parseia o XML byte a byte (streaming), acumulando energia por célula
//      no HashMap<(layer, eta_idx, phi_idx), energia_MeV>
//   2. Calcula min/max de energia para normalização de cor
//   3. Para cada célula com energia > 0:
//      a. Determina a LayerCfg via build_layer_table()
//      b. Calcula posição 3D via compute_cell()
//      c. Constrói matriz 4×4 via build_matrix()
//      d. Mapeia energia para cor via energy_color()
//   4. Empacota tudo em Float32Arrays e retorna objeto JavaScript
//
// RETORNO (objeto JS):
//   .matrices  — Float32Array, count×16 floats (matrizes 4×4)
//   .colors    — Float32Array, count×3  floats (RGB por célula)
//   .energies  — Float32Array, count×1  float  (energia normalizada [0,1])
//   .layers    — Float32Array, count×1  float  (índice de camada 0–25)
//   .etas      — Float32Array, count×1  float  (índice de eta)
//   .phis      — Float32Array, count×1  float  (índice de phi)
//   .count     — Number (total de células renderizáveis)
//   .maxEnergy — Number (energia máxima em MeV)
//   .minEnergy — Number (energia mínima em MeV)
// =============================================================================
#[wasm_bindgen]
pub fn process_xml_data(xml_bytes: &[u8]) -> Result<JsValue, JsValue> {
    // Redireciona pânicos Rust para console.error() no browser
    console_error_panic_hook::set_once();

    // HashMap: chave = (camada, idx_eta, idx_phi), valor = energia em MeV
    let mut energy_map: HashMap<(i32, i32, i32), f64> = HashMap::new();

    // Parser XML em modo streaming (processa byte a byte, memória constante)
    let mut reader = Reader::from_reader(xml_bytes);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();

    // Lê evento por evento até o fim do arquivo XML
    loop {
        match reader.read_event_into(&mut buf) {
            // Processa tags self-closing (<cell .../>) e de abertura (<cell ...>)
            Ok(Event::Empty(e)) | Ok(Event::Start(e)) => {
                if e.name().as_ref() == b"cell" {
                    // Atributos esperados de cada <cell>
                    let mut layer = None::<i32>; // l="camada"  (0–25)
                    let mut eta   = None::<i32>; // eta="índice de η"
                    let mut phi   = None::<i32>; // phi="índice de φ"
                    let mut e_val = None::<f64>; // e="energia em MeV"

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

                    // Acumula energia apenas se todos os 4 atributos foram encontrados
                    if let (Some(l), Some(et), Some(ph), Some(en)) = (layer, eta, phi, e_val) {
                        // or_insert(0.0): cria entrada zerada na primeira ocorrência
                        *energy_map.entry((l, et, ph)).or_insert(0.0) += en;
                    }
                }
            }
            Ok(Event::Eof) => break, // fim do XML
            Err(_) => break,         // erro de parsing: aborta silenciosamente
            _ => {}                  // outros eventos (comentários, etc.): ignora
        }
        buf.clear(); // reutiliza o buffer para economizar alocações
    }

    // Carrega a tabela de configuração das 26 camadas
    let layers = build_layer_table();

    // Fator de escala: converte mm → metros para o Three.js
    let scale = 0.001_f64;

    // Calcula energia máxima entre células com E > 0
    // NEG_INFINITY como inicial garante que qualquer E>0 vença; .max(1.0) evita div/0
    let max_e = energy_map.values().copied()
        .filter(|e| *e > 0.0)
        .fold(f64::NEG_INFINITY, f64::max).max(1.0);

    // Calcula energia mínima entre células com E > 0
    let min_e = energy_map.values().copied()
        .filter(|e| *e > 0.0)
        .fold(f64::INFINITY, f64::min).min(max_e);

    // Vetores de saída (acumulados célula a célula)
    let mut matrices:   Vec<f32> = Vec::new(); // 16 floats por célula
    let mut colors:     Vec<f32> = Vec::new(); // 3 floats (RGB)
    let mut energies:   Vec<f32> = Vec::new(); // 1 float (energia normalizada)
    let mut layers_out: Vec<f32> = Vec::new(); // 1 float (índice de camada)
    let mut etas_out:   Vec<f32> = Vec::new(); // 1 float (índice de eta)
    let mut phis_out:   Vec<f32> = Vec::new(); // 1 float (índice de phi)

    for (&(l, et, ph), &energy) in &energy_map {
        if energy <= 0.0 { continue; } // ignora células sem depósito de energia

        let l_idx = l as usize;
        if l_idx >= layers.len() { continue; } // camada fora do range válido
        let cfg = &layers[l_idx];

        if (ph as usize) >= cfg.phi_seg { continue; } // phi fora do range da camada

        // Calcula posição e dimensões 3D da célula
        if let Some((cx, cy, cz, sx, sy, sz)) = compute_cell(cfg, et, ph as usize) {
            let phi_a = phi_center(ph as usize, cfg.phi_seg);

            // Constrói a matriz 4×4 em metros (fator de escala mm→m)
            let mat = build_matrix(
                cx * scale, cy * scale, cz * scale, // centro em metros
                sx * scale, sy * scale, sz * scale, // semi-extensões em metros
                phi_a                               // ângulo em radianos
            );
            matrices.extend_from_slice(&mat);

            // Normaliza energia: t = (E - E_min) / (E_max - E_min)
            // Se todas as energias são iguais, usa t=1 (cor máxima)
            let t = if max_e > min_e {
                ((energy - min_e) / (max_e - min_e)) as f32
            } else {
                1.0_f32
            };

            // Cor RGB a partir da escala jet
            let (r, g, b) = energy_color(t);
            colors.push(r);
            colors.push(g);
            colors.push(b);

            // Metadados para filtros e tooltips no JavaScript
            energies.push(t);
            layers_out.push(l as f32);
            etas_out.push(et as f32);
            phis_out.push(ph as f32);
        }
    }

    // Total de células 3D geradas (cada matriz tem 16 floats)
    let count = (matrices.len() / 16) as u32;

    // ==========================================================================
    // EMPACOTAMENTO EM ARRAYS JAVASCRIPT
    //
    // Float32Array é o tipo nativo de 32 bits em JavaScript e o formato direto
    // que a GPU consome via InstancedMesh e BufferAttribute do Three.js.
    // ==========================================================================

    // Matrizes 4×4 de transformação (count × 16 floats)
    let mat_array = Float32Array::new_with_length(matrices.len() as u32);
    mat_array.copy_from(&matrices);

    // Cores RGB (count × 3 floats)
    let col_array = Float32Array::new_with_length(colors.len() as u32);
    col_array.copy_from(&colors);

    // Energias normalizadas [0,1] (count × 1 float)
    let eng_array = Float32Array::new_with_length(energies.len() as u32);
    eng_array.copy_from(&energies);

    // Índices de camada (count × 1 float)
    let lay_array = Float32Array::new_with_length(layers_out.len() as u32);
    lay_array.copy_from(&layers_out);

    // Índices de eta (count × 1 float)
    let eta_array = Float32Array::new_with_length(etas_out.len() as u32);
    eta_array.copy_from(&etas_out);

    // Índices de phi (count × 1 float)
    let phi_array = Float32Array::new_with_length(phis_out.len() as u32);
    phi_array.copy_from(&phis_out);

    // Empacota tudo em um objeto JavaScript {}
    let obj = Object::new();
    Reflect::set(&obj, &"matrices".into(),  &mat_array).unwrap();  // 16 floats/célula
    Reflect::set(&obj, &"colors".into(),    &col_array).unwrap();  // 3 floats/célula (RGB)
    Reflect::set(&obj, &"energies".into(),  &eng_array).unwrap();  // 1 float/célula [0,1]
    Reflect::set(&obj, &"layers".into(),    &lay_array).unwrap();  // 1 float/célula (índice)
    Reflect::set(&obj, &"etas".into(),      &eta_array).unwrap();  // 1 float/célula (índice)
    Reflect::set(&obj, &"phis".into(),      &phi_array).unwrap();  // 1 float/célula (índice)
    Reflect::set(&obj, &"count".into(),     &(count as f64).into()).unwrap(); // total de células
    Reflect::set(&obj, &"maxEnergy".into(), &max_e.into()).unwrap(); // energia máx em MeV
    Reflect::set(&obj, &"minEnergy".into(), &min_e.into()).unwrap(); // energia mín em MeV

    // Retorna o objeto JS (erros viram exceções no browser)
    Ok(obj.into())
}