// =============================================================================
// lib.rs — Módulo WASM para visualização do calorímetro do detector ATLAS (CERN)
//
// VISÃO GERAL DO FLUXO DE DADOS:
//   1. JavaScript chama `process_xml_data(bytes)` enviando um arquivo XML bruto
//   2. O WASM (este código Rust compilado) analisa o XML e extrai energia por célula
//   3. Para cada célula com energia > 0, calcula a posição 3D física no detector
//   4. Gera matrizes 4×4 de transformação para o Three.js (InstancedMesh)
//   5. Retorna para o JavaScript um objeto com arrays Float32 prontos para a GPU
//   6. O Three.js usa esses dados para renderizar milhares de células 3D na tela
// =============================================================================

// Importa a ponte entre Rust e JavaScript via wasm-bindgen
use wasm_bindgen::prelude::*;

// Importa tipos JavaScript que serão usados para retornar dados:
//   - Float32Array → array numérico de 32 bits, diretamente legível pela GPU
//   - Object       → objeto JS genérico (equivalente a `{}`)
//   - Reflect      → API de reflexão para setar propriedades em objetos JS dinamicamente
use js_sys::{Float32Array, Object, Reflect};

// Parser de XML de alta performance para Rust (suporte a streaming)
use quick_xml::Reader;
use quick_xml::events::Event;

// Mapa chave→valor da biblioteca padrão, usado para acumular energias por célula
use std::collections::HashMap;

// =============================================================================
// CONSTANTES FÍSICAS DO CALORÍMETRO — Portadas de CaloGeoConst.h
// Todos os valores estão em milímetros (mm)
// =============================================================================

// Constante Pi com precisão de 64 bits, usada em cálculos de ângulo phi (φ)
const PI: f64 = std::f64::consts::PI;

// --- Calorímetro TILE (hadrônico de telhas de cintilação) -------------------

