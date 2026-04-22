// JiveXML streaming parser — runs in WASM, no DOM, no JS allocations during parse.
//
// JiveXML structure (all values are whitespace-separated text inside child elements):
//
//   <Event runNumber="..." eventNumber="..." lumiBlock="..." dateTime="..." version="...">
//     <TILE  count="N" storeGateKey="..."> <id>…</id> <energy>…</energy> </TILE>
//     <LAr   count="N" storeGateKey="..."> <id>…</id> <energy>…</energy> </LAr>
//     <HEC   count="N" storeGateKey="..."> <id>…</id> <energy>…</energy> </HEC>
//     <FCAL  count="N" storeGateKey="..."> <id>…</id> <energy>…</energy>
//                                          <x>…</x> <y>…</y> <z>…</z>
//                                          <dx>…</dx> <dy>…</dy> <dz>…</dz> </FCAL>
//     <MBTS  count="N" storeGateKey="..."> <label>…</label> <energy>…</energy> </MBTS>
//     <Track count="N" storeGateKey="..."> <numPolyline>…</numPolyline>
//                                          <polylineX>…</polylineX> … <pt>…</pt>
//                                          <numHits>…</numHits> <hits>…</hits> </Track>
//     <Photon count="N" storeGateKey="..."> <eta>…</eta> <phi>…</phi>
//                                           <energy>…</energy> <pt>…</pt> </Photon>
//     <Cluster count="N" storeGateKey="..."> <eta>…</eta> <phi>…</phi>
//                                            <et>…</et> <numCells>…</numCells>
//                                            <cells>…</cells> </Cluster>
//   </Event>

use quick_xml::events::Event;
use quick_xml::Reader;
use serde::Serialize;
use std::f32::consts::PI;

// ── Output types (field names match the JS worker protocol exactly) ───────────

#[derive(Serialize, Default)]
pub struct EventInfo {
    #[serde(rename = "runNumber")]   pub run_number:   String,
    #[serde(rename = "eventNumber")] pub event_number: String,
    #[serde(rename = "lumiBlock")]   pub lumi_block:   String,
    #[serde(rename = "dateTime")]    pub date_time:    String,
    pub version: String,
}

#[derive(Serialize)]
pub struct CellData {
    pub id: String,
    pub energy: f32,
}

#[derive(Serialize)]
pub struct MbtsCell {
    pub label: String,
    pub energy: f32,
}

#[derive(Serialize)]
pub struct FcalCell {
    pub x: f32, pub y: f32, pub z: f32,
    pub dx: f32, pub dy: f32, pub dz: f32,
    pub energy: f32,
    pub id: String,
    pub module: i32,
    pub eta: f32, pub phi: f32,
}

#[derive(Serialize)]
pub struct TrackPt {
    pub x: f32, pub y: f32, pub z: f32,
}

#[derive(Serialize)]
pub struct Track {
    pub pts: Vec<TrackPt>,
    #[serde(rename = "ptGev")]        pub pt_gev:         f32,
    #[serde(rename = "hitIds")]       pub hit_ids:        Vec<String>,
    #[serde(rename = "storeGateKey")] pub store_gate_key: String,
}

#[derive(Serialize)]
pub struct Photon {
    pub eta: f32,
    pub phi: f32,
    #[serde(rename = "energyGev")] pub energy_gev: f32,
    #[serde(rename = "ptGev")]     pub pt_gev:     f32,
}

#[derive(Serialize, Default)]
pub struct ClusterCells {
    #[serde(rename = "TILE")]   pub tile:   Vec<String>,
    #[serde(rename = "LAR_EM")] pub lar_em: Vec<String>,
    #[serde(rename = "HEC")]    pub hec:    Vec<String>,
    #[serde(rename = "FCAL")]   pub fcal:   Vec<String>,
    #[serde(rename = "TRACK")]  pub track:  Vec<String>,
    #[serde(rename = "OTHER")]  pub other:  Vec<String>,
}

