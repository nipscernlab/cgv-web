#!/usr/bin/env node
/**
 * root2scene.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Converte um arquivo CERN .root em dois arquivos:
 *
 *   <stem>.cgv   — Árvore hierárquica completa no formato XML/CGV
 *   <stem>.gltf  — Cena 3-D pronta para Three.js (GLTF 2.0 JSON)
 *
 * Uso:
 *   node root2scene.mjs <arquivo.root> [opções]
 *
 * Opções:
 *   --out <dir>        diretório de saída  (padrão: mesmo dir do .root)
 *   --max-faces <n>    limite de faces por shape  (padrão: 0 = ilimitado)
 *   --depth <n>        profundidade máxima da árvore (padrão: 0 = toda)
 *   --visible-only     ignorar volumes invisíveis (bit kVisThis = 0x08)
 *   --no-gltf          gerar apenas o .cgv
 *   --no-cgv           gerar apenas o .gltf
 *   --verbose          log detalhado
 *   --help             exibe esta ajuda
 *
 * Setup (uma única vez após clonar/baixar este arquivo):
 *   npm install jsroot --ignore-scripts
 *   node setup.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Polyfill FileReader para Node.js ────────────────────────────────────────
import './lib/polyfill.mjs';

// ─── Node built-ins ───────────────────────────────────────────────────────────
import { mkdirSync }             from 'node:fs';
import { writeFile }             from 'node:fs/promises';
import { resolve, basename,
         extname, dirname, join } from 'node:path';
import { performance }            from 'node:perf_hooks';
import { parseArgs }              from 'node:util';

// ─── JSROOT ───────────────────────────────────────────────────────────────────
import { openFile }              from 'jsroot/io';
import { getRootColors }         from 'jsroot/colors';
import { THREE }                 from 'jsroot/base3d';

// ─── geobase (não é parte dos exports públicos do JSROOT) ────────────────────
import {
  createGeometry,
  numGeometryFaces,
} from './lib/geobase.mjs';

// ─── GLTFExporter ─────────────────────────────────────────────────────────────
import { GLTFExporter }          from 'three/examples/jsm/exporters/GLTFExporter.js';

// ═════════════════════════════════════════════════════════════════════════════
// LOG
// ═════════════════════════════════════════════════════════════════════════════
const T0    = performance.now();
const ts    = () => `[${((performance.now() - T0) / 1000).toFixed(3)}s]`;
let VERBOSE = false;

const log  = (...a) => console.log (ts(), ...a);
const info = (...a) => console.log (ts(), ' ℹ', ...a);
const ok   = (...a) => console.log (ts(), ' ✔', ...a);
const warn = (...a) => console.warn(ts(), ' ⚠', ...a);
const dbg  = (...a) => { if (VERBOSE) console.log(ts(), ' ·', ...a); };
const die  = (msg)  => { console.error(ts(), '✖', msg); process.exit(1); };

// ═════════════════════════════════════════════════════════════════════════════
// ARGUMENTOS CLI
// ═════════════════════════════════════════════════════════════════════════════
function parseCliArgs() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      out:            { type: 'string'  },
      'max-faces':    { type: 'string'  },
      depth:          { type: 'string'  },
      'visible-only': { type: 'boolean', default: false },
      'no-gltf':      { type: 'boolean', default: false },
      'no-cgv':       { type: 'boolean', default: false },
      verbose:        { type: 'boolean', default: false },
      help:           { type: 'boolean', default: false },
    },
  });

  if (values.help || positionals.length === 0) {
    console.log(`
Uso: node root2scene.mjs <arquivo.root> [opções]

  --out <dir>        diretório de saída (padrão: mesmo dir do .root)
  --max-faces <n>    limite de faces por shape (0 = ilimitado)
  --depth <n>        profundidade máxima da árvore CGV (0 = toda)
  --visible-only     pular volumes invisíveis (bit kVisThis)
  --no-gltf          gerar apenas o .cgv, pular o .gltf
  --no-cgv           gerar apenas o .gltf, pular o .cgv
  --verbose          log detalhado
  --help             esta mensagem
`);
    process.exit(0);
  }

  const rootPath = resolve(positionals[0]);
  return {
    rootPath,
    outDir:      values.out ? resolve(values.out) : dirname(rootPath),
    maxFaces:    parseInt(values['max-faces'] ?? '0', 10),
    maxDepth:    parseInt(values['depth']     ?? '0', 10),
    visibleOnly: values['visible-only'],
    noGltf:      values['no-gltf'],
    noCgv:       values['no-cgv'],
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// LEITURA DO ARQUIVO .root
// ═════════════════════════════════════════════════════════════════════════════

async function openRootFile(path) {
  dbg('openFile:', path);
  const file = await openFile(path);
  if (!file) die(`Não foi possível abrir: ${path}`);
  const keys = Array.isArray(file.fKeys) ? file.fKeys : [];
  info(`${keys.length} chave(s) no arquivo`);
  return { file, keys };
}

async function findGeoManager(file, keys) {
  const GEO = new Set(['TGeoManager', 'TGeoVolume', 'TGeoVolumeAssembly']);
  for (const key of keys) {
    if (GEO.has(key.fClassName)) {
      dbg(`Carregando: "${key.fName}" (${key.fClassName})`);
      const obj = await file.readObject(key.fName, key.fCycle);
      return { obj, key };
    }
  }
  return null;
}

// ═════════════════════════════════════════════════════════════════════════════
// HELPERS COMPARTILHADOS
// ═════════════════════════════════════════════════════════════════════════════

/** Escapa caracteres especiais XML */
const xmlEsc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function colorHex(idx, rootColors) {
  const c = rootColors?.[idx];
  if (!c) return '#888888';
  if (c.startsWith('#')) return c;
  const m = c.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) {
    const h = (n) => parseInt(n).toString(16).padStart(2, '0');
    return `#${h(m[1])}${h(m[2])}${h(m[3])}`;
  }
  return '#888888';
}