// TILE_Z[linha][idx_eta]: posição central em Z de cada célula Tile, em mm
// Dimensão [15 linhas de camadas][10 índices de eta]
// O valor 0.0 indica que a célula não existe para aquele eta naquela camada
static TILE_Z: [[f64; 10]; 15] = [
    // Linha 0: camada A do barril central
    [123.240, 369.720, 620.760, 876.365, 1141.10, 1419.53, 1707.10, 2012.91, 2341.54, 2656.48],
    // Linha 1: camada BC do barril central
    [141.495, 424.490, 707.485, 999.605, 1300.86, 1615.80, 1949.00, 2300.46, 2642.79, 0.0],
    // Linha 2: camada D do barril central
    [159.755, 483.830, 812.465, 1150.23, 1497.13, 1857.71, 2241.12, 2619.97, 0.0, 0.0],
    // Linha 3: camada E (plug/crack)
    [0.0, 734.870, 1497.13, 2346.10, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    // Linhas 4-6: extensão do barril (ITC)
    [3646.64, 3956.95, 4440.67, 4970.03, 5681.91, 0.0, 0.0, 0.0, 0.0, 0.0],
    [3710.53, 4102.98, 4623.21, 5189.07, 5800.57, 0.0, 0.0, 0.0, 0.0, 0.0],
    [4167.74, 5445.49, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    // Linhas 7-14: células da região de transição (crack/gap cells)
    [3405.00, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [3511.85, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [3551.50, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [3551.50, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [3536.00, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [3536.00, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [3566.00, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [3566.00, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
];

// TILE_DZ[linha][idx_eta]: largura em Z (espessura) de cada célula Tile, em mm
// Equivalente ao "dz" — metade disso é usada como semi-extensão da caixa 3D
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

// --- Calorímetro HEC (Hadronic End-Cap — argônio líquido nas tampas) ---------

// HEC_R[linha_camada][idx_eta]: raio transversal central da célula HEC, em mm
// O HEC fica nas tampas do detector, então usa coordenada radial (R) em vez de Z
static HEC_R: [[f64; 14]; 7] = [
    // Camada HEC 0, parte 1 (14 células em eta)
    [1953.63,1777.76,1597.56,1437.47,1294.76,1167.21,1052.94,950.382,858.205,775.278,668.405,545.996,446.465,386.875],
    // Camada HEC 0, parte 2
    [2008.09,1881.11,1690.42,1521.01,1370.00,1235.03,1114.11,1005.59,908.060,820.287,707.225,577.746,502.371,0.0],
    // Camada HEC 1, partes 1 e 2
    [1951.08,1774.10,1596.30,1437.80,1296.15,1169.26,1060.37,958.008,860.888,742.229,606.344,515.234,0.0,0.0],
    [2008.26,1882.60,1693.79,1525.52,1375.14,1240.45,1119.58,1010.96,913.220,787.548,643.565,531.973,0.0,0.0],
    // Camada HEC 2, partes 1 e 2
    [1947.43,1768.06,1592.41,1435.44,1294.84,1168.68,1055.29,953.266,822.083,671.786,549.312,0.0,0.0,0.0],
    [1986.52,1842.34,1659.31,1495.74,1349.24,1217.77,1099.62,993.312,856.619,700.007,572.389,500.028,0.0,0.0],
    // Camada HEC 3
    [1916.61,1726.20,1556.04,1403.63,1266.87,1143.96,1033.36,891.153,728.228,595.465,510.411,0.0,0.0,0.0],
];

// HEC_DR[linha_camada][idx_eta]: largura radial (espessura em R) da célula HEC, em mm
static HEC_DR: [[f64; 14]; 7] = [
    [160.737,191.003,169.396,150.788,134.625,120.488,108.053,97.0569,87.2970,78.5560,135.189,109.630,89.431,29.75],
    [51.825,202.126,179.258,159.561,142.456,127.495,114.335,102.699,92.371,83.174,142.951,116.007,34.742,0.0],
    [165.839,188.131,167.459,149.535,133.779,119.994,97.783,106.943,87.297,150.022,121.749,60.469,0.0,0.0],
    [51.487,199.818,177.818,158.723,142.030,127.352,114.378,102.866,92.616,158.728,129.238,93.946,0.0,0.0],
    [173.132,185.615,165.683,148.259,132.936,119.394,107.377,96.676,165.689,134.906,110.042,0.0,0.0,0.0],
    [94.958,193.413,172.644,154.486,138.521,124.410,111.887,100.738,172.649,140.573,114.665,30.056,0.0,0.0],
    [201.210,179.604,160.715,144.105,129.425,116.399,104.799,179.610,146.239,119.288,50.821,0.0,0.0,0.0],
];

// Número real de células em eta válidas por linha do HEC
// (evita acessar posições com valor 0.0 nas tabelas acima)
static HEC_SIZE: [usize; 7] = [14, 13, 12, 12, 11, 12, 11];

// =============================================================================
// CONSTANTES FÍSICAS DO ATLAS — Região de crack (transição barril↔tampa)
// =============================================================================

// O barril LAr termina fisicamente em |η| ≈ 1.475
// Células além desse valor no barril são suprimidas (região de crack)
const BARREL_ETA_MAX: f64 = 1.475;

// A tampa LAr começa fisicamente em |η| ≈ 1.5
// Células abaixo desse valor na tampa são suprimidas (região de crack)
const ENDCAP_ETA_MIN: f64 = 1.5;

// =============================================================================
// ENUMERAÇÃO DOS SUBDETECTORES
// Define qual subdetector físico uma camada pertence
// =============================================================================
#[derive(Clone, Copy)]
enum SubDet {
    Tile,       // Calorímetro hadrônico de telhas (barril, |η| < 1.7)
    Hec,        // Calorímetro hadrônico de tampas em argônio líquido (1.5 < |η| < 3.2)
    LarBarrel,  // Calorímetro eletromagnético de barril em argônio líquido (|η| < 1.475)
    LarEndCap,  // Calorímetro eletromagnético de tampas em argônio líquido (1.375 < |η| < 3.2)
}

// =============================================================================
// ESTRUTURA DE CONFIGURAÇÃO DE CAMADA
// Cada uma das 26 camadas lógicas do XML mapeia para um conjunto de parâmetros
// =============================================================================
#[derive(Clone)]
struct LayerCfg {
    subdet:    SubDet,  // Qual subdetector físico esta camada pertence
    h1:        f64,     // Início do intervalo radial ou z (em mm), depende do subdetector
    h2:        f64,     // Fim do intervalo radial ou z (em mm)
    phi_seg:   usize,   // Número de segmentos em phi (azimute): 8, 64 ou 256
    tile_row:  usize,   // Índice da linha primária nas tabelas TILE_Z/TILE_DZ
    tile_row2: usize,   // Índice da linha secundária (para camadas mergeadas do Tile)
    hec_row1:  usize,   // Primeira linha da tabela HEC_R/HEC_DR para esta camada
    hec_row2:  usize,   // Segunda linha (o HEC às vezes usa dois subgrupos por camada)
    lar_layer: usize,   // Índice de camada dentro do LAr (0–3 para barril e tampa)
}

impl LayerCfg {
    // Cria configuração para uma camada Tile simples (uma única linha de tabela)
    // h1/h2: raio interno/externo do Tile em mm
    // phi_seg: granularidade em azimute (normalmente 64)
    // row: índice na tabela TILE_Z/TILE_DZ
    fn tile(h1: f64, h2: f64, phi_seg: usize, row: usize) -> Self {
        LayerCfg {
            subdet: SubDet::Tile, h1, h2, phi_seg,
            tile_row: row, tile_row2: row, // row2 = row quando não há merge
            hec_row1: 0, hec_row2: 0, lar_layer: 0,
        }
    }

    // Cria configuração para camada Tile que combina (faz merge de) duas linhas da tabela
    // Usado na camada l=1 que funde as linhas BC (1 e 2) do barril central
    // phi_seg sempre 64 para camadas mergeadas
    fn tile_merge(h1: f64, h2: f64, row1: usize, row2: usize) -> Self {
        LayerCfg {
            subdet: SubDet::Tile, h1, h2, phi_seg: 64,
            tile_row: row1, tile_row2: row2, // dz final é média dos dois dz
            hec_row1: 0, hec_row2: 0, lar_layer: 0,
        }
    }

    // Cria configuração para uma camada do HEC
    // h1/h2: posição z inicial e final da camada (em mm), sendo que HEC fica nas tampas
    // row1/row2: as linhas de HEC_R/HEC_DR a consultar (podem ser iguais ou diferentes)
    fn hec(h1: f64, h2: f64, row1: usize, row2: usize) -> Self {
        LayerCfg {
            subdet: SubDet::Hec, h1, h2, phi_seg: 64,
            tile_row: 0, tile_row2: 0, hec_row1: row1, hec_row2: row2, lar_layer: 0,
        }
    }

    // Cria configuração para camada do LAr Barril eletromagnético
    // h1/h2: raio interno/externo em mm (o barril é cilíndrico)
    // phi_seg: 64 (camadas 0/1) ou 256 (camadas 2/3, granularidade fina)
    // lyr: índice 0–3 da camada dentro do LAr
    fn lar_b(h1: f64, h2: f64, phi_seg: usize, lyr: usize) -> Self {
        LayerCfg {
            subdet: SubDet::LarBarrel, h1, h2, phi_seg,
            tile_row: 0, tile_row2: 0, hec_row1: 0, hec_row2: 0, lar_layer: lyr,
        }
    }

    // Cria configuração para camada do LAr Tampa eletromagnética
    // h1/h2 não são usados aqui (a geometria da tampa usa laeb_h1/h2 dinamicamente)
    // phi_seg: 64 ou 256 conforme a camada
    fn lar_e(phi_seg: usize, lyr: usize) -> Self {
        LayerCfg {
            subdet: SubDet::LarEndCap, h1: 0.0, h2: 0.0, phi_seg,
            tile_row: 0, tile_row2: 0, hec_row1: 0, hec_row2: 0, lar_layer: lyr,
        }
    }
}

// =============================================================================
// TABELA DE CAMADAS: mapeia os 26 índices de camada do XML para configurações físicas
//
// O XML identifica células com atributo l=0..25
// Esta função retorna o vetor com a configuração de cada uma dessas 26 camadas
// =============================================================================
fn build_layer_table() -> Vec<LayerCfg> {
    vec![
        /* l= 0 */ LayerCfg::tile(2300.0, 2600.0, 64, 0),   // Tile barril, camada A (R 2300-2600mm)
        /* l= 1 */ LayerCfg::tile_merge(2600.0, 3440.0, 1, 2), // Tile barril, camadas BC mergeadas
        /* l= 2 */ LayerCfg::tile(3440.0, 3820.0, 64, 3),   // Tile barril, camada D
        /* l= 3 */ LayerCfg::tile(2300.0, 2600.0, 64, 4),   // Tile ext. barril, camada A
        /* l= 4 */ LayerCfg::tile(2600.0, 3140.0, 64, 5),   // Tile ext. barril, camada B
        /* l= 5 */ LayerCfg::tile(3140.0, 3820.0, 64, 6),   // Tile ext. barril, camada C/D
        /* l= 6 */ LayerCfg::tile(3440.0, 3820.0, 64, 7),   // Tile crack, camada D
        /* l= 7 */ LayerCfg::tile(2990.0, 3440.0, 64, 8),   // Tile crack, camada C
        /* l= 8 */ LayerCfg::tile(2632.0, 2959.0, 64, 9),   // Tile crack, camada B
        /* l= 9 */ LayerCfg::tile(2305.0, 2632.0, 64, 10),  // Tile crack, camada A
        /* l=10 */ LayerCfg::tile(1885.0, 2305.0, 64, 11),  // Células de gap do Tile
        /* l=11 */ LayerCfg::tile(1465.0, 1885.0, 64, 12),  // Células de crack do Tile
        /* l=12 */ LayerCfg::tile(426.0,  876.0,   8, 13),  // Cintiladores especiais E (8 em phi)
        /* l=13 */ LayerCfg::tile(153.0,  426.0,   8, 14),  // Cintiladores de mínimo ionizante (MBI)
        /* l=14 */ LayerCfg::hec(4350.0, 4630.0, 0, 0),     // HEC camada 0 (z 4350-4630mm)
        /* l=15 */ LayerCfg::hec(4630.0, 5100.0, 1, 2),     // HEC camada 1 (z 4630-5100mm)
        /* l=16 */ LayerCfg::hec(5130.0, 5590.0, 3, 4),     // HEC camada 2 (z 5130-5590mm)
        /* l=17 */ LayerCfg::hec(5590.0, 6050.0, 5, 6),     // HEC camada 3 (z 5590-6050mm)
        /* l=18 */ LayerCfg::lar_b(1421.73, 1438.58,  64, 0), // LAr barril camada 0 (pré-amostragem)
        /* l=19 */ LayerCfg::lar_b(1481.75, 1579.00,  64, 1), // LAr barril camada 1 (tiras finas)
        /* l=20 */ LayerCfg::lar_b(1581.00, 1840.00, 256, 2), // LAr barril camada 2 (células quadradas)
        /* l=21 */ LayerCfg::lar_b(1840.00, 1984.70, 256, 3), // LAr barril camada 3 (traseira)
        /* l=22 */ LayerCfg::lar_e( 64, 0),                   // LAr tampa camada 0 (pré-amostragem)
        /* l=23 */ LayerCfg::lar_e( 64, 1),                   // LAr tampa camada 1 (tiras)
        /* l=24 */ LayerCfg::lar_e(256, 2),                   // LAr tampa camada 2 (meio)
        /* l=25 */ LayerCfg::lar_e(256, 3),                   // LAr tampa camada 3 (traseira)
    ]
}

// =============================================================================
// FÍSICA: conversão de pseudorapidez η para coordenada Z
//
// No detector ATLAS, a pseudorapidez η é definida como:
//   η = -ln[ tan(θ/2) ]
// onde θ é o ângulo polar em relação ao feixe.
//
// A relação exata entre z, raio transversal R e η é:
//   z = R · sinh(η)
//
// Esta fórmula é usada em vez de aproximações lineares para garantir
// precisão física em todas as regiões do detector.
// =============================================================================
#[inline]
fn eta_to_z(eta: f64, r_transverse: f64) -> f64 {
    // Multiplica o raio transversal pelo seno hiperbólico de eta
    // Resultado: posição Z física da célula em mm
    r_transverse * eta.sinh()
}

// Converte eta para o ângulo polar theta (elevação acima do plano do feixe)
// Fórmula: θ = 2 · arctan( exp(-η) )
// Útil para diagnósticos e verificações de consistência geométrica
#[inline]
fn eta_to_theta(eta: f64) -> f64 {
    // 2 * arctan(e^{-η})
    2.0 * (-eta).exp().atan()
}

// =============================================================================
// TABELAS DE ETA DO LAr BARRIL — Posição central de cada célula
//
// O LAr barril tem 4 camadas (0–3) com granularidades diferentes em eta:
//   Camada 0 (pré-amostragem): Δη = 0.025
//   Camada 1 (tiras):          Δη = 0.003125 (altíssima granularidade)
//   Camada 2 (meio):           Δη = 0.025 (até η=1.1), depois 0.1
//   Camada 3 (traseira):       Δη = 0.05
// =============================================================================

// Retorna o valor central de eta para a célula `idx` na camada `layer` do LAr barril
fn laba_eta(layer: usize, idx: usize) -> f64 {
    match layer {
        // Camada 0: 61 células, eta começa em 0.0125, passo 0.025
        0 => 0.0125 + 0.025 * idx as f64,
        // Camada 1: 451 células, granularidade muito fina, passo 0.003125
        1 => 0.0015625 + 0.003125 * idx as f64,
        // Camada 2: granularidade variável — fina até idx=43, grossa depois
        2 => {
            if idx < 44 { 0.025 + 0.025 * idx as f64 }   // Região central: Δη=0.025
            else { 1.125 + 0.1 * (idx - 44) as f64 }      // Região alta: Δη=0.1
        }
        // Camada 3: 27 células, passo 0.05
        3 => 0.025 + 0.05 * idx as f64,
        _ => 0.0,
    }
}

// Retorna o tamanho em eta (Δη) da célula `idx` na camada `layer` do LAr barril
// Esse valor é usado para calcular a extensão física em Z: dz = R·cosh(η)·dη
fn laba_deta(layer: usize, idx: usize) -> f64 {
    match layer {
        0 => 0.025,    // Todas as células da camada 0 têm Δη = 0.025
        1 => 0.003125, // Todas as células da camada 1 têm Δη = 0.003125
        2 => { if idx < 44 { 0.025 } else { 0.1 } } // Varia com a região
        3 => 0.05,     // Todas as células da camada 3 têm Δη = 0.05
        _ => 0.05,
    }
}

// Retorna o número total de células em eta para cada camada do LAr barril
// Usado como limite de índice para evitar acesso fora do array
fn laba_ncells(layer: usize) -> usize {
    [61, 451, 57, 27][layer]  // camadas 0, 1, 2, 3
}

// =============================================================================
// TABELAS DE ETA DO LAr TAMPA (EndCap) — Geometria mais complexa
//
// A tampa LAr cobre 1.375 < |η| < 3.2 com granularidade variável:
//   - Região de transição (overlap com barril): células mais grossas
//   - Interior: granularidade fina
//   - Alta eta (> ~2.5): células mais grossas novamente
// =============================================================================

// Retorna o valor central de eta para a célula `idx` na camada `layer` da tampa LAr
fn laeb_eta(layer: usize, idx: usize) -> f64 {
    match layer {
        // Camada 0 (pré-amostragem da tampa): simples, começa em η=1.52078
        0 => 1.52078 + 0.025 * idx as f64,

        // Camada 1 (tiras da tampa): estrutura complexa com 5 sub-regiões:
        //   - 4 células grossas na transição barril-tampa
        //   - 96 células finas (Δη=0.003125)
        //   - 48 células médias (Δη=0.004167)
        //   - 60 células médias (Δη=0.00625)
        //   - células grossas no final (Δη=0.025)
        1 => {
            let coarse: [f64; 4] = [1.40828, 1.44578, 1.47078, 1.49578];
            if idx < 4 { coarse[idx] }                                              // 4 células grossas
            else if idx < 4+96 { 1.50984 + 0.003125 * (idx-4) as f64 }            // finas
            else if idx < 4+96+48 { 1.81036 + 0.00416667 * (idx-4-96) as f64 }   // médias
            else if idx < 4+96+48+60 { 2.01141 + 0.00625 * (idx-4-96-48) as f64 } // médias-grossas
            else { 2.42078 + 0.025 * (idx-4-96-48-60) as f64 }                    // grossas
        }

        // Camada 2 (meio da tampa): células grossas na transição, finas no meio, grossas no final
        2 => {
            let coarse: [f64; 4] = [1.40828, 1.44578, 1.47078, 1.49578];
            if idx < 4 { coarse[idx] }
            else if idx < 4+40 { 1.52078 + 0.025*(idx-4) as f64 }   // região intermediária
            else if idx < 4+40+7 { 2.55828 + 0.1*(idx-44) as f64 }  // alta eta, Δη=0.1
            else { 0.0 } // célula inválida
        }

        // Camada 3 (traseira da tampa): 3 sub-regiões
        3 => {
            if idx < 12 { 1.47078 + 0.025*idx as f64 }        // baixo eta, Δη=0.025
            else if idx < 12+15 { 1.78328 + 0.05*(idx-12) as f64 } // médio eta, Δη=0.05
            else if idx < 12+15+7 { 2.55828 + 0.1*(idx-27) as f64 } // alto eta, Δη=0.1
            else { 0.0 } // inválido
        }
        _ => 0.0,
    }
}

// Retorna o tamanho em eta (Δη) da célula da tampa LAr
// Necessário para calcular a extensão física da caixa da célula
fn laeb_deta(layer: usize, idx: usize) -> f64 {
    match layer {
        0 => 0.025, // Tampa camada 0: granularidade uniforme
        1 => {      // Tampa camada 1: granularidade variável por sub-região
            if idx < 1 { 0.05 }
            else if idx < 4 { 0.025 }
            else if idx < 4+96 { 0.003125 }
            else if idx < 4+96+48 { 0.00416667 }
            else if idx < 4+96+48+60 { 0.00625 }
            else { 0.025 }
        }
        2 => {      // Tampa camada 2
            if idx < 1 { 0.05 }
            else if idx < 44 { 0.025 }
            else { 0.1 }
        }
        3 => {      // Tampa camada 3
            if idx < 12 { 0.025 }
            else if idx < 27 { 0.05 }
            else { 0.1 }
        }
        _ => 0.05,
    }
}

// Número total de células em eta por camada da tampa LAr
fn laeb_ncells(layer: usize) -> usize {
    [12, 216, 51, 34][layer]  // camadas 0, 1, 2, 3
}

// Retorna a posição z inicial (face mais próxima do IP) da camada `layer` da tampa LAr
// Para camadas 2 e 3, a posição varia conforme o índice eta (geometria em escada)
fn laeb_h1(layer: usize, idx: usize) -> f64 {
    match layer {
        2 => { if idx < 44 { 3800.73 } else { 3754.24 } } // Camada 2: duas regiões
        3 => { if idx < 27 { 4156.24 } else { 4201.25 } } // Camada 3: duas regiões
        _ => [3680.75, 3754.24, 3800.73, 4156.24][layer], // Camadas 0 e 1: valor fixo por camada
    }
}

// Retorna a posição z final (face mais afastada do IP) da camada da tampa LAr
// Para todas as camadas, o h2 é fixo e não depende do índice eta
fn laeb_h2(layer: usize, _idx: usize) -> f64 {
    [3714.25, 3800.73, 4156.24, 4243.26][layer]  // z final em mm para camadas 0–3
}

// =============================================================================
// CÁLCULO DO ÂNGULO PHI CENTRAL
//
// O calorímetro é dividido em `phi_seg` fatias no azimute (0 a 2π).
// Esta função retorna o ângulo φ do centro da fatia `j`.
//
// Nota: o offset de π/2 é porque Three.js usa um sistema de coordenadas
// onde x aponta para a frente; aqui rotacionamos para que φ=0 fique em y+.
// =============================================================================
#[inline]
fn phi_center(j: usize, phi_seg: usize) -> f64 {
    let dphi = 2.0 * PI / phi_seg as f64; // Tamanho angular de cada fatia em radianos
    dphi / 2.0 + PI / 2.0 + j as f64 * dphi // Centro da j-ésima fatia, com offset de 90°
}

// =============================================================================
// GUARDA DE CRACK (região de transição barril↔tampa)
//
// O detector ATLAS tem uma região morta entre barril e tampa chamada "crack"
// (aproximadamente 1.4 < |η| < 1.6). Células nessa região devem ser suprimidas
// para evitar visualização de dados fisicamente impossíveis.
//
// Retorna `true` se a célula deve ser SUPRIMIDA (está na região de crack).
// =============================================================================
#[inline]
fn in_barrel_crack(eta_abs: f64, is_barrel: bool) -> bool {
    if is_barrel {
        // Para células do barril: suprimir se eta ultrapassar o limite do barril
        eta_abs > BARREL_ETA_MAX
    } else {
        // Para células da tampa: suprimir se eta estiver abaixo do limite da tampa
        eta_abs < ENDCAP_ETA_MIN
    }
}

// =============================================================================
// CÁLCULO DA POSIÇÃO 3D DA CÉLULA
//
// Esta é a função central de geometria: dada a configuração de uma camada
// e os índices (eta, phi), retorna as 6 coordenadas que definem a célula:
//   (cx, cy, cz) — centro da célula em mm no espaço 3D cartesiano
//   (sx, sy, sz) — semi-extensões (metade do tamanho) em cada eixo, em mm
//
// Cada subdetector tem sua própria lógica de cálculo:
//   - TILE:       usa tabelas TILE_Z/TILE_DZ, coordenada radial fixa
//   - HEC:        usa tabelas HEC_R/HEC_DR, coordenada z fixa por camada
//   - LAr Barril: usa fórmula z = R·sinh(η), raio fixo por camada
//   - LAr Tampa:  usa z/sinh(η) para calcular raio transversal, z fixo por camada
//
// Retorna None se a célula é inválida (índice fora do range, valor zero, ou crack)
// =============================================================================
fn compute_cell(cfg: &LayerCfg, eta_idx: i32, phi_idx: usize)
    -> Option<(f64, f64, f64, f64, f64, f64)>
{
    // Converte o índice de eta assinado para valor absoluto (para indexar tabelas)
    let eta_abs  = eta_idx.unsigned_abs() as usize;
    // Determina o sinal de Z: eta positivo → z positivo (tampa A), negativo → tampa C
    let z_sign   = if eta_idx >= 0 { 1.0_f64 } else { -1.0_f64 };
    // Ângulo φ central desta fatia de phi em radianos
    let phi      = phi_center(phi_idx, cfg.phi_seg);
    // Tamanho angular da fatia em phi (usado para calcular extensão transversal)
    let dphi     = 2.0 * PI / cfg.phi_seg as f64;
    // Pré-calcula seno e cosseno de phi para converter de polar para cartesiano
    let sin_phi  = phi.sin();
    let cos_phi  = phi.cos();

    match cfg.subdet {
        // -----------------------------------------------------------------
        // TILE: calorímetro de telhas hadrônicas
        // Geometria: barras cilíndricas com raio fixo, posição Z da tabela
        // -----------------------------------------------------------------
        SubDet::Tile => {
            let row = cfg.tile_row;
            // O Tile tem no máximo 10 células em eta (índices 0–9)
            if eta_abs >= 10 { return None; }
            // Lê a posição z central da tabela estática
            let z_val = TILE_Z[row][eta_abs];
            // Lê a largura em z da tabela estática
            let dz    = TILE_DZ[row][eta_abs];
            // Valor 0.0 indica célula inexistente nesta posição
            if z_val == 0.0 || dz == 0.0 { return None; }

            // Raio médio da camada (média do raio interno e externo)
            let r_mid = (cfg.h1 + cfg.h2) / 2.0;
            // Espessura radial total da camada
            let dr    = cfg.h2 - cfg.h1;

            // Para camadas mergeadas (tile_row2 ≠ tile_row), faz média das larguras em z
            // para suavizar a transição visual entre as duas sub-linhas
            let dz_final = if cfg.tile_row2 != row && TILE_DZ[cfg.tile_row2][eta_abs] > 0.0 {
                (dz + TILE_DZ[cfg.tile_row2][eta_abs]) / 2.0
            } else {
                dz
            };

            // Converte de coordenadas polares (r,φ) para cartesianas (x,y):
            // cx = -r · sin(φ)  (negativo por convenção do ATLAS: x aponta para o IP)
            // cy =  r · cos(φ)
            // cz = ±z_val      (sinal depende do lado A ou C)
            let cx = -r_mid * sin_phi;
            let cy =  r_mid * cos_phi;
            let cz =  z_sign * z_val;

            // Retorna (centro, semi-extensões):
            //   semi-radial = dr/2, semi-phi = r·Δφ/2, semi-z = dz/2
            Some((cx, cy, cz, dr / 2.0, r_mid * dphi / 2.0, dz_final / 2.0))
        }

        // -----------------------------------------------------------------
        // HEC: calorímetro hadrônico de tampas
        // Geometria: anéis no plano z=cte, com raio lido da tabela HEC_R
        // -----------------------------------------------------------------
        SubDet::Hec => {
            // O HEC às vezes usa duas linhas de tabela por camada XML
            // (quando hec_row1 == hec_row2, usa só uma linha diretamente)
            let (r_val, dr_val) = if cfg.hec_row1 == cfg.hec_row2 {
                // Caso simples: uma única linha de tabela
                if eta_abs >= HEC_SIZE[cfg.hec_row1] { return None; }
                (HEC_R[cfg.hec_row1][eta_abs], HEC_DR[cfg.hec_row1][eta_abs])
            } else {
                // Caso de merge: eta=0 usa linha 1, eta≥1 usa linha 2 com offset
                if eta_abs == 0 {
                    (HEC_R[cfg.hec_row1][0], HEC_DR[cfg.hec_row1][0])
                } else {
                    let i2 = eta_abs - 1; // Ajusta índice para a segunda linha
                    if i2 >= HEC_SIZE[cfg.hec_row2] { return None; }
                    (HEC_R[cfg.hec_row2][i2], HEC_DR[cfg.hec_row2][i2])
                }
            };
            // r=0 indica posição inválida
            if r_val == 0.0 { return None; }

            // Posição z central e espessura z da camada HEC (fixas por camada)
            let z_mid = (cfg.h1 + cfg.h2) / 2.0;
            let dz    = cfg.h2 - cfg.h1;

            // Converte raio+phi para coordenadas cartesianas
            let cx = -r_val * sin_phi;
            let cy =  r_val * cos_phi;
            let cz =  z_sign * z_mid;

            // semi-r = dr/2, semi-phi = r·Δφ/2, semi-z = dz/2
            Some((cx, cy, cz, dr_val / 2.0, r_val * dphi / 2.0, dz / 2.0))
        }

        // -----------------------------------------------------------------
        // LAr BARRIL: calorímetro eletromagnético de barril
        // Geometria: cilindros concêntricos, z calculado por z = R·sinh(η)
        // -----------------------------------------------------------------
        SubDet::LarBarrel => {
            let lar = cfg.lar_layer;
            // Verifica se o índice de eta é válido para esta camada
            if eta_abs >= laba_ncells(lar) { return None; }

            // Obtém o valor de eta do centro desta célula
            let eta_c = laba_eta(lar, eta_abs);
            let eta_c_abs = eta_c.abs();

            // GUARDA DE CRACK: suprime células do barril além de |η|=1.475
            if in_barrel_crack(eta_c_abs, true) { return None; }

            // Raio médio e espessura radial da camada
            let r_mid = (cfg.h1 + cfg.h2) / 2.0;
            let dr    = cfg.h2 - cfg.h1;

            // FÍSICA: z = R · sinh(η) — mapeamento exato barril (não linear!)
            // A posição z depende do eta através do seno hiperbólico
            let cz = z_sign * eta_to_z(eta_c_abs, r_mid);

            // Posição (x,y) no plano transversal ao feixe
            let cx = -r_mid * sin_phi;
            let cy =  r_mid * cos_phi;

            // Extensão em z calculada por regra da cadeia:
            //   dz = R · cosh(η) · dη
            // Limitada a 800mm para evitar artefatos visuais em células muito grandes
            let deta = laba_deta(lar, eta_abs);
            let sz = (r_mid * eta_c_abs.cosh() * deta / 2.0).min(800.0);

            // sz mínimo de 1mm para células visíveis
            Some((cx, cy, cz, dr / 2.0, r_mid * dphi / 2.0, sz.max(1.0)))
        }

        // -----------------------------------------------------------------
        // LAr TAMPA: calorímetro eletromagnético de tampa
        // Geometria: discos no plano z=cte, raio transversal calculado por r = z/sinh(η)
        // -----------------------------------------------------------------
        SubDet::LarEndCap => {
            let lar = cfg.lar_layer;
            // Verifica se o índice de eta é válido para esta camada da tampa
            if eta_abs >= laeb_ncells(lar) { return None; }

            // Valor de eta do centro da célula (depende do índice e da camada)
            let eta_c = laeb_eta(lar, eta_abs);
            if eta_c == 0.0 { return None; } // eta=0 indica célula inválida
            let eta_c_abs = eta_c.abs();

            // GUARDA DE CRACK: suprime células da tampa abaixo de |η|=1.5
            if in_barrel_crack(eta_c_abs, false) { return None; }

            // Posições z da face inicial e final da camada (variam conforme eta para tampa)
            let h1 = laeb_h1(lar, eta_abs);
            let h2 = laeb_h2(lar, eta_abs);
            // Posição z central e espessura z
            let z_mid = (h1 + h2) / 2.0;
            let dz    = h2 - h1;

            // FÍSICA INVERSA: dado z e η, calcular o raio transversal r
            // Da definição: z = r · sinh(η)  →  r = z / sinh(η)
            // .max(0.001) evita divisão por zero em η ≈ 0
            let sinh_eta = eta_c_abs.sinh().max(0.001);
            let r_perp = z_mid / sinh_eta; // Raio transversal médio da célula

            // Converte para coordenadas cartesianas
            let cx = -r_perp * sin_phi;
            let cy =  r_perp * cos_phi;
            let cz =  z_sign * z_mid;

            // Extensão radial aproximada calculada por:
            //   dr ≈ dz · dη · cosh(η) / sinh²(η)
            // Limitada a 500mm para evitar células gigantes
            let deta = laeb_deta(lar, eta_abs);
            let dr_approx = (z_mid * deta / (sinh_eta * sinh_eta) * eta_c_abs.cosh()).abs().min(500.0);

            // dr mínimo de 5mm e sz = dz/2
            Some((cx, cy, cz, dr_approx.max(5.0), r_perp * dphi / 2.0, dz / 2.0))
        }
    }
}

// =============================================================================
// CONSTRUÇÃO DA MATRIZ DE TRANSFORMAÇÃO 4×4 (column-major para Three.js)
//
// O Three.js InstancedMesh usa matrizes de transformação 4×4 em ordem
// column-major (colunas primeiro, ao contrário do OpenGL row-major).
//
// Esta função gera a matriz que combina:
//   - Escala não-uniforme: (sx, sy, sz) — tamanho da caixa em cada eixo
//   - Rotação em phi: gira a célula para sua posição azimutal correta
//   - Translação: move a célula para (cx, cy, cz) no espaço 3D
//
// A matriz resultante é passada diretamente para a GPU via Float32Array.
// =============================================================================
fn build_matrix(cx: f64, cy: f64, cz: f64, sx: f64, sy: f64, sz: f64, phi: f64) -> [f32; 16] {
    let (s, c) = (phi.sin(), phi.cos()); // Seno e cosseno do ângulo azimutal
    let s32 = |v: f64| v as f32;        // Closure para converter f64 → f32

    // Matriz 4×4 column-major:
    // Coluna 0: eixo X local da célula (perpendicular ao raio, na direção phi)
    // Coluna 1: eixo Y local da célula (na direção radial, apontando para o centro)
    // Coluna 2: eixo Z local da célula (ao longo do feixe)
    // Coluna 3: posição de translação (cx, cy, cz, 1.0)
    [
        s32(-s*sx),  s32(c*sx),   0.0,     0.0,  // Coluna 0: vetor X escalado por sx
        s32(-c*sy),  s32(-s*sy),  0.0,     0.0,  // Coluna 1: vetor Y escalado por sy
        0.0,         0.0,         s32(sz), 0.0,  // Coluna 2: vetor Z escalado por sz
        s32(cx),     s32(cy),     s32(cz), 1.0,  // Coluna 3: posição no espaço
    ]
}

// =============================================================================
// MAPEAMENTO DE ENERGIA PARA COR (escala arco-íris normalizada)
//
// Converte um valor normalizado t ∈ [0,1] para uma cor RGB.
// A escala vai de azul (baixa energia) passando por verde e amarelo até vermelho (alta).
//
// Esta é a mesma escala "jet" usada em física de partículas:
//   t ∈ [0.00, 0.25]: azul → ciano    (r=0, g=crescente, b=1)
//   t ∈ [0.25, 0.50]: ciano → verde   (r=0, g=1, b=decrescente)
//   t ∈ [0.50, 0.75]: verde → amarelo (r=crescente, g=1, b=0)
//   t ∈ [0.75, 1.00]: amarelo → vermelho (r=1, g=decrescente, b=0)
// =============================================================================
fn energy_color(t: f32) -> (f32, f32, f32) {
    // Garante que t está entre 0 e 1 (clamping)
    let t = t.clamp(0.0, 1.0);

    if t < 0.25 {
        // Faixa 1: azul → ciano (verde cresce de 0 a 1, azul fixo em 1)
        let u = t / 0.25;        // u: progresso local dentro desta faixa [0,1]
        (0.0, u, 1.0)
    } else if t < 0.5 {
        // Faixa 2: ciano → verde (azul cai de 1 a 0, verde fixo em 1)
        let u = (t - 0.25) / 0.25;
        (0.0, 1.0, 1.0 - u)
    } else if t < 0.75 {
        // Faixa 3: verde → amarelo (vermelho cresce de 0 a 1, verde fixo em 1)
        let u = (t - 0.5) / 0.25;
        (u, 1.0, 0.0)
    } else {
        // Faixa 4: amarelo → vermelho (verde cai de 1 a 0, vermelho fixo em 1)
        let u = (t - 0.75) / 0.25;
        (1.0, 1.0 - u, 0.0)
    }
}

// =============================================================================
// PONTO DE ENTRADA PÚBLICO DO WASM
//
// Esta é a ÚNICA função exportada para JavaScript.
// Toda a visualização começa aqui.
//
// FLUXO COMPLETO:
//   Entrada:  bytes brutos do arquivo XML do evento ATLAS
//   Saída:    objeto JavaScript com arrays Float32 prontos para a GPU
//
// ETAPAS INTERNAS:
//   1. Parseia o XML e acumula energia por célula em um HashMap
//   2. Calcula min/max de energia para normalização de cor
//   3. Para cada célula com energia > 0:
//      a. Determina a configuração geométrica da camada
//      b. Calcula posição 3D via compute_cell()
//      c. Gera matriz 4×4 via build_matrix()
//      d. Calcula cor via energy_color()
//   4. Empacota tudo em Float32Arrays e retorna como objeto JS
//
// A anotação #[wasm_bindgen] faz com que o wasm-bindgen gere automaticamente
// o código JavaScript de "cola" (glue code) para chamar esta função.
// =============================================================================
#[wasm_bindgen]
pub fn process_xml_data(xml_bytes: &[u8]) -> Result<JsValue, JsValue> {
    // Instala um hook de pânico que redireciona panics Rust para console.error() do browser
    // Sem isso, pânicos aparecem como erros criptográficos no browser
    console_error_panic_hook::set_once();

    // HashMap que acumula a energia depositada em cada célula
    // Chave: (layer, eta_idx, phi_idx) — identificação única de cada célula
    // Valor: energia total em MeV depositada nessa célula
    let mut energy_map: HashMap<(i32, i32, i32), f64> = HashMap::new();

    // Cria o parser XML em modo streaming (lê byte a byte, sem carregar tudo na memória)
    let mut reader = Reader::from_reader(xml_bytes);
    // Remove espaços em branco ao redor dos textos para facilitar o parsing
    reader.config_mut().trim_text(true);

    // Buffer reutilizável para armazenar eventos XML (otimização de memória)
    let mut buf = Vec::new();

    // LOOP DE PARSING XML: lê evento por evento até o fim do arquivo
    loop {
        match reader.read_event_into(&mut buf) {
            // Trata tags self-closing (<cell ... />) e tags de abertura (<cell ...>)
            Ok(Event::Empty(e)) | Ok(Event::Start(e)) => {
                // Processa apenas tags com nome "cell" (ignora outras tags do XML)
                if e.name().as_ref() == b"cell" {
                    // Inicializa os 4 atributos que esperamos encontrar em cada <cell>
                    let mut layer = None::<i32>; // l="número da camada"
                    let mut eta   = None::<i32>; // eta="índice de pseudorapidez"
                    let mut phi   = None::<i32>; // phi="índice de azimute"
                    let mut e_val = None::<f64>; // e="energia depositada em MeV"

                    // Itera sobre todos os atributos da tag atual
                    for attr in e.attributes().flatten() {
                        match attr.key.as_ref() {
                            // Parseia cada atributo: converte bytes UTF-8 → string → número
                            b"l"   => layer = std::str::from_utf8(&attr.value).ok().and_then(|s| s.trim().parse().ok()),
                            b"eta" => eta   = std::str::from_utf8(&attr.value).ok().and_then(|s| s.trim().parse().ok()),
                            b"phi" => phi   = std::str::from_utf8(&attr.value).ok().and_then(|s| s.trim().parse().ok()),
                            b"e"   => e_val = std::str::from_utf8(&attr.value).ok().and_then(|s| s.trim().parse().ok()),
                            _ => {} // Ignora atributos desconhecidos
                        }
                    }

                    // Se todos os 4 atributos foram encontrados e parseados com sucesso:
                    if let (Some(l), Some(et), Some(ph), Some(en)) = (layer, eta, phi, e_val) {
                        // Acumula a energia (múltiplas partículas podem depositar na mesma célula)
                        // or_insert(0.0) cria a entrada com 0 se ela ainda não existe
                        *energy_map.entry((l, et, ph)).or_insert(0.0) += en;
                    }
                }
            }
            Ok(Event::Eof) => break, // Fim do arquivo XML: sai do loop
            Err(_) => break,         // Erro de parsing: aborta silenciosamente
            _ => {}                  // Outros eventos (comentários, CDATA, etc.): ignora
        }
        // IMPORTANTE: limpa o buffer após cada evento para reutilização
        // Sem isso, o buffer cresceria indefinidamente durante o parsing
        buf.clear();
    }

    // Carrega a tabela de configuração das 26 camadas do detector
    let layers = build_layer_table();
    // Fator de escala: converte mm → metros para o Three.js
    // Three.js usa metros como unidade padrão de cena
    let scale = 0.001_f64;

    // Calcula o máximo de energia entre todas as células com E > 0
    // NEG_INFINITY como valor inicial garante que qualquer E > 0 será o máximo
    // .max(1.0) evita divisão por zero quando todas as energias são zero
    let max_e = energy_map.values().copied()
        .filter(|e| *e > 0.0)
        .fold(f64::NEG_INFINITY, f64::max).max(1.0);

    // Calcula o mínimo de energia entre células com E > 0
    // INFINITY como valor inicial, .min(max_e) garante que min ≤ max sempre
    let min_e = energy_map.values().copied()
        .filter(|e| *e > 0.0)
        .fold(f64::INFINITY, f64::min).min(max_e);

    // Vetores que acumulam os dados de saída para todas as células válidas
    let mut matrices:   Vec<f32> = Vec::new(); // Matrizes 4×4 (16 floats por célula)
    let mut colors:     Vec<f32> = Vec::new(); // Cores RGB (3 floats por célula)
    let mut energies:   Vec<f32> = Vec::new(); // Energia normalizada t∈[0,1] (1 float)
    let mut layers_out: Vec<f32> = Vec::new(); // Índice de camada (para filtros no JS)
    let mut etas_out:   Vec<f32> = Vec::new(); // Índice de eta (para tooltip no JS)
    let mut phis_out:   Vec<f32> = Vec::new(); // Índice de phi (para tooltip no JS)

    // Itera sobre todas as entradas do HashMap de energia
    for (&(l, et, ph), &energy) in &energy_map {
        // Pula células com energia zero ou negativa (não depositaram energia real)
        if energy <= 0.0 { continue; }

        // Valida que o índice de camada está dentro do range (0–25)
        let l_idx = l as usize;
        if l_idx >= layers.len() { continue; }
        let cfg = &layers[l_idx];

        // Valida que o índice de phi está dentro do número de segmentos da camada
        if (ph as usize) >= cfg.phi_seg { continue; }

        // Calcula a posição e dimensões 3D da célula
        // Retorna None se a célula é inválida (crack, fora do range, etc.)
        if let Some((cx, cy, cz, sx, sy, sz)) = compute_cell(cfg, et, ph as usize) {
            // Calcula o ângulo phi central para usar na matriz de rotação
            let phi_a = phi_center(ph as usize, cfg.phi_seg);

            // Constrói a matriz 4×4 de transformação, aplicando o fator de escala mm→m
            let mat = build_matrix(
                cx * scale, cy * scale, cz * scale, // Centro em metros
                sx * scale, sy * scale, sz * scale, // Semi-extensões em metros
                phi_a                               // Ângulo de rotação em radianos
            );

            // Adiciona os 16 floats da matriz ao vetor de matrizes
            matrices.extend_from_slice(&mat);

            // Normaliza a energia para t ∈ [0,1] usando interpolação linear:
            //   t = (E - E_min) / (E_max - E_min)
            // Se todas as energias são iguais (max == min), usa t=1 (cor máxima)
            let t = if max_e > min_e {
                ((energy - min_e) / (max_e - min_e)) as f32
            } else {
                1.0_f32
            };

            // Converte o valor normalizado para cor RGB na escala arco-íris
            let (r, g, b) = energy_color(t);
            colors.push(r); // Canal vermelho
            colors.push(g); // Canal verde
            colors.push(b); // Canal azul

            // Salva metadados desta célula para uso no JavaScript (filtros, tooltips)
            energies.push(t);          // Energia normalizada
            layers_out.push(l as f32); // Índice da camada (0–25)
            etas_out.push(et as f32);  // Índice de eta
            phis_out.push(ph as f32);  // Índice de phi
        }
    }

    // Número total de células 3D geradas (cada matriz tem 16 floats)
    let count = (matrices.len() / 16) as u32;

    // ==========================================================================
    // CONVERSÃO PARA ARRAYS JAVASCRIPT
    //
    // Float32Array é o tipo nativo de array numérico de 32 bits em JavaScript.
    // É o formato que a GPU espera para InstancedMesh e BufferAttribute no Three.js.
    // A transferência é feita diretamente via memória compartilhada (zero-copy quando possível).
    // ==========================================================================

    // Cria Float32Array JS com as matrizes de transformação (count×16 valores)
    let mat_array = Float32Array::new_with_length(matrices.len() as u32);
    mat_array.copy_from(&matrices); // Copia dados do heap Rust para o heap JS

    // Float32Array com cores RGB (count×3 valores)
    let col_array = Float32Array::new_with_length(colors.len() as u32);
    col_array.copy_from(&colors);

    // Float32Array com energias normalizadas (count×1 valores)
    let eng_array = Float32Array::new_with_length(energies.len() as u32);
    eng_array.copy_from(&energies);

    // Float32Array com índices de camada (count×1 valores)
    let lay_array = Float32Array::new_with_length(layers_out.len() as u32);
    lay_array.copy_from(&layers_out);

    // Float32Array com índices de eta (count×1 valores)
    let eta_array = Float32Array::new_with_length(etas_out.len() as u32);
    eta_array.copy_from(&etas_out);

    // Float32Array com índices de phi (count×1 valores)
    let phi_array = Float32Array::new_with_length(phis_out.len() as u32);
    phi_array.copy_from(&phis_out);

    // Cria um objeto JavaScript {} para empacotar todos os arrays retornados
    let obj = Object::new();

    // Usa a API Reflect para setar propriedades dinamicamente no objeto JS
    // Equivalente a: obj.matrices = mat_array; obj.colors = col_array; etc.
    Reflect::set(&obj, &"matrices".into(),  &mat_array).unwrap(); // 16 floats por célula
    Reflect::set(&obj, &"colors".into(),    &col_array).unwrap(); // 3 floats por célula (RGB)
    Reflect::set(&obj, &"energies".into(),  &eng_array).unwrap(); // 1 float por célula [0,1]
    Reflect::set(&obj, &"layers".into(),    &lay_array).unwrap(); // 1 float por célula (índice)
    Reflect::set(&obj, &"etas".into(),      &eta_array).unwrap(); // 1 float por célula (índice)
    Reflect::set(&obj, &"phis".into(),      &phi_array).unwrap(); // 1 float por célula (índice)
    Reflect::set(&obj, &"count".into(),     &(count as f64).into()).unwrap(); // Total de células
    Reflect::set(&obj, &"maxEnergy".into(), &max_e.into()).unwrap(); // Energia máxima em MeV
    Reflect::set(&obj, &"minEnergy".into(), &min_e.into()).unwrap(); // Energia mínima em MeV

    // Retorna o objeto JS para o JavaScript que chamou esta função
    // O ? (via Ok()) propaga erros para JS como exceções
    Ok(obj.into())
}