impl ClusterCells {
    fn push(&mut self, code: u8, id: String) {
        match code {
            0 => self.tile.push(id),
            1 => self.lar_em.push(id),
            2 => self.hec.push(id),
            3 => self.fcal.push(id),
            4 => self.track.push(id),
            _ => self.other.push(id),
        }
    }
    fn clone_into_coll(&self) -> CollClusterCells {
        CollClusterCells {
            tile:   self.tile.clone(),
            lar_em: self.lar_em.clone(),
            hec:    self.hec.clone(),
            fcal:   self.fcal.clone(),
            track:  self.track.clone(),
            other:  self.other.clone(),
        }
    }
}

// Cluster in the flat array (includes storeGateKey)
#[derive(Serialize)]
pub struct Cluster {
    pub eta: f32,
    pub phi: f32,
    #[serde(rename = "etGev")]        pub et_gev:         f32,
    pub cells: ClusterCells,
    #[serde(rename = "storeGateKey")] pub store_gate_key: String,
}

// Cluster inside a collection (no storeGateKey, matched by the collection's key)
#[derive(Serialize)]
pub struct CollClusterCells {
    #[serde(rename = "TILE")]   pub tile:   Vec<String>,
    #[serde(rename = "LAR_EM")] pub lar_em: Vec<String>,
    #[serde(rename = "HEC")]    pub hec:    Vec<String>,
    #[serde(rename = "FCAL")]   pub fcal:   Vec<String>,
    #[serde(rename = "TRACK")]  pub track:  Vec<String>,
    #[serde(rename = "OTHER")]  pub other:  Vec<String>,
}

#[derive(Serialize)]
pub struct CollCluster {
    pub eta: f32,
    pub phi: f32,
    #[serde(rename = "etGev")] pub et_gev: f32,
    pub cells: CollClusterCells,
}

#[derive(Serialize)]
pub struct ClusterCollection {
    pub key: String,
    pub clusters: Vec<CollCluster>,
}

#[derive(Serialize, Default)]
pub struct ParseResult {
    #[serde(rename = "eventInfo")]          pub event_info:          Option<EventInfo>,
    #[serde(rename = "tileCells")]          pub tile_cells:          Vec<CellData>,
    #[serde(rename = "larCells")]           pub lar_cells:           Vec<CellData>,
    #[serde(rename = "hecCells")]           pub hec_cells:           Vec<CellData>,
    #[serde(rename = "mbtsCells")]          pub mbts_cells:          Vec<MbtsCell>,
    #[serde(rename = "fcalCells")]          pub fcal_cells:          Vec<FcalCell>,
    pub tracks:                             Vec<Track>,
    pub photons:                            Vec<Photon>,
    pub clusters:                           Vec<Cluster>,
    #[serde(rename = "clusterCollections")] pub cluster_collections: Vec<ClusterCollection>,
    #[serde(rename = "tilePacked")]         pub tile_packed:         Vec<i32>,
    #[serde(rename = "larPacked")]          pub lar_packed:          Vec<i32>,
    #[serde(rename = "hecPacked")]          pub hec_packed:          Vec<i32>,
}

// ── Parser state machine ──────────────────────────────────────────────────────

#[derive(PartialEq, Clone, Copy)]
enum Ctx {
    None, Tile, Lar, Hec, Fcal, Mbts, Track, Photon, Cluster,
}

struct Parser {
    ctx:   Ctx,
    field: Vec<u8>,   // current child element name (as raw bytes for fast compare)
    text:  String,    // accumulated text for current field
    sgk:   String,    // storeGateKey of current detector block

