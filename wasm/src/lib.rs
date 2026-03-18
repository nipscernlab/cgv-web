use wasm_bindgen::prelude::*;
use std::f32::consts::PI;
use std::collections::HashMap;

// ─── Célula TileCal ───────────────────────────────────────────────────────────

struct TileCell {
    sub:       u8,            // coincide com encoding do XML (partição, não amostragem)
    eta_c:     f32,           // centro η da célula (valor exato do JiveXML)
    tile_vol:  &'static str,  // ex.: "Tile1p", "Tile23n"
    eta_i:     u8,            // índice η dentro do volume
    phi_n:     u8,            // módulos em φ (normalmente 64)
    cell_name: &'static str,  // referência (A1, BC3, D2, ...)
}

// ─── Tabela estática ──────────────────────────────────────────────────────────
//
// ENCODING DO XML (sub = partição, não amostragem):
//   sub=0  EBC regular  : A12-A16 (Tile5n), B12-B15 (Tile6n), D4 (Tile8n), D5/D6 (Tile7n)
//   sub=1  EBC especial : C10 (Tile9n), B11 (Tile6n), E1-E4 (Tile10-13n)
//   sub=2  LBC          : A1-A10 (Tile1n), BC1-B9 (Tile23n), D1-D3 (Tile4n)
//   sub=3  LBA          : A1-A10 (Tile1p), BC1-B9 (Tile23p), D0-D3 (Tile4p)
//   sub=4  EBA especial : C10 (Tile9p), B11 (Tile6p), E1-E4 (Tile10-13p)
//   sub=5  EBA regular  : A12-A16 (Tile5p), B12-B15 (Tile6p), D4 (Tile8p), D5/D6 (Tile7p)
//
// Centros η extraídos de JiveXML reais (verificados em 4 arquivos).
// Barrel: A/BC compartilham η exato → desambiguação via nth counter.
// Extended/Special: cada célula tem η único → nearest-neighbour direto.

