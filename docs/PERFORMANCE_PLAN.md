# Performance do CGV Web — Estudo, Diagnóstico e Implementação

> Documento consolidado para estudo. Cobre: o diagnóstico quantitativo (2026-06-10),
> a arquitetura de otimização implementada (2026-06-11), a matemática envolvida, as
> medições antes/depois, a suíte de smoke tests que protege tudo isso, e a trilha
> futura. Plano B (downscaling de resolução, NÃO implementado por decisão de projeto):
> ver `DOWNSCALING_PLAN.md`.

---

## Parte I — Diagnóstico (por que estava lento)

### I.1 Números medidos no asset

Medidos com `@gltf-transform/core` sobre `public/geometry_data/CaloGeometry.glb`:

| Métrica | Valor |
|---|---|
| Nós com mesh no GLB | **193.258** (184.356 células calo + 8.902 atlas/múon) |
| Geometrias únicas (acessores POSITION) | **13.697** |
| Vértices únicos / triângulos únicos | 155.726 / 237.300 |
| Triângulos **instanciados** (somados sobre todos os nós) | **2.413.152** |
| Vértices instanciados | 1.602.812 |

### I.2 Gargalos identificados (ranqueados)

**Por frame (GPU/driver) — explicava os ~25 fps em cena densa:**

| # | Gargalo | Evidência (código antigo) |
|---|---|---|
| G1 | **~13.700 draw calls**: o loader criava 1 `InstancedMesh` por (detector, geometria única). Custo de submissão de driver de 3–30 µs/draw ⇒ 40–200 ms/frame só de overhead | loader.js (1 IM por `geometry.uuid`) |
| G2 | Vertex work de células ocultas: o truque da matriz-zero + `frustumCulled=false` fazia **todas** as 184k células passarem pelo vertex shader em todo frame | `_ZERO_MAT4` em state.js |
| G3 | `MeshStandardMaterial` (PBR completo por fragmento) para caixas flat-shaded, com MSAA + DPR 2 | palette.js |
| G4 | Contorno preto por célula como LineSegments mundial reconstruído por interação; em show-all, milhões de vértices de linha | outlines.js antigo |
| G5 | `alpha:true` (compositing desnecessário — o fundo é opaco) + `preserveDrawingBuffer:true` (mata otimizações de swap) | renderer.js antigo |
| G6 | Câmaras de múon: até ~8.9k meshes individuais; em slicer show-all, ~3.5k draws | loader/trackAtlasIntersections antigos |

**Por interação (CPU) — explicava os <10 fps do slicer.** A cada `pointermove` do drag:

| # | Custo por movimento de mouse |
|---|---|
| G7 | Varredura CPU de **todas as 184k células** com `atan2`+fmod por célula (`_syncNonActiveShowAll` + `_applySlicerMask`) |
| G8 | Re-upload de TODOS os buffers `instanceMatrix` (~11,8 MB) + `instanceColor` (~2,2 MB) + recomputação de bounding sphere lendo as 184k matrizes de novo (`_flushIMDirty`) |
| G9 | `rebuildAllOutlines()`: realocação + re-upload de um Float32Array multi-MB de arestas |
| G10 | FCAL: `dispose()` + `new CylinderGeometry` + `new MeshStandardMaterial` + `new InstancedMesh` por tick |
| G11 | Passe de câmaras (show-all + teste de wedge por AABB de cada mesh) |
| G12 | Sem coalescing: tudo isso rodava por EVENTO de mouse (2–4×/frame em mouse de alta taxa) |

**O que já estava bom (e foi preservado):** render loop demand-driven com dirty flag e
pausa em aba oculta; parse de XML em Web Worker + WASM (Rust `opt-level=3`, LTO,
transfer zero-copy de `Int32Array`); paleta pré-alocada; raycast de hover com throttle
de 50 ms; minimap com binning cacheado.

---

## Parte II — Arquitetura implementada (2026-06-11)

Princípio geral: **eliminar trabalho, não acelerá-lo**. Os dois gargalos dominantes
não eram de linguagem nem de micro-otimização — eram de arquitetura (draw calls e
varreduras por movimento). Nada do que segue reduziu qualidade visual: mesmas paletas,
mesmos contornos, mesma iluminação difusa, mesmo MSAA/DPR.