    // shared per-detector accumulators (cleared on each detector-block start)
    ids:      Vec<String>,
    energies: Vec<f32>,
    labels:   Vec<String>,
    xs: Vec<f32>, ys: Vec<f32>, zs: Vec<f32>,
    dxs: Vec<f32>, dys: Vec<f32>, dzs: Vec<f32>,
    num_poly:   Vec<i32>,
    poly_x: Vec<f32>, poly_y: Vec<f32>, poly_z: Vec<f32>,
    track_pt:   Vec<f32>,
    num_hits:   Vec<i32>,
    hits_flat:  Vec<String>,
    etas: Vec<f32>, phis: Vec<f32>,
    ens:  Vec<f32>,
    pts_a: Vec<f32>,
    num_cells:  Vec<i32>,
    cells_flat: Vec<String>,

    out: ParseResult,
}

impl Parser {
    fn new() -> Self {
        Parser {
            ctx: Ctx::None, field: Vec::new(), text: String::new(), sgk: String::new(),
            ids: vec![], energies: vec![], labels: vec![],
            xs: vec![], ys: vec![], zs: vec![],
            dxs: vec![], dys: vec![], dzs: vec![],
            num_poly: vec![], poly_x: vec![], poly_y: vec![], poly_z: vec![],
            track_pt: vec![], num_hits: vec![], hits_flat: vec![],
            etas: vec![], phis: vec![],
            ens: vec![], pts_a: vec![],
            num_cells: vec![], cells_flat: vec![],
            out: ParseResult::default(),
        }
    }

    fn clear_acc(&mut self) {
        self.ids.clear();      self.energies.clear(); self.labels.clear();
        self.xs.clear();       self.ys.clear();       self.zs.clear();
        self.dxs.clear();      self.dys.clear();      self.dzs.clear();
        self.num_poly.clear(); self.poly_x.clear();   self.poly_y.clear(); self.poly_z.clear();
        self.track_pt.clear(); self.num_hits.clear(); self.hits_flat.clear();
        self.etas.clear();     self.phis.clear();
        self.ens.clear();      self.pts_a.clear();
        self.num_cells.clear(); self.cells_flat.clear();
    }

    fn commit_field(&mut self) {
        let t = self.text.trim();
        if t.is_empty() { return; }
        match (self.ctx, self.field.as_slice()) {
            // TILE / LAr / HEC share the same id+energy fields
            (Ctx::Tile | Ctx::Lar | Ctx::Hec, b"id" | b"cellID") => self.ids = split_strings(t),
            (Ctx::Tile | Ctx::Lar | Ctx::Hec, b"energy" | b"e")  => self.energies = split_f32(t),
            // FCAL
            (Ctx::Fcal, b"id" | b"cellID") => self.ids      = split_strings(t),
            (Ctx::Fcal, b"energy" | b"e")  => self.energies = split_f32(t),
            (Ctx::Fcal, b"x")  => self.xs  = split_f32(t),
            (Ctx::Fcal, b"y")  => self.ys  = split_f32(t),
            (Ctx::Fcal, b"z")  => self.zs  = split_f32(t),
            (Ctx::Fcal, b"dx") => self.dxs = split_f32(t),
            (Ctx::Fcal, b"dy") => self.dys = split_f32(t),
            (Ctx::Fcal, b"dz") => self.dzs = split_f32(t),
            // MBTS
            (Ctx::Mbts, b"label")         => self.labels   = split_strings(t),
            (Ctx::Mbts, b"energy" | b"e") => self.energies = split_f32(t),
            // Track
            (Ctx::Track, b"numPolyline") => self.num_poly  = split_i32(t),
            (Ctx::Track, b"polylineX")   => self.poly_x    = split_f32(t),
            (Ctx::Track, b"polylineY")   => self.poly_y    = split_f32(t),
            (Ctx::Track, b"polylineZ")   => self.poly_z    = split_f32(t),
            (Ctx::Track, b"pt")          => self.track_pt  = split_f32(t),
            (Ctx::Track, b"numHits")     => self.num_hits  = split_i32(t),
            (Ctx::Track, b"hits")        => self.hits_flat = split_strings(t),
            // Photon
            (Ctx::Photon, b"eta")            => self.etas  = split_f32(t),
            (Ctx::Photon, b"phi")            => self.phis  = split_f32(t),
            (Ctx::Photon, b"energy")         => self.ens   = split_f32(t),
            (Ctx::Photon, b"pt")             => self.pts_a = split_f32(t),
            // Cluster
            (Ctx::Cluster, b"eta")      => self.etas       = split_f32(t),
            (Ctx::Cluster, b"phi")      => self.phis       = split_f32(t),
            (Ctx::Cluster, b"et")       => self.ens        = split_f32(t),
            (Ctx::Cluster, b"numCells") => self.num_cells  = split_i32(t),
            (Ctx::Cluster, b"cells")    => self.cells_flat = split_strings(t),
            _ => {}
        }
    }