static TILE_CELLS: &[TileCell] = &[
    // ── sub=3: LBA (η > 0) ───────────────────────────────────────────────────
    // Sampling A — Tile1p  (A antes de BC para tie-break)
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
    // Sampling BC — Tile23p
    TileCell { sub:3, eta_c: 0.05, tile_vol:"Tile23p", eta_i:0, phi_n:64, cell_name:"BC1" },
    TileCell { sub:3, eta_c: 0.15, tile_vol:"Tile23p", eta_i:1, phi_n:64, cell_name:"BC2" },
    TileCell { sub:3, eta_c: 0.25, tile_vol:"Tile23p", eta_i:2, phi_n:64, cell_name:"BC3" },
    TileCell { sub:3, eta_c: 0.35, tile_vol:"Tile23p", eta_i:3, phi_n:64, cell_name:"BC4" },
    TileCell { sub:3, eta_c: 0.45, tile_vol:"Tile23p", eta_i:4, phi_n:64, cell_name:"BC5" },
    TileCell { sub:3, eta_c: 0.55, tile_vol:"Tile23p", eta_i:5, phi_n:64, cell_name:"BC6" },
    TileCell { sub:3, eta_c: 0.65, tile_vol:"Tile23p", eta_i:6, phi_n:64, cell_name:"BC7" },
    TileCell { sub:3, eta_c: 0.75, tile_vol:"Tile23p", eta_i:7, phi_n:64, cell_name:"BC8" },
    TileCell { sub:3, eta_c: 0.85, tile_vol:"Tile23p", eta_i:8, phi_n:64, cell_name:"B9"  },
    // Sampling D — Tile4p  (centros: 0.00, 0.20, 0.40, 0.60 — NÃO 0.10,0.30,0.50,0.70)
    TileCell { sub:3, eta_c: 0.00, tile_vol:"Tile4p",  eta_i:0, phi_n:64, cell_name:"D0"  },
    TileCell { sub:3, eta_c: 0.20, tile_vol:"Tile4p",  eta_i:1, phi_n:64, cell_name:"D1"  },
    TileCell { sub:3, eta_c: 0.40, tile_vol:"Tile4p",  eta_i:2, phi_n:64, cell_name:"D2"  },
    TileCell { sub:3, eta_c: 0.60, tile_vol:"Tile4p",  eta_i:3, phi_n:64, cell_name:"D3"  },

    // ── sub=2: LBC (η < 0) — sem D0 (D0 pertence a sub=3) ───────────────────
    // Sampling A — Tile1n
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
    // Sampling BC — Tile23n
    TileCell { sub:2, eta_c:-0.05, tile_vol:"Tile23n", eta_i:0, phi_n:64, cell_name:"BC1" },
    TileCell { sub:2, eta_c:-0.15, tile_vol:"Tile23n", eta_i:1, phi_n:64, cell_name:"BC2" },
    TileCell { sub:2, eta_c:-0.25, tile_vol:"Tile23n", eta_i:2, phi_n:64, cell_name:"BC3" },
    TileCell { sub:2, eta_c:-0.35, tile_vol:"Tile23n", eta_i:3, phi_n:64, cell_name:"BC4" },
    TileCell { sub:2, eta_c:-0.45, tile_vol:"Tile23n", eta_i:4, phi_n:64, cell_name:"BC5" },
    TileCell { sub:2, eta_c:-0.55, tile_vol:"Tile23n", eta_i:5, phi_n:64, cell_name:"BC6" },
    TileCell { sub:2, eta_c:-0.65, tile_vol:"Tile23n", eta_i:6, phi_n:64, cell_name:"BC7" },
    TileCell { sub:2, eta_c:-0.75, tile_vol:"Tile23n", eta_i:7, phi_n:64, cell_name:"BC8" },
    TileCell { sub:2, eta_c:-0.85, tile_vol:"Tile23n", eta_i:8, phi_n:64, cell_name:"B9"  },
    // Sampling D — Tile4n  (D1-D3; D0 não aparece em LBC no JiveXML)
    TileCell { sub:2, eta_c:-0.20, tile_vol:"Tile4n",  eta_i:1, phi_n:64, cell_name:"D1"  },
    TileCell { sub:2, eta_c:-0.40, tile_vol:"Tile4n",  eta_i:2, phi_n:64, cell_name:"D2"  },
    TileCell { sub:2, eta_c:-0.60, tile_vol:"Tile4n",  eta_i:3, phi_n:64, cell_name:"D3"  },

    // ── sub=5: EBA regular (η > 0) — cada célula tem η único ─────────────────
    // Sampling A — Tile5p
    TileCell { sub:5, eta_c: 1.0587, tile_vol:"Tile5p",  eta_i:0, phi_n:64, cell_name:"A12" },
    TileCell { sub:5, eta_c: 1.1594, tile_vol:"Tile5p",  eta_i:1, phi_n:64, cell_name:"A13" },
    TileCell { sub:5, eta_c: 1.2587, tile_vol:"Tile5p",  eta_i:2, phi_n:64, cell_name:"A14" },
    TileCell { sub:5, eta_c: 1.3579, tile_vol:"Tile5p",  eta_i:3, phi_n:64, cell_name:"A15" },
    TileCell { sub:5, eta_c: 1.4573, tile_vol:"Tile5p",  eta_i:4, phi_n:64, cell_name:"A16" },
    // Sampling B — Tile6p (B12-B15; B11 em sub=4)
    TileCell { sub:5, eta_c: 1.1580, tile_vol:"Tile6p",  eta_i:1, phi_n:64, cell_name:"B12" },
    TileCell { sub:5, eta_c: 1.2574, tile_vol:"Tile6p",  eta_i:2, phi_n:64, cell_name:"B13" },
    TileCell { sub:5, eta_c: 1.3568, tile_vol:"Tile6p",  eta_i:3, phi_n:64, cell_name:"B14" },
    TileCell { sub:5, eta_c: 1.4562, tile_vol:"Tile6p",  eta_i:4, phi_n:64, cell_name:"B15" },
    // D4, D5, D6
    TileCell { sub:5, eta_c: 1.0074, tile_vol:"Tile8p",  eta_i:0, phi_n:64, cell_name:"D4"  },
    TileCell { sub:5, eta_c: 1.2064, tile_vol:"Tile7p",  eta_i:0, phi_n:64, cell_name:"D5"  },
    TileCell { sub:5, eta_c: 1.5566, tile_vol:"Tile7p",  eta_i:1, phi_n:64, cell_name:"D6"  },

    // ── sub=0: EBC regular (η < 0) — cada célula tem η único ─────────────────
    // Sampling A — Tile5n
    TileCell { sub:0, eta_c:-1.0565, tile_vol:"Tile5n",  eta_i:0, phi_n:64, cell_name:"A12" },
    TileCell { sub:0, eta_c:-1.1570, tile_vol:"Tile5n",  eta_i:1, phi_n:64, cell_name:"A13" },
    TileCell { sub:0, eta_c:-1.2565, tile_vol:"Tile5n",  eta_i:2, phi_n:64, cell_name:"A14" },
    TileCell { sub:0, eta_c:-1.3559, tile_vol:"Tile5n",  eta_i:3, phi_n:64, cell_name:"A15" },
    TileCell { sub:0, eta_c:-1.4554, tile_vol:"Tile5n",  eta_i:4, phi_n:64, cell_name:"A16" },
    // Sampling B — Tile6n (B12-B15; B11 em sub=1)
    TileCell { sub:0, eta_c:-1.1560, tile_vol:"Tile6n",  eta_i:1, phi_n:64, cell_name:"B12" },
    TileCell { sub:0, eta_c:-1.2555, tile_vol:"Tile6n",  eta_i:2, phi_n:64, cell_name:"B13" },
    TileCell { sub:0, eta_c:-1.3551, tile_vol:"Tile6n",  eta_i:3, phi_n:64, cell_name:"B14" },
    TileCell { sub:0, eta_c:-1.4546, tile_vol:"Tile6n",  eta_i:4, phi_n:64, cell_name:"B15" },
    // D4, D5, D6
    TileCell { sub:0, eta_c:-1.0056, tile_vol:"Tile8n",  eta_i:0, phi_n:64, cell_name:"D4"  },
    TileCell { sub:0, eta_c:-1.2048, tile_vol:"Tile7n",  eta_i:0, phi_n:64, cell_name:"D5"  },
    TileCell { sub:0, eta_c:-1.5550, tile_vol:"Tile7n",  eta_i:1, phi_n:64, cell_name:"D6"  },

    // ── sub=4: EBA especial (η > 0) — sem D4/D5/D6 ──────────────────────────
    TileCell { sub:4, eta_c: 0.8580, tile_vol:"Tile9p",  eta_i:0, phi_n:64, cell_name:"C10" },
    TileCell { sub:4, eta_c: 0.9584, tile_vol:"Tile6p",  eta_i:0, phi_n:64, cell_name:"B11" },
    TileCell { sub:4, eta_c: 1.0589, tile_vol:"Tile10p", eta_i:0, phi_n:64, cell_name:"E1"  },
    TileCell { sub:4, eta_c: 1.1593, tile_vol:"Tile11p", eta_i:0, phi_n:64, cell_name:"E2"  },
    TileCell { sub:4, eta_c: 1.3098, tile_vol:"Tile12p", eta_i:0, phi_n:64, cell_name:"E3"  },
    TileCell { sub:4, eta_c: 1.5104, tile_vol:"Tile13p", eta_i:0, phi_n:64, cell_name:"E4"  },

    // ── sub=1: EBC especial (η < 0) — sem D4/D5/D6 ──────────────────────────
    TileCell { sub:1, eta_c:-0.8560, tile_vol:"Tile9n",  eta_i:0, phi_n:64, cell_name:"C10" },
    TileCell { sub:1, eta_c:-0.9563, tile_vol:"Tile6n",  eta_i:0, phi_n:64, cell_name:"B11" },
    TileCell { sub:1, eta_c:-1.0567, tile_vol:"Tile10n", eta_i:0, phi_n:64, cell_name:"E1"  },
    TileCell { sub:1, eta_c:-1.1570, tile_vol:"Tile11n", eta_i:0, phi_n:64, cell_name:"E2"  },
    TileCell { sub:1, eta_c:-1.3074, tile_vol:"Tile12n", eta_i:0, phi_n:64, cell_name:"E3"  },
    TileCell { sub:1, eta_c:-1.5078, tile_vol:"Tile13n", eta_i:0, phi_n:64, cell_name:"E4"  },

    // ── sub=6: MBTS-A (η > 0, φ_n=8) ─────────────────────────────────────────
    // R_mid(Tile14)=651mm, R_mid(Tile15)=289.5mm, z=3566mm
    // η = -ln(tan(atan2(R_mid,z)/2))
    TileCell { sub:6, eta_c: 2.40, tile_vol:"Tile14p", eta_i:0, phi_n:8, cell_name:"MBTS2" },
    TileCell { sub:6, eta_c: 3.20, tile_vol:"Tile15p", eta_i:0, phi_n:8, cell_name:"MBTS1" },

    // ── sub=7: MBTS-C (η < 0, φ_n=8) ─────────────────────────────────────────
    TileCell { sub:7, eta_c:-2.40, tile_vol:"Tile14n", eta_i:0, phi_n:8, cell_name:"MBTS2" },
    TileCell { sub:7, eta_c:-3.20, tile_vol:"Tile15n", eta_i:0, phi_n:8, cell_name:"MBTS1" },
];

