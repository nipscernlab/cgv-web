use wasm_bindgen::prelude::*;
use std::cell::RefCell;

thread_local! {
    /// Paths das células folha do CGV, em ordem de aparição.
    /// Índice i corresponde ao índice i das arrays energy/eta/phi/sub do XML.
    static CELL_PATHS: RefCell<Vec<String>> = RefCell::new(Vec::new());
}

// ─── API pública ──────────────────────────────────────────────────────────────

/// Carrega o .cgv e extrai os paths das células folha (segmento final = "cell*").
/// Retorna o número de células encontradas.
#[wasm_bindgen]
pub fn load_cgv(cgv_text: &str) -> usize {
    let mut paths: Vec<String> = Vec::new();

    for line in cgv_text.lines() {
        let t = line.trim();
        if t.is_empty() || t.starts_with('#') {
            continue;
        }
        // Último token que não seja vazio nem "→"
        let last = t.split('\t')
            .filter(|s| !s.trim().is_empty() && *s != "→")
            .last();
        if let Some(seg) = last {
            if seg.starts_with("cell") {
                paths.push(line.to_string());
            }
        }
    }

    let n = paths.len();
    CELL_PATHS.with(|c| *c.borrow_mut() = paths);
    n
}

/// Processa o XML do evento, extrai o bloco <TILE>, valida o count,
/// mapeia por índice para os paths do CGV e retorna JSON com os hits.
#[wasm_bindgen]
pub fn process_event(xml_text: &str) -> String {
    // ── localiza <TILE ───────────────────────────────────────────────────────
    let tile_pos = match find_tag(xml_text, "TILE") {
        Some(p) => p,
        None    => return err_json("Tag <TILE> não encontrada no XML"),
    };

    let count_declared: usize = match attr_usize(&xml_text[tile_pos..], "count") {
        Some(n) => n,
        None    => return err_json("Atributo count ausente em <TILE>"),
    };

    // Conteúdo entre o fim de <TILE ...> e </TILE>
    let inner_start = match xml_text[tile_pos..].find('>') {
        Some(p) => tile_pos + p + 1,
        None    => return err_json("<TILE> malformada (sem >)"),
    };
    let inner_end = match xml_text[inner_start..].find("</TILE>") {
        Some(p) => inner_start + p,
        None    => return err_json("</TILE> não encontrada"),
    };
    let inner = &xml_text[inner_start..inner_end];

    // ── extrai as quatro arrays ──────────────────────────────────────────────
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
    let count_ok     = count_actual == count_declared
        && count_actual == eta.len()
        && count_actual == phi.len()
        && count_actual == sub.len();

    // ── normaliza energia para o colormap ────────────────────────────────────
    let e_min = energy.iter().cloned().fold(f32::INFINITY,     f32::min);
    let e_max = energy.iter().cloned().fold(f32::NEG_INFINITY, f32::max);

    // ── monta hits por índice ────────────────────────────────────────────────
    let cell_paths = CELL_PATHS.with(|c| c.borrow().clone());
    let n          = count_actual.min(cell_paths.len());

    let mut hits = String::new();
    for i in 0..n {
        let (r, g, b) = jet(energy[i], e_min, e_max);
        if !hits.is_empty() { hits.push(','); }
        hits.push_str(&format!(
            r#"{{"path":{},"energy":{:.4},"eta":{:.4},"phi":{:.4},"sub":{:.0},"r":{:.4},"g":{:.4},"b":{:.4}}}"#,
            js(&cell_paths[i]),
            energy[i], eta[i], phi[i], sub[i],
            r, g, b
        ));
    }

    format!(
        r#"{{"ok":true,"count_declared":{},"count_actual":{},"count_ok":{},"cells_mapped":{},"e_min":{:.4},"e_max":{:.4},"hits":[{}]}}"#,
        count_declared, count_actual, count_ok, n,
        e_min, e_max, hits
    )
}

// ─── helpers internos ─────────────────────────────────────────────────────────

fn err_json(msg: &str) -> String {
    format!(r#"{{"ok":false,"error":{}}}"#, js(msg))
}

/// Serializa uma string Rust como literal JSON (com aspas e escapes).
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
    let v: Vec<f32> = content[s..e]
        .split_whitespace()
        .filter_map(|tok| tok.parse().ok())
        .collect();
    Some(v)
}

/// Jet colormap: blue → cyan → green → yellow → red
fn jet(e: f32, e_min: f32, e_max: f32) -> (f32, f32, f32) {
    let t = if (e_max - e_min).abs() > 1e-10 {
        ((e - e_min) / (e_max - e_min)).clamp(0.0, 1.0)
    } else {
        0.5
    };
    if t < 0.25 {
        let s = t / 0.25;
        (0.0, s, 1.0)
    } else if t < 0.5 {
        let s = (t - 0.25) / 0.25;
        (0.0, 1.0, 1.0 - s)
    } else if t < 0.75 {
        let s = (t - 0.5) / 0.25;
        (s, 1.0, 0.0)
    } else {
        let s = (t - 0.75) / 0.25;
        (1.0, 1.0 - s, 0.0)
    }
}