function volumeColorCss(volume, rootColors) {
  let hex = '#888888', opacity = 1.0;
  if (!volume) return { hex, opacity };

  if ((volume.fFillColor ?? 0) > 1)
    hex = colorHex(volume.fFillColor, rootColors);
  else if ((volume.fLineColor ?? -1) >= 0)
    hex = colorHex(volume.fLineColor, rootColors);

  const mat = volume.fMedium?.fMaterial;
  if (mat) {
    const fs = mat.fFillStyle ?? 0;
    if (fs >= 3000 && fs <= 3100)
      opacity = (100 - (fs - 3000)) / 100;
    if (hex === '#888888' && (mat.fFillColor ?? 0) >= 0)
      hex = colorHex(mat.fFillColor, rootColors);
  }
  return { hex, opacity: Math.max(0, Math.min(1, opacity)) };
}

function volumeColorThree(volume, rootColors) {
  const { hex, opacity } = volumeColorCss(volume, rootColors);
  return { color: new THREE.Color(hex), opacity };
}

function nodeToMatrix4(node) {
  const m = node?.fMatrix;
  if (!m) return null;

  let translation = null, rotation = null, scale = null;

  switch (m._typename) {
    case 'TGeoTranslation':
      translation = m.fTranslation;
      break;
    case 'TGeoRotation':
      rotation = m.fRotationMatrix;
      break;
    case 'TGeoScale':
      scale = m.fScale;
      break;
    case 'TGeoGenTrans':
      scale = m.fScale;
      /* falls through */
    case 'TGeoCombiTrans':
      translation = m.fTranslation;
      rotation    = m.fRotation?.fRotationMatrix;
      break;
    case 'TGeoHMatrix':
      translation = m.fTranslation;
      rotation    = m.fRotationMatrix;
      scale       = m.fScale;
      break;
    case 'TGeoIdentity':
    default:
      return null;
  }

  if (!translation && !rotation && !scale) return null;

  const mat4 = new THREE.Matrix4();

  if (rotation?.length === 9) {
    mat4.set(
      rotation[0], rotation[1], rotation[2], 0,
      rotation[3], rotation[4], rotation[5], 0,
      rotation[6], rotation[7], rotation[8], 0,
      0,           0,           0,           1
    );
  }
  if (translation?.length >= 3)
    mat4.setPosition(translation[0], translation[1], translation[2]);
  if (scale?.length >= 3)
    mat4.scale(new THREE.Vector3(scale[0], scale[1], scale[2]));

  return mat4;
}

// ═════════════════════════════════════════════════════════════════════════════
// HELPERS CGV
// ═════════════════════════════════════════════════════════════════════════════