### II.1 Mega mesh de células — `public/js/megaCells.js` (novo)

- As 184k células são **bakeadas em UMA geometria estática por detector** (TILE/LAR/HEC)
  no load: cada vértice da forma única é transformado pela matriz da célula uma única
  vez (as células nunca se movem). Resultado: **3 draw calls** para todo o calorímetro,
  para sempre, com buffers de vértice imutáveis.
- **Cor + visibilidade por célula** viram um texel RGBA8 numa `DataTexture`
  (1 célula = 1 texel; `aSlot` por vértice indexa o texel via `texelFetch` no vertex
  shader). Mudar threshold = escrever bytes + re-upload de ≤1 MB. Acabaram os 14 MB de
  matrizes por interação e o recompute de bounding sphere (G2, G8).
- **Centros por célula** numa segunda `DataTexture` RGBA32F — usados pelo teste do
  wedge no shader (semântica idêntica à antiga: a célula inteira some quando seu
  CENTRO está dentro da cunha).
- Célula culled colapsa no vertex shader (`gl_Position = vec4(2,2,2,1)` → triângulo
  degenerado fora do clip volume, zero custo de fragmento).
- **Material**: `MeshLambertMaterial` flat-shaded com um patch `onBeforeCompile`
  (fetch de cor/visibilidade/centro). Mesmas luzes da cena (ambiente + headlight),
  mesma resposta difusa do `MeshStandardMaterial` anterior, sem o custo PBR (G3).
  Tonemapping/colorspace idênticos (chunks padrão do three).
- **Picking próprio** (`pickCell`): o Raycaster do three não enxerga visibilidade por
  texel, então o raycast de células virou: varredura raio×esfera em arrays SoA
  (`cx,cy,cz,r` Float32Array — cache-friendly), pulando células invisíveis e
  carved-pelo-wedge (espelho CPU, §III.1), seguida do teste exato de triângulo apenas
  nos candidatos (geometria única compartilhada + `origMatrix`), nearest-first com
  early-exit. O handle de célula mudou de `{iMesh, instId}` para
  `{det, slot, mega, geo, origMatrix, center, radius, …}` (state.js).

### II.2 Slicer 100% GPU — `public/js/wedgeClip.js` (novo)

- A cunha (cilindro + faixa Z + setor angular) é descrita por ~10 floats em **uniforms
  compartilhados** (mesmos objetos `{value}` referenciados por todos os materiais que
  respeitam o corte: células, contornos, FCAL, câmaras, hover outlines).
- O teste angular usa **semiplanos** (sem `atan2`/fmod — derivação em §III.1); o
  espelho CPU (`insideWedge`) garante paridade exata entre o que a GPU desenha e o que
  picking/endpoints de partículas decidem.
- **Drag = atualizar uniforms + `markDirty()`**. Em `main.js`, o callback do slicer
  consulta `slicer.isDragging()`: durante o drag não roda NENHUMA varredura; no
  `pointerup` o slicer dispara o callback uma última vez com a flag baixa e o refresh
  pesado (visibility sweep, FCAL, câmaras, cinema) roda exatamente uma vez (G7–G12).
- Três injetores para materiais built-in (`onBeforeCompile`):
  `applyWedgeClipInstanced` (FCAL: culla instância pelo `instanceMatrix[3]`),
  `applyWedgeClipAttrCenter` (linhas com atributo `aCenter`),
  `applyWedgeClipWorld` (corte geométrico por fragmento, com contra-rotação
  `uWedgeRot` para compensar a rotação de cena que o slicer aplica).

### II.3 Contornos slot-driven — `public/js/outlines.js`

- O contorno preto de todas as células virou **um LineSegments mesclado por detector**
  cujos vértices carregam `aSlot` — o shader lê as MESMAS texturas de
  visibilidade/centro das células. Consequências: threshold esconde contorno junto com
  a célula sem CPU; o wedge corta contornos por célula exatamente como os corpos; e
  **drags nunca reconstroem o buffer** (G4, G9). A reconstrução só acontece quando o
  CONJUNTO de células visíveis muda (evento novo, toggle de detector) — mesma cadência
  visual de antes.