// ─── Lookup: (eta, phi, sub) → caminho CGV ────────────────────────────────────
//
// Retorna (caminho, phi_j, índice_do_candidato_escolhido, total_candidatos).
// O chamador passa `nth` para resolver empates entre células no mesmo η
// (ex: A1 e BC1 têm o mesmo eta_c=0.05 em sub=3).

fn lookup_tile_cell_nth(
    hit_eta: f32,
    hit_phi: f32,
    hit_sub: u8,
    nth: usize,
) -> Option<(String, &'static str)> {
    // 1. Distância mínima em η para este sub
    let min_dist = TILE_CELLS
        .iter()
        .filter(|c| c.sub == hit_sub)
        .map(|c| (c.eta_c - hit_eta).abs())
        .fold(f32::INFINITY, f32::min);

    if min_dist.is_infinite() {
        return None;
    }

    // 2. Todos os candidatos dentro de min_dist + 5 mm em η
    let tol = min_dist + 0.0005_f32;
    let candidates: Vec<&TileCell> = TILE_CELLS
        .iter()
        .filter(|c| c.sub == hit_sub && (c.eta_c - hit_eta).abs() <= tol)
        .collect();

    // 3. Selecciona o nth candidato (cíclico)
    let cell = candidates[nth % candidates.len()];

    // 4. Módulo φ
    let phi_n = cell.phi_n as f32;
    let raw   = ((hit_phi + PI) * phi_n / (2.0 * PI)).floor() as i32;
    let j     = raw.rem_euclid(cell.phi_n as i32) as usize;

    let vol = cell.tile_vol;
    let i   = cell.eta_i as usize;
    Some((
        format!("Calorimeter→{vol}_0→{vol}{i}_{i}→cell_{j}"),
        cell.cell_name,
    ))
}