function matrixXml(node, pad) {
  const m = node?.fMatrix;
  if (!m) return `${pad}<matrix type="TGeoIdentity"/>`;

  const typ = xmlEsc(m._typename ?? 'TGeoIdentity');
  let s = `${pad}<matrix type="${typ}"`;

  const t = m.fTranslation;
  if (t?.length >= 3)
    s += ` dx="${t[0]}" dy="${t[1]}" dz="${t[2]}"`;

  const rot = m.fRotationMatrix ?? m.fRotation?.fRotationMatrix;
  if (rot?.length === 9)
    s += ` rot="${rot.join(' ')}"`;

  const sc = m.fScale;
  if (sc?.length >= 3)
    s += ` sx="${sc[0]}" sy="${sc[1]}" sz="${sc[2]}"`;

  return s + '/>';
}

function shapeAttrs(shape) {
  if (!shape) return '';
  const t = shape._typename ?? '';
  let s = ` shape="${xmlEsc(t)}"`;
  switch (t) {
    case 'TGeoBBox':
      s += ` dx="${shape.fDX}" dy="${shape.fDY}" dz="${shape.fDZ}"`;
      break;
    case 'TGeoTube':
      s += ` rmin="${shape.fRmin}" rmax="${shape.fRmax}" dz="${shape.fDZ}"`;
      break;
    case 'TGeoTubeSeg':
      s += ` rmin="${shape.fRmin}" rmax="${shape.fRmax}" dz="${shape.fDZ}"` +
           ` phi1="${shape.fPhi1}" phi2="${shape.fPhi2}"`;
      break;
    case 'TGeoCone':
      s += ` rmin1="${shape.fRmin1}" rmax1="${shape.fRmax1}"` +
           ` rmin2="${shape.fRmin2}" rmax2="${shape.fRmax2}" dz="${shape.fDZ}"`;
      break;
    case 'TGeoConeSeg':
      s += ` rmin1="${shape.fRmin1}" rmax1="${shape.fRmax1}"` +
           ` rmin2="${shape.fRmin2}" rmax2="${shape.fRmax2}" dz="${shape.fDZ}"` +
           ` phi1="${shape.fPhi1}" phi2="${shape.fPhi2}"`;
      break;
    case 'TGeoSphere':
      s += ` rmin="${shape.fRmin}" rmax="${shape.fRmax}"` +
           ` theta1="${shape.fTheta1}" theta2="${shape.fTheta2}"`;
      break;
    case 'TGeoTorus':
      s += ` r="${shape.fR}" rmin="${shape.fRmin}" rmax="${shape.fRmax}"`;
      break;
    case 'TGeoPcon': case 'TGeoPgon':
      s += ` nz="${shape.fNz}" phi1="${shape.fPhi1}" dphi="${shape.fDphi}"`;
      break;
    case 'TGeoEltu':
      s += ` a="${shape.fA}" b="${shape.fB}" dz="${shape.fDZ}"`;
      break;
    case 'TGeoParaboloid':
      s += ` rlo="${shape.fRlo}" rhi="${shape.fRhi}" dz="${shape.fDZ}"`;
      break;
    case 'TGeoHype':
      s += ` rin="${shape.fRin}" rout="${shape.fRout}" dz="${shape.fDZ}"` +
           ` stin="${shape.fStIn}" stout="${shape.fStOut}"`;
      break;
    case 'TGeoTrd1':
      s += ` dx1="${shape.fDx1}" dx2="${shape.fDx2}"` +
           ` dy="${shape.fDy}" dz="${shape.fDZ}"`;
      break;
    case 'TGeoTrd2':
      s += ` dx1="${shape.fDx1}" dx2="${shape.fDx2}"` +
           ` dy1="${shape.fDy1}" dy2="${shape.fDy2}" dz="${shape.fDZ}"`;
      break;
    case 'TGeoArb8': case 'TGeoTrap': case 'TGeoGtra':
      s += ` dz="${shape.fDZ}"`;
      break;
    case 'TGeoXtru':
      s += ` nz="${shape.fNz}"`;
      break;
    case 'TGeoCompositeShape':
      s += ` boolOp="${xmlEsc(shape.fNode?._typename ?? '')}"`;
      break;
    case 'TGeoScaledShape':
      s += ` baseShape="${xmlEsc(shape.fShape?._typename ?? '')}"`;
      break;
    case 'TGeoTessellated':
      s += ` nFacets="${shape.fFacets?.length ?? 0}"`;
      break;
  }
  return s;
}