- Hover/pinned outlines (1 célula) continuam EdgesGeometry por célula, agora com clip
  de wedge por fragmento para nunca flutuarem dentro do corte.

### II.4 FCAL persistente — `public/js/visibility/fcalRenderer.js`

- Geometria do cilindro, material e `InstancedMesh` viram **singletons com capacidade
  crescente** (`count` ajusta o subconjunto desenhado); o buffer de contorno idem, com
  `setDrawRange`. Fim do dispose+realloc por tick (G10).
- O corte do slicer roda no shader (instância + linhas com `aCenter`); o filtro CPU do
  FCAL (que reconstrói a lista de instâncias) só roda em dragend/threshold.

### II.5 Câmaras de múon mescladas — `public/js/trackAtlasIntersections.js` (F5)

- Todas as ~milhares de câmaras-alvo são bakeadas em **UM mega mesh** (posições em
  coordenadas de cena, escala ×10 do atlas incluída) com `aSlot` por vértice e
  visibilidade por texel — espelhada de `mesh.visible` dentro do MESMO loop que já
  decidia a visibilidade por câmara. Em slicer show-all: **~3.5k draws → 1**.
- Os meshes individuais continuam na cena como **proxies de raycast** numa layer não
  renderizada (`CHAMBER_RAYCAST_LAYER = 1`; a câmera desenha só a layer 0; os dois
  raycasters que tocam câmaras — hover e track-hit — habilitam a layer 1). Isso
  preserva 100%: tooltip por câmara, outlines por estação, toggles por nó do painel.
- O corte do wedge nas câmaras é por fragmento (corte geométrico real, visualmente
  superior ao esconde-câmara-inteira-por-AABB anterior).
- Ghost-φ: as 192 linhas de segmentação viram 1 LineSegments (ghost.js).

### II.6 Renderer e captura — `renderer.js`, `renderLoop.js`, `screenshot.js`

- Contexto WebGL: `alpha:false` (fundo é opaco — compositing mais barato),
  `preserveDrawingBuffer:false` (swap otimizado), `precision:'highp'`
  (correção: coordenadas em mm até ±50.000 estouram `mediump` em GPUs mobile),
  `powerPreference:'high-performance'` (mantido — pede a GPU dedicada em híbridos).
- **Screenshots** renderizam num `WebGLRenderTarget` offscreen com **MSAA 4x** e
  textura sRGB → pixels idênticos aos da tela, canal alfa real para export
  transparente, e independência total do canvas (que pôde perder o
  preserveDrawingBuffer). O canvas nem é redimensionado mais durante o export.
- **HUD `?perf=1`** (renderLoop.js): FPS, draw calls, triângulos, frame-time CPU
  p50/p95 e DPR — as métricas de aceitação deste trabalho.

### II.7 Suíte de smoke tests — `tests/smoke/run.mjs` (novo, `npm run smoke`)

Dirige o app REAL (GLB real, WASM real, eventos reais) em Edge/Chrome headless
(SwiftShader) e protege os fluxos vitais + o **contrato de performance** (orçamentos de
draw calls por estado de cena). 14 passos: boot (≤60 draws), reload com cache OPFS,
carga de evento (≤450 draws), hover+tooltip de célula (picking novo), pin+Escape,
caixa de threshold, slicer on (show-all ≤700 draws), drag do gizmo, slicer off
(restauração), ghost toggle, minimap toggle, ciclo de cinema, **export de screenshot**
(valida o caminho RenderTarget; salva e mede o PNG) e resize. Erros de console viram
falha (com allowlist do 404 pré-existente de `assets/js/analytics.js`). Screenshots de
cada passo em `.smoke/` (gitignored).

---

## Parte III — Matemática

### III.1 Wedge por semiplanos (sem `atan2`)

O setor angular `[φ, φ+θ]` testado por célula era `atan2(dy,dx)` + 2 fmods. Com as
normais das bordas `a = (cos φ, sin φ)` e `b = (cos(φ+θ), sin(φ+θ))` pré-computadas
1× por mudança de máscara, e `cross(a,p) = a.x·p.y − a.y·p.x`:

```
θ ≤ π : dentro ⟺ cross(a,p) ≥ 0  E  cross(b,p) ≤ 0     (interseção de semiplanos)
θ > π : dentro ⟺ cross(a,p) ≥ 0  OU cross(b,p) ≤ 0     (união — complemento < π)
casos especiais: θ≈0 → nada dentro; θ≈2π → só teste radial+Z
```

4 multiplicações + 2 comparações por ponto; SIMD-friendly na CPU e 2 linhas de GLSL.
Implementado uma única vez (`wedgeClip.js`) e usado por GPU e CPU — paridade garantida.

### III.2 Bounding sphere estática (prova de correção)

O recompute O(N·instâncias) da esfera por visibilidade foi eliminado: como o conjunto
visível V ⊆ conjunto total T e as transformações são imutáveis,
`esfera(T) ⊇ esfera(V)` sempre — uma esfera computada 1× no load é válida para sempre
(conservadora: nunca exclui erradamente). No mega mesh ela é
`raio = max(|cᵢ| + rᵢ)` sobre os centros bakeados.

### III.3 Colapso de vértice como culling

`gl_Position = vec4(2,2,2,1)` para os 3 vértices de um triângulo culled produz um
triângulo degenerado (área zero) fora do volume de clip — rejeitado antes da
rasterização. Os vértices ainda passam pelo vertex shader (1,6M verts/frame), mas um
VS Lambert curto custa ~µs/milhão em GPUs reais; foi a troca aceita para manter UM
draw call estático por detector sem listas de indireção (ver §V.2 para o passo além).

### III.4 Texel como registrador de estado

Visibilidade/cor por célula numa textura é a forma mais barata de estado mutável por
instância no WebGL2: upload de ≤1 MB substitui re-upload de buffers de atributo de
14 MB, e o mesmo texel serve a N consumidores (corpo da célula E contorno), o que
elimina sincronização CPU entre eles.

---

## Parte IV — Medições

### IV.1 Antes (diagnóstico)

| Cenário | Medição |
|---|---|
| Cena densa (show-all) | ~25 fps; ~13.700 draw calls |
| Slicer drag | <10 fps; ~14 MB upload + varredura 184k + realloc de contornos POR movimento |
| Evento típico | 60 fps com hitches em sliders |

### IV.2 Depois (smoke em SwiftShader — GL por CPU, piso absoluto; GPUs reais ficam muito acima)

| Cenário | Medição |
|---|---|
| Boot (geometria carregada, evento nenhum) | **10 draw calls** |
| Evento carregado | **~127–136 draws @60 fps** (linhas de partículas são draws individuais por exigência de picking) |
| Slicer show-all | **134 draws** (células 3 + câmaras 1 + contornos 3 + partículas) |
| Slicer drag | uniforms apenas (~32 bytes); CPU p50 ~3 ms no harness |
| Laptop do usuário (GPU dedicada) | **60 fps cravado por vsync** em tudo; leve queda só no slicer show-all |

### IV.3 Sobre monitores de alta taxa (165 Hz)

O app não impõe teto de FPS: o loop é `requestAnimationFrame`, que segue a taxa de
atualização que o NAVEGADOR enxergar. "Cravado em 60" significa que o rAF está
chegando a 60 Hz — causas típicas, em ordem de probabilidade:

1. **Windows com o painel em 60 Hz**: Configurações → Sistema → Vídeo → Vídeo avançado
   → taxa de atualização = 165 Hz (painéis de 165 Hz vêm MUITO frequentemente em 60).
2. **Modo de eficiência do navegador** (Edge: Configurações → Sistema e desempenho)
   ou economia de bateria do Windows limitando rAF a 60.
3. Notebook híbrido com o navegador composto pela iGPU a 60 Hz mesmo com a dGPU
   renderizando (verificar `edge://gpu` / `chrome://gpu`).