// ─── API pública ──────────────────────────────────────────────────────────────

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
    // ── localiza <TILE> ───────────────────────────────────────────────────────
    let tile_pos = match find_tag(xml_text, "TILE") {
        Some(p) => p,
        None    => return err_json("Tag <TILE> não encontrada no XML"),
    };
    let count_declared: usize = match attr_usize(&xml_text[tile_pos..], "count") {
        Some(n) => n,
        None    => return err_json("Atributo count ausente em <TILE>"),
    };
    let inner_start = match xml_text[tile_pos..].find('>') {
        Some(p) => tile_pos + p + 1,
        None    => return err_json("<TILE> malformada (sem >)"),
    };
    let inner_end = match xml_text[inner_start..].find("</TILE>") {
        Some(p) => inner_start + p,
        None    => return err_json("</TILE> não encontrada"),
    };
    let inner = &xml_text[inner_start..inner_end];

    // ── extrai arrays ─────────────────────────────────────────────────────────
    let energy = match extract_array(inner, "energy") {
        Some(v) => v,
        None    => return err_json("<energy> não encontrada dentro de <TILE>"),
    };
    let eta = match extract_array(inner, "eta") {
        Some(v) => v,
        None    => return err_json("<eta> não encontrada dentro de <TILE>"),
    };
    let phi = match extract_array(inner, "phi") {
        Some(v) => v,
        None    => return err_json("<phi> não encontrada dentro de <TILE>"),
    };
    let sub = match extract_array(inner, "sub") {
        Some(v) => v,
        None    => return err_json("<sub> não encontrada dentro de <TILE>"),
    };

    let count_actual = energy.len();
    let count_ok = count_actual == count_declared
        && count_actual == eta.len()
        && count_actual == phi.len()
        && count_actual == sub.len();

    // ── normaliza energia ─────────────────────────────────────────────────────
    let e_min = energy.iter().cloned().fold(f32::INFINITY,     f32::min);
    let e_max = energy.iter().cloned().fold(f32::NEG_INFINITY, f32::max);

    // ── estado para desambiguar células com mesmo η ───────────────────────────
    // Chave: (eta_arredondado×1000, phi_j, sub) → contagem de ocorrências
    let mut seen: HashMap<(i32, u8, u8), usize> = HashMap::new();

    // ── diagnóstico ───────────────────────────────────────────────────────────
    let mut sub_hist_mapped   = [0u32; 16];
    let mut sub_hist_unmapped = [0u32; 16];
    let mut sub_eta_min = [f32::INFINITY;     16];
    let mut sub_eta_max = [f32::NEG_INFINITY; 16];

    // ── monta hits ────────────────────────────────────────────────────────────
    let mut hits     = String::new();
    let mut mapped   = 0usize;
    let mut unmapped = 0usize;

    for i in 0..count_actual {
        let hit_sub  = sub[i].round() as u8;
        let hit_eta  = eta[i];
        let hit_phi  = phi[i];
        let hidx     = (hit_sub as usize).min(15);

        sub_eta_min[hidx] = sub_eta_min[hidx].min(hit_eta);
        sub_eta_max[hidx] = sub_eta_max[hidx].max(hit_eta);

        // Calcula phi_j antecipado para usar na chave de desambiguação
        let phi_j_key = {
            let raw = ((hit_phi + PI) * 64.0 / (2.0 * PI)).floor() as i32;
            raw.rem_euclid(64) as u8
        };
        let eta_key  = (hit_eta * 1000.0).round() as i32;
        let seen_key = (eta_key, phi_j_key, hit_sub);
        let nth      = *seen.get(&seen_key).unwrap_or(&0);
        seen.insert(seen_key, nth + 1);

        match lookup_tile_cell_nth(hit_eta, hit_phi, hit_sub, nth) {
            Some((path, cell_name)) => {
                let (r, g, b) = jet(energy[i], e_min, e_max);
                if !hits.is_empty() { hits.push(','); }
                hits.push_str(&format!(
                    r#"{{"path":{},"energy":{:.4},"eta":{:.4},"phi":{:.4},"sub":{:.0},"cell":{},"r":{:.4},"g":{:.4},"b":{:.4}}}"#,
                    js(&path), energy[i], hit_eta, hit_phi, sub[i], js(cell_name), r, g, b
                ));
                mapped += 1;
                sub_hist_mapped[hidx] += 1;
            }
            None => {
                unmapped += 1;
                sub_hist_unmapped[hidx] += 1;
            }
        }
    }

    // ── serializa diagnóstico ─────────────────────────────────────────────────
    let mut sub_diag = String::new();
    for s in 0..16usize {
        let m = sub_hist_mapped[s];
        let u = sub_hist_unmapped[s];
        if m + u > 0 {
            if !sub_diag.is_empty() { sub_diag.push(','); }
            sub_diag.push_str(&format!(
                r#"{{"sub":{},"mapped":{},"unmapped":{},"eta_min":{:.3},"eta_max":{:.3}}}"#,
                s, m, u, sub_eta_min[s], sub_eta_max[s]
            ));
        }
    }

    format!(
        r#"{{"ok":true,"count_declared":{},"count_actual":{},"count_ok":{},"cells_mapped":{},"cells_unmapped":{},"e_min":{:.4},"e_max":{:.4},"sub_diag":[{}],"hits":[{}]}}"#,
        count_declared, count_actual, count_ok, mapped, unmapped,
        e_min, e_max, sub_diag, hits
    )
}