    fn flush_tile(&mut self) {
        let n = self.ids.len().min(self.energies.len());
        self.out.tile_cells.reserve(n);
        for i in 0..n {
            self.out.tile_cells.push(CellData { id: self.ids[i].clone(), energy: self.energies[i] });
        }
    }

    fn flush_lar(&mut self) {
        let n = self.ids.len().min(self.energies.len());
        self.out.lar_cells.reserve(n);
        for i in 0..n {
            self.out.lar_cells.push(CellData { id: self.ids[i].clone(), energy: self.energies[i] });
        }
    }

    fn flush_hec(&mut self) {
        let n = self.ids.len().min(self.energies.len());
        self.out.hec_cells.reserve(n);
        for i in 0..n {
            self.out.hec_cells.push(CellData { id: self.ids[i].clone(), energy: self.energies[i] });
        }
    }

    fn flush_fcal(&mut self) {
        let n = self.xs.len()
            .min(self.ys.len()).min(self.zs.len())
            .min(self.dxs.len()).min(self.dys.len()).min(self.dzs.len());
        self.out.fcal_cells.reserve(n);
        for i in 0..n {
            let id_str = self.ids.get(i).map(String::as_str).unwrap_or("");
            let (module, eta, phi) = fcal_decode(id_str);
            self.out.fcal_cells.push(FcalCell {
                x: self.xs[i], y: self.ys[i], z: self.zs[i],
                dx: self.dxs[i], dy: self.dys[i], dz: self.dzs[i],
                energy: self.energies.get(i).copied().unwrap_or(0.0),
                id: id_str.to_string(), module, eta, phi,
            });
        }
    }

    fn flush_mbts(&mut self) {
        let n = self.labels.len().min(self.energies.len());
        for i in 0..n {
            self.out.mbts_cells.push(MbtsCell { label: self.labels[i].clone(), energy: self.energies[i] });
        }
    }

    fn flush_track(&mut self) {
        let sgk = self.sgk.clone();
        let mut coord_off = 0usize;
        let mut hit_off   = 0usize;
        for (i, &np) in self.num_poly.iter().enumerate() {
            let np = np as usize;
            let nh = self.num_hits.get(i).copied().unwrap_or(0) as usize;
            let hit_ids: Vec<String> = self.hits_flat[hit_off..].iter().take(nh).cloned().collect();
            hit_off += nh;
            if np >= 2 {
                let mut pts = Vec::with_capacity(np);
                for j in 0..np {
                    let k = coord_off + j;
                    pts.push(TrackPt {
                        x: -self.poly_x.get(k).copied().unwrap_or(0.0) * 10.0,
                        y: -self.poly_y.get(k).copied().unwrap_or(0.0) * 10.0,
                        z:  self.poly_z.get(k).copied().unwrap_or(0.0) * 10.0,
                    });
                }
                let pt_gev = self.track_pt.get(i).copied().unwrap_or(0.0).abs();
                self.out.tracks.push(Track { pts, pt_gev, hit_ids, store_gate_key: sgk.clone() });
            }
            coord_off += np;
        }
    }