Com o rAF destravado, o HUD `?perf=1` deve marcar ~165 FPS orbitando (o headroom de
GPU existe de sobra). Quando parado, o loop continua marcando a taxa do rAF, mas só
RENDERIZA quando algo muda (dirty flag) — fps alto ocioso não custa GPU.

### IV.4 iGPU e celulares — prognóstico

- O que matava placas fracas era exatamente o que foi removido: 13,7k draws (custo de
  DRIVER, CPU-bound — iGPUs sofrem em dobro porque dividem TDP com a CPU) e os uploads
  multi-MB por interação (banda compartilhada com a RAM na iGPU).
- O que resta por frame: ~1,6M vértices de VS curto (≈100M verts/s a 60 fps — Iris
  Xe/Vega/Adreno 6xx entregam isso com folga), fragment Lambert flat e o resolve do
  MSAA — este último é o item mais pesado em mobile (tile-based GPUs resolvem MSAA
  bem, mas DPR 2 + tela grande pesa).
- `highp` agora explícito corrige o risco real de artefatos de precisão em mobile.
- Expectativa honesta: desktop iGPU recente → 60 fps estável fora de show-all, 40–60
  em show-all; celulares recentes → 30–60; celulares antigos podem precisar do plano
  B (`DOWNSCALING_PLAN.md` — **só com aprovação explícita**, pois reduz nitidez
  durante interação).
- Custo único de boot que ainda pesa em celular: parse do GLB de 193k nós + bake do
  mega (ver F6 abaixo — é a próxima fronteira).

---

## Parte V — Trilha futura (não implementada)

### V.1 F6 — Pipeline de assets e startup (maior impacto restante)

- Reestruturar o GLB com `EXT_mesh_gpu_instancing` (gltf-transform `instance()` em
  `tools/setup/root2scene.mjs`): 193k nós → ~13,7k meshes + acessores de matrizes.
  O GLTFLoader deixa de materializar 193k `Object3D`/strings/`Matrix4.clone` no main
  thread; parse ~10–30× mais rápido; arquivo menor.
- Sidecar binário das chaves de célula (Int32Array paralelo, mesmo encoding de
  `_tileKey`/`_larEmKey`/`_hecKey`) — elimina 184k execuções de regex no load.
- `EXT_meshopt_compression` + quantização 14-bit por padrão no build.
- Meta: tempo-até-interativo ~1 s (sub-segundo com OPFS quente). Beneficia celulares
  acima de tudo.

### V.2 Vertex-cull verdadeiro (se algum hardware reclamar dos 1,6M verts)

Trocar o colapso de vértice por **multi-draw com lista de indireção**
(`WEBGL_multi_draw`, ranges por bloco de células visíveis) ou `BatchedMesh` do three
moderno (`setVisibleAt` remove do multidraw). Requer upgrade do three 0.162 → r17x
(BatchedMesh maduro: raycast por instância, `perObjectFrustumCulled`, `optimize()`).
O upgrade também destrava WebGPU estável (V.3).

### V.3 WebGPU + TSL + compute

Port do material de célula para TSL/NodeMaterial (roda em WebGL e WebGPU); compute
pass de visibilidade (threshold+cluster+região+wedge inteiros na GPU escrevendo o
buffer de indireção) — qualquer filtro vira O(0) de CPU. O `?renderer=webgpu` já
existe como opt-in, mas o caminho de células atual usa GLSL (`onBeforeCompile`) e NÃO
funciona no WebGPURenderer — tratar junto com o upgrade.

### V.4 GPU picking por ID

Render de IDs 1×1 sob o cursor com readback assíncrono (PBO+fence) → hover O(1)
independente de N; o throttle de 50 ms poderia cair para 16 ms. O picking SoA atual
já é O(células visíveis) e não aparece em profile — só vale com show-all + hover
intensivo.

### V.5 Rust/WASM (resposta à pergunta "traduzir para linguagem mais eficiente")

Os gargalos eliminados eram de arquitetura GPU/driver — JS→WASM dá 1,5–3× em loops
numéricos; GPU/eliminação deu 10–1000×. WASM continua valendo onde sobra CPU:
`parseHits` (~300 ms num XML de 47 MB, já async no worker — port para o crate Rust
existente), binning do heatmap, e a varredura de dragend com SIMD128
(`-C target-feature=+simd128`). Threads WASM exigiriam COOP/COEP no serve.py.