// ─── helpers ──────────────────────────────────────────────────────────────────

fn err_json(msg: &str) -> String { format!(r#"{{"ok":false,"error":{}}}"#, js(msg)) }

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

fn attr_usize(text: &str, name: &str) -> Option<usize> {
    let needle = format!("{}=\"", name);
    let start  = text.find(&needle)? + needle.len();
    let end    = text[start..].find('"')? + start;
    text[start..end].parse().ok()
}

fn extract_array(content: &str, tag: &str) -> Option<Vec<f32>> {
    let open  = format!("<{}>",  tag);
    let close = format!("</{}>", tag);
    let s = content.find(&open)?  + open.len();
    let e = content[s..].find(&close)? + s;
    Some(content[s..e].split_whitespace().filter_map(|t| t.parse().ok()).collect())
}

fn jet(e: f32, e_min: f32, e_max: f32) -> (f32, f32, f32) {
    let t = if (e_max - e_min).abs() > 1e-10 {
        ((e - e_min) / (e_max - e_min)).clamp(0.0, 1.0)
    } else { 0.5 };
    if t < 0.25      { let s = t / 0.25;           (0.0, s, 1.0)       }
    else if t < 0.5  { let s = (t - 0.25) / 0.25;  (0.0, 1.0, 1.0 - s) }
    else if t < 0.75 { let s = (t - 0.5)  / 0.25;  (s,   1.0, 0.0)     }
    else             { let s = (t - 0.75) / 0.25;   (1.0, 1.0 - s, 0.0) }
}