    fn flush_photon(&mut self) {
        let m = self.etas.len().min(self.phis.len());
        for i in 0..m {
            self.out.photons.push(Photon {
                eta: self.etas[i],
                phi: self.phis[i],
                energy_gev: self.ens.get(i).copied().unwrap_or(0.0),
                pt_gev:     self.pts_a.get(i).copied().unwrap_or(0.0),
            });
        }
    }

    fn flush_cluster(&mut self) {
        let sgk = self.sgk.clone();
        let m = self.etas.len().min(self.phis.len());
        let mut cell_off = 0usize;
        let mut coll = ClusterCollection { key: sgk.clone(), clusters: Vec::new() };
        for i in 0..m {
            let nc = self.num_cells.get(i).copied().unwrap_or(0) as usize;
            let end = (cell_off + nc).min(self.cells_flat.len());
            let mut cells = ClusterCells::default();
            for id_str in &self.cells_flat[cell_off..end] {
                if !id_str.is_empty() {
                    cells.push(cell_subdet_code(id_str), id_str.clone());
                }
            }
            cell_off += nc;
            let eta    = self.etas[i];
            let phi    = self.phis[i];
            let et_gev = self.ens.get(i).copied().unwrap_or(0.0);
            coll.clusters.push(CollCluster { eta, phi, et_gev, cells: cells.clone_into_coll() });
            self.out.clusters.push(Cluster { eta, phi, et_gev, cells, store_gate_key: sgk.clone() });
        }
        if !coll.clusters.is_empty() {
            self.out.cluster_collections.push(coll);
        }
    }

    fn flush_ctx(&mut self) {
        match self.ctx {
            Ctx::Tile    => self.flush_tile(),
            Ctx::Lar     => self.flush_lar(),
            Ctx::Hec     => self.flush_hec(),
            Ctx::Fcal    => self.flush_fcal(),
            Ctx::Mbts    => self.flush_mbts(),
            Ctx::Track   => self.flush_track(),
            Ctx::Photon  => self.flush_photon(),
            Ctx::Cluster => self.flush_cluster(),
            Ctx::None    => {}
        }
        self.ctx = Ctx::None;
        self.field.clear();
    }
}

// ── Public entry point ────────────────────────────────────────────────────────

pub fn parse_jivexml_inner(xml_text: &str) -> ParseResult {
    const DET: &[&[u8]] = &[b"TILE", b"LAr", b"HEC", b"FCAL", b"MBTS",
                              b"Track", b"Photon", b"Cluster"];

    let mut reader = Reader::from_str(xml_text);
    reader.config_mut().trim_text(false);
    let mut buf = Vec::with_capacity(65536);
    let mut p = Parser::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let nm = e.local_name();
                let nm = nm.as_ref();
                if p.ctx == Ctx::None {
                    if nm == b"Event" {
                        // Extract event-level metadata from attributes
                        p.out.event_info = Some(EventInfo {
                            run_number:   get_attr(e, b"runNumber"),
                            event_number: get_attr(e, b"eventNumber"),
                            lumi_block:   get_attr(e, b"lumiBlock"),
                            date_time:    get_attr(e, b"dateTime"),
                            version:      get_attr(e, b"version"),
                        });
                    } else if DET.contains(&nm) {
                        p.sgk = get_attr(e, b"storeGateKey");
                        p.clear_acc();
                        p.ctx = match nm {
                            b"TILE"    => Ctx::Tile,
                            b"LAr"     => Ctx::Lar,
                            b"HEC"     => Ctx::Hec,
                            b"FCAL"    => Ctx::Fcal,
                            b"MBTS"    => Ctx::Mbts,
                            b"Track"   => Ctx::Track,
                            b"Photon"  => Ctx::Photon,
                            b"Cluster" => Ctx::Cluster,
                            _ => Ctx::None,
                        };
                    }
                } else {
                    // Inside a detector block — start of a field element
                    p.field.clear();
                    p.field.extend_from_slice(nm);
                    p.text.clear();
                }
            }
            Ok(Event::Text(ref e)) => {
                if p.ctx != Ctx::None && !p.field.is_empty() {
                    if let Ok(t) = e.unescape() {
                        p.text.push_str(&t);
                    }
                }
            }
            Ok(Event::End(ref e)) => {
                if p.ctx != Ctx::None {
                    let nm = e.local_name();
                    let nm = nm.as_ref();
                    if DET.contains(&nm) {
                        p.flush_ctx();
                    } else if !p.field.is_empty() {
                        p.commit_field();
                        p.field.clear();
                        p.text.clear();
                    }
                }
            }
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
        buf.clear();
    }

    // Bulk-decode ATLAS IDs for the three main calorimeters
    p.out.tile_packed = decode_cells(&p.out.tile_cells);
    p.out.lar_packed  = decode_cells(&p.out.lar_cells);
    p.out.hec_packed  = decode_cells(&p.out.hec_cells);

    p.out
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn get_attr(e: &quick_xml::events::BytesStart, key: &[u8]) -> String {
    e.attributes().flatten()
        .find(|a| a.key.as_ref() == key)
        .and_then(|a| a.unescape_value().ok())
        .map(|v| v.into_owned())
        .unwrap_or_default()
}