### V.6 Diversos

- Merge das linhas de partículas em buckets com picking por segmento (reduziria os
  ~120 draws de evento para ~10 — ganho pequeno, complexidade média).
- `OffscreenCanvas` + render em worker (consistência de p99, não fps médio).
- Chamber mega: reconstruir a textura por subtree quando `setAtlasRoot` muda (já
  tratado) e considerar baking dos OUTLINES de estação se algum dia forem todos
  visíveis ao mesmo tempo.

---

## Parte VI — Como medir / proteger

- **HUD**: `http://localhost:8080/?perf=1` → FPS, draws, tris, CPU p50/p95, DPR.
- **Suíte**: `npm run smoke` (Edge/Chrome instalado; screenshots em `.smoke/`).
  Orçamentos de draw calls estão no topo de `tests/smoke/run.mjs` (`BUDGET`).
- **Profiling fino**: Chrome DevTools Performance; Spector.js para inspecionar draw
  calls individuais; `EXT_disjoint_timer_query_webgl2` para tempo de GPU (não
  integrado ao HUD — candidato a melhoria).
- **Unit/lint/types**: `npm test` (160 testes), `npm run lint`, `npm run typecheck`.

## Apêndice A — Decisões e anti-padrões (não refazer)

- **Não** voltar a 1 Mesh/célula "para culling por objeto" — 184k objetos custam mais
  em traversal/draw que o pipeline atual.
- **Não** usar clipping planes nativos do three para o wedge (planos infinitos não
  expressam cilindro+setor; o teste custom é mais barato e exato).
- **Não** usar `THREE.LOD` por célula — o problema era contagem de draws, não tris.
- **Não** portar a orquestração de cena para WASM — a fronteira JS↔GPU é a mesma.
- O truque matriz-zero do InstancedMesh foi substituído, não removido por engano:
  visibilidade por texel é estritamente superior (1 byte vs 64 bytes por célula).
- `?renderer=webgpu` está incompatível com o material de células atual (GLSL) — não
  "consertar" sem o plano V.3.
- Pré-existente e fora de escopo: 404 de `assets/js/analytics.js` referenciado no
  index.html.

## Apêndice B — Mapa de arquivos da otimização

| Arquivo | Papel |
|---|---|
| `public/js/megaCells.js` | NOVO — mega mesh por detector, texturas cor/vis/centros, picking SoA |
| `public/js/wedgeClip.js` | NOVO — uniforms + GLSL do wedge, espelho CPU, injetores de material |
| `public/js/loader.js` | constrói megas a partir do GLB (antes: 13,7k InstancedMesh) |
| `public/js/state.js` | CellHandle novo `{det, slot, mega, geo, …}`; sem maquinaria de IM |
| `public/js/visibility.js` | sweep unificado (sem branch de slicer), flush de textura |
| `public/js/slicer.js` | máscara por semiplanos, `isDragging`, sync de uniforms |
| `public/js/outlines.js` | contornos mesclados slot-driven + clip; hover outline com clip world |
| `public/js/visibility/fcalRenderer.js` | recursos persistentes + clip instanciado |
| `public/js/trackAtlasIntersections.js` | chamber mega + layer de raycast + clip por fragmento |
| `public/js/particles/_internal.js` | endpoints usam center/radius do handle + filtro de wedge |
| `public/js/hoverTooltip.js` | células via `pickCell`; FCAL com checagem de wedge; layer 1 |
| `public/js/renderer.js` | alpha:false, sem preserveDrawingBuffer, highp |
| `public/js/renderLoop.js` | HUD `?perf=1` (draws/tris/p50/p95/DPR) |
| `public/js/screenshot.js` | export via WebGLRenderTarget MSAA 4x sRGB |
| `public/js/ghost.js` | linhas-φ mescladas em 1 LineSegments |
| `tests/smoke/run.mjs` | NOVO — suíte e2e com orçamentos de draw calls |
| `docs/DOWNSCALING_PLAN.md` | NOVO — plano B detalhado (não implementado) |
