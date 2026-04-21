#!/usr/bin/env node
/**
 * root2scene.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Converte um arquivo CERN .root em um arquivo:
 *
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
import { mkdirSync, unlinkSync }  from 'node:fs';
import { writeFile }             from 'node:fs/promises';
import { resolve, basename,
         extname, dirname, join } from 'node:path';
import { performance }            from 'node:perf_hooks';
import { parseArgs }              from 'node:util';
import { spawnSync }              from 'node:child_process';
import { fileURLToPath }          from 'node:url';
import { createGzip }             from 'node:zlib';
import { createReadStream, createWriteStream } from 'node:fs';

// ─── JSROOT ───────────────────────────────────────────────────────────────────
import { openFile }              from 'jsroot/io';
import { THREE }                 from 'jsroot/base3d';

// ─── GLB optimisation pipeline ────────────────────────────────────────────────
import { NodeIO }                from '@gltf-transform/core';
import { weld, dedup, prune,
         quantize as quantizeFn,
         mergeDocuments }         from '@gltf-transform/functions';

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
      subtree:        { type: 'string'  },   // prefixo dos filhos diretos do root a manter
      atlas:               { type: 'string'  },   // arquivo .root adicional (mesclado via subprocesso)
      'atlas-depth':       { type: 'string'  },   // --depth aplicado ao atlas.root (padrão: 5)
      'atlas-visible-only':{ type: 'boolean', default: true },  // visible-only para atlas (padrão: true)
      'visible-only':      { type: 'boolean', default: false },
      verbose:             { type: 'boolean', default: false },
      'tilecal-only':      { type: 'boolean', default: false },
      quantize:            { type: 'boolean', default: false },
      help:                { type: 'boolean', default: false },
    },
  });

  if (values.help || positionals.length === 0) {
    console.log(`
Uso: node root2scene.mjs <arquivo.root> [opções]

  --out <dir>              diretório de saída (padrão: mesmo dir do .root)
  --max-faces <n>          limite de faces por shape (0 = ilimitado)
  --depth <n>              profundidade máxima da árvore de geometria (0 = toda)
  --visible-only           pular volumes invisíveis (bit kVisThis)
  --tilecal-only           gerar apenas volumes TileCal (Tile1-15)
  --atlas <path>           arquivo .root adicional mesclado via subprocesso
  --atlas-depth <n>        --depth para o atlas.root (padrão: 5)
  --atlas-visible-only     (padrão true) aplicar visible-only ao atlas.root
  --quantize               quantizar posições (14-bit) — arquivo menor, visualmente idêntico
  --verbose                log detalhado
  --help                   esta mensagem
`);
    process.exit(0);
  }

  const rootPath = resolve(positionals[0]);
  return {
    rootPath,
    outDir:           values.out ? resolve(values.out) : dirname(rootPath),
    maxFaces:         parseInt(values['max-faces']   ?? '0', 10),
    maxDepth:         parseInt(values['depth']        ?? '0', 10),
    subtree:          values['subtree'] ?? null,
    atlasPath:        values['atlas'] ? resolve(values['atlas']) : null,
    atlasDepth:       parseInt(values['atlas-depth'] ?? '5', 10),
    atlasVisibleOnly: values['atlas-visible-only'] !== false,
    visibleOnly:      values['visible-only'],
    tilecalOnly:      values['tilecal-only'],
    quantize:         values['quantize'],
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
// SHAPE SIGNATURE — chave para deduplicação de geometrias no GLB
// ═════════════════════════════════════════════════════════════════════════════

const r4 = v => Math.round((+v) * 1e4) / 1e4;

function shapeSignature(shape) {
  if (!shape) return null;
  const t = shape._typename ?? '';
  switch (t) {
    case 'TGeoTrd1':
      return `Trd1_${r4(shape.fDx1)}_${r4(shape.fDx2)}_${r4(shape.fDy)}_${r4(shape.fDZ)}`;
    case 'TGeoTrd2':
      return `Trd2_${r4(shape.fDx1)}_${r4(shape.fDx2)}_${r4(shape.fDy1)}_${r4(shape.fDy2)}_${r4(shape.fDZ)}`;
    case 'TGeoBBox':
      return `BBox_${r4(shape.fDX)}_${r4(shape.fDY)}_${r4(shape.fDZ)}`;
    case 'TGeoTube':
      return `Tube_${r4(shape.fRmin)}_${r4(shape.fRmax)}_${r4(shape.fDZ)}`;
    case 'TGeoTubeSeg':
      return `TSeg_${r4(shape.fRmin)}_${r4(shape.fRmax)}_${r4(shape.fDZ)}_${r4(shape.fPhi1)}_${r4(shape.fPhi2)}`;
    case 'TGeoCone':
      return `Cone_${r4(shape.fRmin1)}_${r4(shape.fRmax1)}_${r4(shape.fRmin2)}_${r4(shape.fRmax2)}_${r4(shape.fDZ)}`;
    default:
      // Shapes complexas ou raras: sem compartilhamento (chave única)
      return `${t}_rnd_${Math.random()}`;
  }
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
// GERAÇÃO DO .CGV  — formato flat, um caminho por linha
//
//   name TAB → TAB name TAB → TAB … TAB → TAB leaf
//
// Separador: → (U+2192, implicação material da lógica proposicional)
// ═════════════════════════════════════════════════════════════════════════════
// ─── Walk a TGeo tree and add meshes to scene ─────────────────────────────────
// forceVisible=true ignores kVisThis bit (used for atlas.root)
function addGeoToScene(geoResult, scene, geoCache, dummyMat, opts, forceVisible = false) {
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

  const identity = new THREE.Matrix4();
  const stack    = [{ node: topNode, worldMat: identity, ancestorPath: '', depth: 0 }];
  let   nMesh = 0, nUniq = 0;

  while (stack.length > 0) {
    const { node, worldMat, ancestorPath, depth } = stack.pop();

    const volume  = node.fVolume ?? node;
    const shape   = volume?.fShape ?? null;
    const geoAtt  = node.fGeoAtt ?? volume?.fGeoAtt ?? 0xFF;
    const visible = Boolean(geoAtt & 0x08);
    if (!forceVisible && opts.visibleOnly && !visible) continue;

    const name    = node.fName ?? volume?.fName ?? '?';
    const path    = ancestorPath ? `${ancestorPath}→${name}` : name;

    const local   = nodeToMatrix4(node);
    const nodeMat = local ? worldMat.clone().multiply(local) : worldMat;

    if (shape) {
      const sig = shapeSignature(shape);

      let bufGeo = sig ? geoCache.get(sig) : null;
      if (!bufGeo) {
        try {
          bufGeo = createGeometry(shape, opts.maxFaces);
          if (bufGeo) {
            bufGeo.deleteAttribute('normal');
            bufGeo.deleteAttribute('uv');
          }
        } catch (e) {
          dbg(`createGeometry falhou "${name}" (${shape._typename}): ${e.message}`);
        }
        if (bufGeo && sig) { geoCache.set(sig, bufGeo); nUniq++; }
      }

      if (bufGeo) {
        const mesh = new THREE.Mesh(bufGeo, dummyMat);
        mesh.name  = path;

        const pos  = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const scl  = new THREE.Vector3(1, 1, 1);
        nodeMat.decompose(pos, quat, scl);
        mesh.position.copy(pos);
        mesh.quaternion.copy(quat);
        mesh.scale.copy(scl);

        scene.add(mesh);
        nMesh++;
      }
    }

    const children = volume?.fNodes?.arr ?? node.fElements?.arr ?? [];
    if (children.length > 0 && (opts.maxDepth === 0 || depth < opts.maxDepth)) {
      for (let i = children.length - 1; i >= 0; i--) {
        const child     = children[i];
        const childName = child.fName ?? child.fVolume?.fName ?? '';
        if (!forceVisible && opts.subtree && depth === 0 && !childName.startsWith(opts.subtree)) continue;
        if (!forceVisible && opts.tilecalOnly && depth === 0 && !/^Tile\d/.test(childName)) continue;
        stack.push({ node: child, worldMat: nodeMat, ancestorPath: path, depth: depth + 1 });
      }
    }
  }

  return { nMesh, nUniq };
}

// Serializa um único geoResult para um GLB Buffer (sem manter o Three.js scene na memória após retornar)
async function serializeGeoResult(geoResult, sceneName, opts, forceVisible) {
  const geoCache = new Map();
  const dummyMat = new THREE.MeshBasicMaterial({ color: 0x888888, side: THREE.DoubleSide });
  const scene    = new THREE.Scene();
  scene.name     = sceneName;

  const { nMesh, nUniq } = addGeoToScene(geoResult, scene, geoCache, dummyMat, opts, forceVisible);
  ok(`${sceneName}: ${nMesh} meshes · ${nUniq} geometrias únicas`);

  const exporter      = new GLTFExporter();
  const glbArrayBuffer = await exporter.parseAsync(scene, {
    binary      : true,
    embedImages : false,
    onlyVisible : false,
  });

  // Libera os objetos Three.js explicitamente antes de retornar
  for (const child of scene.children) {
    if (child.geometry) child.geometry.dispose();
  }
  dummyMat.dispose();

  return Buffer.from(glbArrayBuffer);
}

async function buildGltf(geoResult, atlasResult, rootPath, opts) {
  const stem = basename(rootPath, extname(rootPath));

  // Processa o arquivo principal
  let primaryBuf = null;
  if (geoResult) {
    info('Construindo meshes do arquivo principal...');
    primaryBuf = await serializeGeoResult(geoResult, stem, opts, false);
    info(`Principal serializado: ${(primaryBuf.length / 1e6).toFixed(1)} MB`);
  }

  // Processa atlas.root em passo separado (Three.js scene anterior já liberada)
  let atlasBuf = null;
  if (atlasResult) {
    info('Construindo meshes do atlas.root (todas forçadas visíveis)...');
    atlasBuf = await serializeGeoResult(atlasResult, 'atlas', opts, true);
    info(`Atlas serializado: ${(atlasBuf.length / 1e6).toFixed(1)} MB`);
  }

  // Sem atlas: retorna direto
  if (!atlasBuf) return primaryBuf ?? Buffer.alloc(0);

  // Mescla os dois documentos gltf-transform
  info('Mesclando documentos GLB...');
  const io          = new NodeIO();
  const primaryDoc  = await io.readBinary(new Uint8Array(primaryBuf));
  const atlasDoc    = await io.readBinary(new Uint8Array(atlasBuf));

  mergeDocuments(primaryDoc, atlasDoc);

  return Buffer.from(await io.writeBinary(primaryDoc));
}

// ═════════════════════════════════════════════════════════════════════════════
// GLB OPTIMISATION — weld · dedup · prune · (optional quantize)
// Runs entirely in memory: no intermediate file written.
// ═════════════════════════════════════════════════════════════════════════════
async function optimizeGlb(glbBuf, opts) {
  const io  = new NodeIO();
  const doc = await io.readBinary(new Uint8Array(glbBuf));

  // Strip any leftover NORMAL / TEXCOORD / TANGENT / COLOR attributes and materials
  let stripped = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      for (const sem of ['NORMAL', 'TEXCOORD_0', 'TEXCOORD_1', 'TANGENT', 'COLOR_0']) {
        if (prim.getAttribute(sem)) { prim.setAttribute(sem, null); stripped++; }
      }
      prim.setMaterial(null);
    }
  }
  for (const m of doc.getRoot().listMaterials()) m.dispose();
  if (stripped) dbg(`optimizeGlb: stripped ${stripped} unused vertex attributes`);

  const transforms = [weld(), dedup(), prune()];
  if (opts.quantize) {
    info('Quantizando posições (14-bit)…');
    transforms.push(quantizeFn({ quantizePosition: 14 }));
  }
  await doc.transform(...transforms);

  return Buffer.from(await io.writeBinary(doc));
}

// ─── gzip helper ──────────────────────────────────────────────────────────────
function gzipFile(src, dest) {
  return new Promise((resolve, reject) => {
    const gz = createGzip({ level: 9 });
    const rd  = createReadStream(src);
    const wr  = createWriteStream(dest);
    rd.pipe(gz).pipe(wr);
    wr.on('finish', resolve);
    wr.on('error', reject);
    rd.on('error', reject);
  });
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
  if (opts.atlasPath) log(`  atlas   : ${opts.atlasPath}  (depth=${opts.atlasDepth})`);
  if (opts.maxFaces > 0) log(`  max-faces : ${opts.maxFaces}`);
  if (opts.maxDepth > 0) log(`  depth     : ${opts.maxDepth}`);

  mkdirSync(opts.outDir, { recursive: true });
  const stem    = basename(opts.rootPath, extname(opts.rootPath));
  const glbPath = join(opts.outDir, `${stem}.glb`);
  const gzPath  = `${glbPath}.gz`;

  const scriptPath = fileURLToPath(import.meta.url);

  // ── PASSO 1: subprocesso para atlas.root (memória isolada) ────────────────
  let atlasTmpGlb = null;
  if (opts.atlasPath) {
    atlasTmpGlb = join(opts.outDir, `_atlas_tmp_${Date.now()}.glb`);
    const atlasArgs = [
      '--max-old-space-size=4096', scriptPath,
      opts.atlasPath,
      '--out', opts.outDir,
      '--depth', String(opts.atlasDepth),
    ];
    if (opts.atlasVisibleOnly) atlasArgs.push('--visible-only');
    if (opts.verbose)          atlasArgs.push('--verbose');

    info(`Gerando atlas GLB via subprocesso (depth=${opts.atlasDepth})...`);
    // Redireciona stdout do filho para o stdout do pai com prefixo [atlas]
    const child = spawnSync(process.execPath, atlasArgs, {
      stdio: ['ignore', 'inherit', 'inherit'],
      env:   process.env,
    });
    if (child.status !== 0) die(`Subprocesso atlas falhou (exit ${child.status})`);

    // O subprocesso escreve <stem>.glb no outDir
    const atlasStem = basename(opts.atlasPath, extname(opts.atlasPath));
    const atlasOut  = join(opts.outDir, `${atlasStem}.glb`);
    // Renomeia para nome temporário para não conflitar com saída final
    try {
      const { renameSync } = await import('node:fs');
      renameSync(atlasOut, atlasTmpGlb);
    } catch {
      atlasTmpGlb = atlasOut; // se já tiver o nome certo (atlas.root → atlas.glb ≠ CaloGeometry.glb)
    }
    ok(`Atlas GLB pronto: ${atlasTmpGlb}`);
  }

  // ── PASSO 2: arquivo principal ─────────────────────────────────────────────
  const { file, keys } = await openRootFile(opts.rootPath);
  if (VERBOSE)
    for (const k of keys)
      dbg(`  ${k.fName.padEnd(32)} ${k.fClassName.padEnd(28)} cycle=${k.fCycle}`);

  const geoResult = await findGeoManager(file, keys);
  if (!geoResult)
    warn('Nenhum TGeoManager/TGeoVolume no arquivo principal — saída terá conteúdo mínimo.');
  else
    ok(`Geo principal: "${geoResult.key.fName}" (${geoResult.key.fClassName})`);

  info('Construindo GLB do arquivo principal...');
  const t0  = performance.now();
  let glb   = await buildGltf(geoResult, null, opts.rootPath, opts);

  // ── PASSO 3: mescla atlas.glb se gerado ────────────────────────────────────
  if (atlasTmpGlb) {
    info('Mesclando atlas GLB...');
    const { readFileSync } = await import('node:fs');
    const io         = new NodeIO();
    const primaryDoc = await io.readBinary(new Uint8Array(glb));
    const atlasDoc   = await io.readBinary(new Uint8Array(readFileSync(atlasTmpGlb)));
    mergeDocuments(primaryDoc, atlasDoc);

    // mergeDocuments cria uma Scene separada para cada documento.
    // Three.js só carrega a Scene 0 (defaultScene), então precisamos mover
    // todos os nós raiz das scenes extras para a Scene 0.
    const root    = primaryDoc.getRoot();
    const scenes  = root.listScenes();
    if (scenes.length > 1) {
      const primaryScene = scenes[0];
      for (let i = 1; i < scenes.length; i++) {
        for (const node of scenes[i].listChildren()) {
          primaryScene.addChild(node);
        }
        scenes[i].dispose();
      }
      dbg(`Cenas mescladas: ${scenes.length} → 1`);
    }

    // GLB binary exige exatamente 1 buffer — consolida todos os accessors no primeiro
    const buffers = root.listBuffers();
    if (buffers.length > 1) {
      const mainBuf = buffers[0];
      for (const acc of root.listAccessors()) acc.setBuffer(mainBuf);
      await primaryDoc.transform(prune());
    }

    glb = Buffer.from(await io.writeBinary(primaryDoc));
    info(`GLB mesclado: ${(glb.length / 1e6).toFixed(1)} MB`);

    // Remove temporário se for diferente de atlas.glb permanente
    const atlasStem = basename(opts.atlasPath, extname(opts.atlasPath));
    const atlasPermPath = join(opts.outDir, `${atlasStem}.glb`);
    if (atlasTmpGlb !== atlasPermPath) {
      try { unlinkSync(atlasTmpGlb); } catch { /* ignora */ }
    }
  }

  // ── PASSO 4: optimiza e escreve ────────────────────────────────────────────
  const rawMb = (glb.length / 1e6).toFixed(1);
  info(`GLB bruto: ${rawMb} MB - otimizando...`);
  glb = await optimizeGlb(glb, opts);
  await writeFile(glbPath, glb);
  ok(`GLB  -> ${glbPath}  (${(glb.length / 1e6).toFixed(1)} MB, ${(performance.now() - t0).toFixed(0)} ms)`);

  // ── PASSO 5: gzip ──────────────────────────────────────────────────────────
  info('Gerando .glb.gz...');
  await gzipFile(glbPath, gzPath);
  const { statSync } = await import('node:fs');
  ok(`GZ   -> ${gzPath}  (${(statSync(gzPath).size / 1e6).toFixed(1)} MB)`);

  log(`Concluído em ${((performance.now() - T0) / 1000).toFixed(2)}s`);
}

main().catch(err => { console.error(err); process.exit(1); });
