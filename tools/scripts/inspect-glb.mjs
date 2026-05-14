#!/usr/bin/env node
/**
 * inspect-glb.mjs — lista todos os nós/meshes do CaloGeometry.glb
 * Uso: node tools/scripts/inspect-glb.mjs public/geometry_data/CaloGeometry.glb
 */
import { NodeIO } from '@gltf-transform/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const glbPath = resolve(process.argv[2] ?? 'public/geometry_data/CaloGeometry.glb');
const io = new NodeIO();
const doc = await io.read(glbPath);
const root = doc.getRoot();

const scenes = root.listScenes();
console.log(`\nCenas: ${scenes.length}`);

let totalNodes = 0;
let totalMeshes = 0;

const nameCounts = new Map();

function walkNode(node, depth = 0) {
  const name = node.getName();
  totalNodes++;

  const mesh = node.getMesh();
  if (mesh) totalMeshes++;

  // Conta prefixos para identificar padrões
  const parts = name.split('→');
  for (let i = 1; i <= Math.min(parts.length, 4); i++) {
    const key = parts.slice(0, i).join('→');
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }

  if (depth < 2) {
    const indent = '  '.repeat(depth);
    console.log(`${indent}[${depth}] "${name}"${mesh ? ' [MESH]' : ''}`);
  }

  for (const child of node.listChildren()) {
    walkNode(child, depth + 1);
  }
}

for (const scene of scenes) {
  console.log(`\nScene: "${scene.getName()}"`);
  for (const node of scene.listChildren()) {
    walkNode(node, 0);
  }
}

console.log(`\nTotal nós: ${totalNodes}`);
console.log(`Total meshes: ${totalMeshes}`);

// Mostra os 50 prefixos mais frequentes
const sorted = [...nameCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60);
console.log('\nPrefixos mais frequentes:');
for (const [key, count] of sorted) {
  console.log(`  ${count.toString().padStart(5)}x  "${key}"`);
}

// Lista todos os nomes únicos de nós que são meshes
const meshNames = [];
function collectMeshNames(node) {
  if (node.getMesh()) meshNames.push(node.getName());
  for (const child of node.listChildren()) collectMeshNames(child);
}
for (const scene of scenes) {
  for (const node of scene.listChildren()) collectMeshNames(node);
}

console.log(`\nPrimeiros 20 nomes de mesh:`);
for (const n of meshNames.slice(0, 20)) console.log(`  "${n}"`);
console.log(`Últimos 10 nomes de mesh:`);
for (const n of meshNames.slice(-10)) console.log(`  "${n}"`);