// ═════════════════════════════════════════════════════════════════════════════
// GERAÇÃO DO .CGV  — iterativo (sem recursão, sem risco de stack overflow)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Constrói o arquivo .cgv usando uma pilha explícita em vez de recursão.
 * Cada item da pilha é:
 *   { type:'node',  node, depth, path }  → processar nó e seus filhos
 *   { type:'close', tag }                → emitir tag de fechamento </node>
 */
function buildCgv(geoResult, allKeys, rootPath, opts) {
  const rootColors = getRootColors();
  const now        = new Date().toISOString();
  const srcName    = basename(rootPath);
  let   idCounter  = 0;

  // Usamos um array de chunks e depois join() uma única vez no final.
  // Evita o limite de argumentos do Function.apply que ocorre com ...spread.
  const chunks = [];

  chunks.push(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!--\n` +
    `  CGV — Compressed Geometry Vocabulary\n` +
    `  Gerado por root2scene.mjs\n` +
    `  Fonte  : ${xmlEsc(srcName)}\n` +
    `  Data   : ${now}\n` +
    `-->\n` +
    `<cgv version="1.0" source="${xmlEsc(srcName)}" generated="${now}">\n\n`
  );

  if (geoResult) {
    const { obj, key } = geoResult;

    const topNode = (obj._typename === 'TGeoManager')
      ? {
          _typename : 'TGeoManager',
          fName     : key.fName,
          fTitle    : key.fTitle ?? '',
          fVolume   : obj.fMasterVolume,
          fGeoAtt   : 0xFF,
          fMatrix   : null,
        }
      : obj;

    chunks.push(
      `  <!-- ==== Geometria: "${xmlEsc(key.fName)}" (${xmlEsc(key.fClassName)}) ==== -->\n` +
      `  <geometry name="${xmlEsc(key.fName)}" class="${xmlEsc(key.fClassName)}">\n`
    );

    // ── pilha explícita ───────────────────────────────────────────────────────
    // ATENÇÃO: empilhamos em ordem reversa para que o primeiro filho seja
    // processado primeiro (LIFO). O item 'close' é empilhado ANTES dos filhos
    // para que a tag de fechamento seja emitida DEPOIS de todos os filhos.
    const stack = [{ type: 'node', node: topNode, depth: 2, path: `/${key.fName}` }];

    while (stack.length > 0) {
      const item = stack.pop();

      // ── emitir fechamento ──────────────────────────────────────────────────
      if (item.type === 'close') {
        chunks.push(item.tag);
        continue;
      }

      const { node, depth, path } = item;
      const volume  = node.fVolume ?? node;
      const shape   = volume?.fShape ?? null;
      const id      = idCounter++;
      const pad     = '  '.repeat(depth);

      // ── visibilidade ────────────────────────────────────────────────────────
      const geoAtt  = node.fGeoAtt ?? volume?.fGeoAtt ?? 0xFF;
      const visible = Boolean(geoAtt & 0x08);
      if (opts.visibleOnly && !visible) continue;

      // ── atributos ───────────────────────────────────────────────────────────
      const name    = xmlEsc(node.fName    ?? volume?.fName  ?? '?');
      const title   = xmlEsc(node.fTitle   ?? volume?.fTitle ?? '');
      const nodeCls = xmlEsc(node._typename   ?? '');
      const volCls  = xmlEsc(volume?._typename ?? '');
      const { hex, opacity } = volumeColorCss(volume, rootColors);
      const matName  = xmlEsc(volume?.fMedium?.fName                ?? '');
      const matCls   = xmlEsc(volume?.fMedium?.fMaterial?._typename ?? '');
      const density  = volume?.fMedium?.fMaterial?.fDensity;

      let nfaces = 0;
      if (shape) { try { nfaces = numGeometryFaces(shape) ?? 0; } catch (_) {} }

      // ── emitir tag de abertura ───────────────────────────────────────────────
      chunks.push(
        `${pad}<node` +
        ` id="${id}"` +
        ` name="${name}"` +
        ` title="${title}"` +
        ` class="${nodeCls}"` +
        ` volClass="${volCls}"` +
        ` path="${xmlEsc(path)}"` +
        ` fillcolor="${hex}"` +
        ` opacity="${opacity.toFixed(4)}"` +
        ` visible="${visible}"` +
        ` material="${matName}"` +
        ` matClass="${matCls}"` +
        (density != null ? ` density="${density}"` : '') +
        ` nfaces="${nfaces}"` +
        shapeAttrs(shape) +
        `>\n` +
        matrixXml(node, pad + '  ') + `\n`
      );

      // ── empilhar fechamento (processado DEPOIS dos filhos) ──────────────────
      stack.push({ type: 'close', tag: `${pad}</node>\n` });

      // ── empilhar filhos em ordem reversa ────────────────────────────────────
      const children = volume?.fNodes?.arr ?? node.fElements?.arr ?? [];
      if (children.length > 0) {
        if (opts.maxDepth === 0 || depth < opts.maxDepth) {
          for (let i = children.length - 1; i >= 0; i--) {
            const child     = children[i];
            const childPath = `${path}/${xmlEsc(child.fName ?? '?')}`;
            stack.push({ type: 'node', node: child, depth: depth + 1, path: childPath });
          }
        } else {
          chunks.push(
            `${pad}  <!-- ${children.length} filho(s) omitido(s) — limite --depth ${opts.maxDepth} -->\n`
          );
        }
      }
    }

    chunks.push(`  </geometry>\n\n`);
  } else {
    chunks.push(`  <!-- Nenhum TGeoManager/TGeoVolume encontrado neste arquivo -->\n\n`);
  }

  // ── índice de chaves ────────────────────────────────────────────────────────
  chunks.push(`  <!-- ==== Índice de chaves (${allKeys.length} total) ==== -->\n`);
  chunks.push(`  <keys count="${allKeys.length}">\n`);
  for (const k of allKeys) {
    chunks.push(
      `    <key` +
      ` name="${xmlEsc(k.fName)}"` +
      ` title="${xmlEsc(k.fTitle)}"` +
      ` class="${xmlEsc(k.fClassName)}"` +
      ` cycle="${k.fCycle}"/>\n`
    );
  }
  chunks.push(`  </keys>\n\n</cgv>\n`);

  return chunks.join('');
}

// ═════════════════════════════════════════════════════════════════════════════
// GERAÇÃO DO .GLTF — iterativo
// ═════════════════════════════════════════════════════════════════════════════

class MaterialCache {
  #map = new Map();

  get(color, opacity) {
    const key = `${color.getHexString()}_${opacity.toFixed(3)}`;
    if (this.#map.has(key)) return this.#map.get(key);

    const mat = new THREE.MeshStandardMaterial({
      color,
      opacity,
      transparent : opacity < 1.0,
      roughness   : 0.55,
      metalness   : 0.05,
      side        : THREE.DoubleSide,
    });
    this.#map.set(key, mat);
    return mat;
  }
}

/**
 * Constrói a THREE.Scene de forma iterativa.
 * Pilha: { node, parentObj3d, depth }
 */
async function buildGltf(geoResult, rootPath, opts) {
  const rootColors = getRootColors();
  const matCache   = new MaterialCache();

  const scene = new THREE.Scene();
  scene.name  = basename(rootPath, extname(rootPath));

  if (geoResult) {
    const { obj, key } = geoResult;
    const topNode = (obj._typename === 'TGeoManager')
      ? {
          _typename : 'TGeoManager',
          fName     : key.fName,
          fTitle    : key.fTitle ?? '',
          fVolume   : obj.fMasterVolume,
          fGeoAtt   : 0xFF,
          fMatrix   : null,
        }
      : obj;

    info('Construindo grafo de cena Three.js...');

    const stack = [{ node: topNode, parentObj3d: scene, depth: 0 }];

    while (stack.length > 0) {
      const { node, parentObj3d, depth } = stack.pop();

      const volume  = node.fVolume ?? node;
      const name    = node.fName ?? volume?.fName ?? 'node';
      const shape   = volume?.fShape ?? null;

      const geoAtt  = node.fGeoAtt ?? volume?.fGeoAtt ?? 0xFF;
      const visible = Boolean(geoAtt & 0x08);
      if (opts.visibleOnly && !visible) continue;

      let bufGeo = null;
      if (shape) {
        try {
          bufGeo = createGeometry(shape, opts.maxFaces);
        } catch (e) {
          dbg(`createGeometry falhou "${name}" (${shape?._typename}): ${e.message}`);
        }
      }

      const { color, opacity } = volumeColorThree(volume, rootColors);
      const material = matCache.get(color, opacity);

      const obj3d = bufGeo
        ? new THREE.Mesh(bufGeo, material)
        : new THREE.Group();

      obj3d.name    = name;
      obj3d.visible = visible;

      const mat4 = nodeToMatrix4(node);
      if (mat4) {
        const pos  = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const scl  = new THREE.Vector3();
        mat4.decompose(pos, quat, scl);
        obj3d.position.copy(pos);
        obj3d.quaternion.copy(quat);
        obj3d.scale.copy(scl);
      }

      obj3d.userData = {
        rootNodeClass : node._typename     ?? '',
        rootVolClass  : volume?._typename  ?? '',
        rootShapeType : shape?._typename   ?? '',
        rootNFaces    : bufGeo
          ? Math.round((bufGeo.attributes.position?.count ?? 0) / 3)
          : 0,
      };

      parentObj3d.add(obj3d);

      const children = volume?.fNodes?.arr ?? node.fElements?.arr ?? [];
      if (children.length > 0 && (opts.maxDepth === 0 || depth < opts.maxDepth)) {
        // Reverso para manter a ordem original (LIFO)
        for (let i = children.length - 1; i >= 0; i--) {
          stack.push({ node: children[i], parentObj3d: obj3d, depth: depth + 1 });
        }
      }
    }
  }

  // ── estatísticas (iterativo — evita stack overflow em hierarquias profundas) ─
  let nMesh = 0, nVert = 0, nTri = 0;
  {
    const q = [scene];
    while (q.length > 0) {
      const o = q.pop();
      if (o.isMesh) {
        nMesh++;
        const pos = o.geometry?.attributes?.position;
        if (pos) { nVert += pos.count; nTri += Math.round(pos.count / 3); }
      }
      for (const child of o.children) q.push(child);
    }
  }
  info(`Cena: ${nMesh} mesh(es) · ${nVert.toLocaleString('pt-BR')} vértices · ${nTri.toLocaleString('pt-BR')} triângulos`);

  // Exporta como GLB binário — evita JSON.stringify em strings de centenas de MB.
  // Three.js lê .glb com GLTFLoader exatamente igual ao .gltf.
  const exporter = new GLTFExporter();
  const glbArrayBuffer = await exporter.parseAsync(scene, {
    binary      : true,   // ← GLB (binário), não GLTF JSON
    embedImages : false,
    onlyVisible : false,
  });

  return Buffer.from(glbArrayBuffer);
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════════════
async function main() {
  const opts = parseCliArgs();
  VERBOSE    = opts.verbose;

  log('root2scene');
  log(`  arquivo : ${opts.rootPath}`);
  log(`  saída   : ${opts.outDir}`);
  if (opts.maxFaces > 0) log(`  max-faces : ${opts.maxFaces}`);
  if (opts.maxDepth > 0) log(`  depth     : ${opts.maxDepth}`);

  mkdirSync(opts.outDir, { recursive: true });

  const stem    = basename(opts.rootPath, extname(opts.rootPath));
  const cgvPath = join(opts.outDir, `${stem}.cgv`);
  const glbPath = join(opts.outDir, `${stem}.glb`);

  // 1. Abre o .root
  const { file, keys } = await openRootFile(opts.rootPath);
  if (VERBOSE)
    for (const k of keys)
      dbg(`  ${k.fName.padEnd(32)} ${k.fClassName.padEnd(28)} cycle=${k.fCycle}`);

  // 2. Localiza TGeoManager / TGeoVolume
  const geoResult = await findGeoManager(file, keys);
  if (!geoResult)
    warn('Nenhum TGeoManager/TGeoVolume — saída terá conteúdo mínimo.');
  else
    ok(`Geo: "${geoResult.key.fName}" (${geoResult.key.fClassName})`);

  // 3. Gera .cgv
  if (!opts.noCgv) {
    info('Gerando .cgv...');
    const t0  = performance.now();
    const cgv = buildCgv(geoResult, keys, opts.rootPath, opts);
    await writeFile(cgvPath, cgv, 'utf8');
    ok(`CGV  → ${cgvPath}  (${(cgv.length / 1024).toFixed(1)} kB, ${(performance.now() - t0).toFixed(0)} ms)`);
  }

  // 4. Gera .glb
  if (!opts.noGltf) {
    info('Gerando .glb...');
    const t0  = performance.now();
    const glb = await buildGltf(geoResult, opts.rootPath, opts);
    await writeFile(glbPath, glb);
    ok(`GLB  → ${glbPath}  (${(glb.length / 1024).toFixed(1)} kB, ${(performance.now() - t0).toFixed(0)} ms)`);
  }

  log(`Concluído em ${((performance.now() - T0) / 1000).toFixed(2)}s`);
}

main().catch(err => { console.error(err); process.exit(1); });