#[inline]
fn split_f32(s: &str) -> Vec<f32> {
    s.split_ascii_whitespace().filter_map(|t| t.parse().ok()).collect()
}

#[inline]
fn split_i32(s: &str) -> Vec<i32> {
    s.split_ascii_whitespace().filter_map(|t| t.parse().ok()).collect()
}

#[inline]
fn split_strings(s: &str) -> Vec<String> {
    s.split_ascii_whitespace().map(|t| t.to_string()).collect()
}

/// Classify a 64-bit ATLAS ID by sub-detector.
/// Returns: 0=TILE, 1=LAR_EM, 2=HEC, 3=FCAL, 4=TRACK, 5=OTHER
fn cell_subdet_code(id_str: &str) -> u8 {
    let id: u64 = match id_str.parse() { Ok(v) => v, Err(_) => return 5 };
    const SD_MAP: [u8; 8] = [2, 4, 5, 7, 10, 11, 12, 13];
    match SD_MAP[((id >> 61) & 7) as usize] {
        5 => 0,
        2 => 4,
        4 => {
            const PART: [i8; 8] = [-3, -2, -1, 1, 2, 3, 4, 5];
            match PART[((id >> 58) & 7) as usize].abs() {
                1 => 1, 2 => 2, 3 => 3, _ => 5,
            }
        }
        _ => 5,
    }
}

/// Decode FCAL compact ID → (module 1-3, eta, phi).
fn fcal_decode(id_str: &str) -> (i32, f32, f32) {
    let id: u64 = match id_str.parse() { Ok(v) => v, Err(_) => return (0, 0.0, 0.0) };
    let be: f32 = if (id >> 57) & 1 == 1 { 1.0 } else { -1.0 };
    let mr  = ((id >> 55) & 3) as usize;
    let ei  = ((id >> 49) & 63) as f32;
    let phi = (((id >> 45) & 15) as f32 + 0.5) * (2.0 * PI / 16.0);
    const EP: [(f32, f32); 3] = [(3.2, 0.025), (3.2, 0.05), (3.2, 0.1)];
    let (e0, de) = EP.get(mr).copied().unwrap_or((3.2, 0.025));
    (mr as i32 + 1, be * (e0 + ei * de + de / 2.0), phi)
}

/// Pack cell IDs using the same compact decode as parse_atlas_ids_bulk.
fn decode_cells(cells: &[CellData]) -> Vec<i32> {
    let mut v = Vec::with_capacity(cells.len() * 8);
    for c in cells {
        if let Ok(id) = c.id.parse::<u64>() {
            v.extend_from_slice(&crate::decode_id_compact(id));
        } else {
            v.extend_from_slice(&[0i32; 8]);
        }
    }
    v
}
