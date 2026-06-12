# CGV Web — Plano de Transformação Visual

Estudo completo do estado atual do rendering e da representação dos objetos de
física, com duas listas priorizadas de melhorias:

- **Lista 1 (Parte II)** — qualidade de *rendering* (iluminação, materiais,
  pós-processamento, antialiasing).
- **Lista 2 (Parte III)** — representação da *informação* (como tracks, jets,
  clusters, MET, vértices, hits, minimap, slicer, ghost e cinema comunicam a
  física).

Critério das propostas: **artístico + fisicamente correto + informativo**, nesta
ordem de desempate: nunca sacrificar a leitura física por estética.

Trabalho a ser feito na branch `visual-quality-lab`, validado contra os budgets
do smoke test (`tests/smoke/run.mjs`) e o HUD `?perf=1` antes de qualquer merge.

---

## Parte I — Raio-X do estado atual

### I.1 Rendering

| Aspecto | Hoje | Arquivo |
|---|---|---|
| Renderer | WebGL2, `antialias:true` (MSAA), sRGB, DPR≤2, `sortObjects:false` | `public/js/renderer.js` |
| Tone mapping | Nenhum (`NoToneMapping` default) | — |
| Luzes | Ambient 2.0 + Directional 2.0 **seguindo a câmera** (headlight) | `renderer.js:89-98` |
| Material das células | `MeshLambertMaterial` flat, patch `onBeforeCompile` (cor por célula via DataTexture, slicer via uniforms) | `megaCells.js:67-110` |
| Sombras / IBL / fog / pós-processamento | Nenhum | — |
| Fundo | Cor sólida `0x020d1c` | `renderer.js:73` |
| Render loop | On-demand (dirty flag) — **GPU ociosa quando nada muda** | `renderLoop.js` |
| Budgets (smoke test) | boot ≤60 draws, evento ≤450, slicer ≤700; medidos 10/134/134 | `tests/smoke/run.mjs` |

### I.2 Representação dos objetos de física

| Objeto | Hoje | Fidelidade física | Lacuna principal |
|---|---|---|---|
| **Tracks** | `THREE.Line` polyline, `linewidth:2` (**ignorado → 1px**), 6 cores chapadas por matching | Boa: a polyline vem do fit ATLAS (curvatura embutida nos pontos) | pT só no slider; nada visual codifica momento |
| **Fótons** | Hélice "mola" (R=20mm, taper) terminando na 1ª célula visível | Boa convenção (linha ondulada de Feynman) | Estática; 1px |
| **Elétrons/Múons/Taus** | Sprites de texto (e⁻/e⁺/μ/τ) ancorados na track | ok | Sprites canvas simples |
| **Jets** | **Uma linha tracejada η/φ** laranja, da face do calo ao cilindro externo | **Fraca**: jet é um cone de raio ΔR (anti-kt R=0.4); ET parseado mas não codificado visualmente | Sem cone, sem ET, sem massa |
| **Clusters** | Idem (linha tracejada vermelha), milhares por evento | ok geométrico, ruim perceptual | Floresta de linhas = ruído visual |
| **MET** | Seta rosa 50mm/GeV (clamp 0.4–6m) + rótulo "ν" | Magnitude ok; **"ν" é interpretação**, não medida | Convenção: invisíveis = tracejado; só EMPFlow mostrado |
| **Vértices** | Esferas: primário branco, pile-up azul, secundário verde | ok | **b-tag sem linha de voo primário→secundário** (a física do b-tagging É a distância de voo) |
| **Hits** | Esferas brancas 2px no hover da track | ok | SCT: endpoints parseados, **só o ponto médio desenhado**; sem cor por subdetector |
| **Minimap** | Heatmap η×φ Canvas 2D, rampa única 5-stops log, retângulos-gate, φ-seam, zoom | Boa | Sem jets/MET/câmera plotados; clique não navega |
| **Slicer** | Gizmo: 3 setas RGB + esfera; corte GPU por uniforms | — | Corte "seco": sem indicação visual da superfície cortada; sem readout de ângulos |
| **Ghost** | Envelopes TileCal opacity 0.01 + 64 linhas φ opacity 0.06 | — | Quase invisível; sem labels de subdetector |
| **Cinema** | Órbita POI 75s + mergulho pelo feixe, roll, FOV boost | — | Sem efeitos de apresentação (fade, lower-third, glow) |

### I.3 Dados parseados e NÃO visualizados (oportunidades grátis)

| Dado | Onde está | Uso possível |
|---|---|---|
| Jet: `cells` (constituintes), `mass`, `et` | `jetParser.js` | Realçar células do jet no hover; ET → intensidade do cone |
| Tau: `logLhRatio`, `isolFrac`, `numTracks` | `tauParser.js` | Tooltip; opacidade por qualidade do ID |
| SCT: endpoints (x0,y0,z0)-(x1,y1,z1) | `hitsParser.js` | Desenhar o strip real (~6cm), não o ponto médio |
| MET: coleções alternativas (EMTopo, Calo) | `metParser.js` | Setas secundárias fantasma (comparação) |
| Vértices: posição 3D de secundários | `vertexParser.js` | Linha de voo b-tag |
| Cluster: `cells` | WASM parser | Pulso de realce nas células do cluster no hover |

**Nota (ticket #14110, nota #16):** o Nikiforos pediu *cell time / cluster
time* no clique. **Esses campos não existem no JiveXML atual** — não é uma
lacuna do CGV, é do dado. Responder no ticket que depende de incluir os campos
na produção do XML; quando existirem, o tooltip já tem onde mostrá-los.

### I.4 Restrições de projeto (invioláveis)

1. **P1**: Firefox / Alma 9, possivelmente iGPU, 1600×900. Só WebGL2 (WebGPU
   fora: Firefox/Linux imaturo + material das células é GLSL).
2. **Cor = física**: a rampa energia→cor é dado. Tone mapping/bloom não podem
   alterar a leitura da legenda sem toggle explícito.
3. **Render on-demand**: o loop só desenha quando algo muda (GPU ociosa no
   idle). **Qualquer animação contínua (dash scroll, pulsos) quebra isso** —
   animações devem ser restritas ao cinema mode ou a interações (hover/drag),
   nunca permanentes no idle.
4. **Budgets de draw calls** do smoke test continuam valendo; novos passes de
   pós-processamento entram com budget próprio medido.
5. **3 draw calls das células são sagrados**: melhorias de material entram
   *dentro* do patch `onBeforeCompile` existente, nunca quebrando o mega-mesh.

---

## Parte II — Lista 1: qualidade de rendering

### Mais interessantes (ordem recomendada de implementação)

| # | Proposta | Ganho | Custo perf | Esforço | Risco |
|---|---|---|---|---|---|
| A8 | **Presets de qualidade** (Low/Standard/Beauty, localStorage, auto-fallback por p95) — fazer PRIMEIRO: é o guarda-chuva de tudo | habilita o resto | 0 | M | baixo |
| A1 | **Fat lines (Line2)** para tracks/jets/clusters — hoje tudo é 1px | enorme | baixo | M | baixo |
| A3 | **Rim light (Fresnel) + especular** no shader das células (ou matcap 256²) — volume sem PBR | alto | ~0 | S/M | baixo |
| A6 | **Fog sutil + fundo gradiente** (depth cueing de um detector de 50m) | médio | ~0 | S | baixo |
| A4 | **Tone mapping AgX/ACES + exposure** como toggle "presentation" (default off na P1; validar rampa e divergência com a minimap, que é Canvas 2D e não passa pelo tone mapping) | alto | 0 | S | médio (semântica de cor) |
| A2 | **Bloom seletivo** nos depósitos quentes (EffectComposer + render target MSAA `samples:4`; passe emissive-only reutilizando os mega-meshes com material override) | "uau" | médio | M/L | médio |
| A5 | **Estrutura ATLAS holograma** (fresnel nas bordas) + IBL leve (RoomEnvironment/PMREM) no FCAL e ghosts | médio | baixo | M | baixo |
| A7 | **AO (GTAO/N8AO half-res)** — experimento; pode ser o limite do iGPU | alto | alto-médio | M | médio |

### Menos interessantes / rejeitadas

| Ideia | Veredito | Motivo |
|---|---|---|
| Shadow maps | não | Sem chão/oclusores naturais; re-renderizar 2,4M triângulos por luz; AO entrega o mesmo por menos |
| Raytracing interativo | inviável | WebGL não tem RT; WebGPU-RT inexistente no Firefox da P1. Variante aceitável: modo "publication render" offline (three-gpu-pathtracer) só para exportar screenshots |
| Texturas nas células | não agrega | Células não têm UVs e são *dados*; shading (A3) é o caminho certo |
| SSR | não | Caro, ruidoso, cena difusa; envMap (A5) dá 80% por 5% do custo |
| TAA | conflita | Render on-demand não tem histórico de frames; MSAA+SMAA cobrem |
| Point lights dinâmicas espalhadas | baixo ganho | Gradientes de luz confundem cor-como-energia; exceção pontual: flash no vértice durante o cinema |
| Port WebGPU/TSL | estratégico, não estético | Já documentado no PERFORMANCE_PLAN §V.3 |

---

## Parte III — Lista 2: representação da informação

### Mais interessantes

**B1. Jets como cones translúcidos de ΔR real** — *a maior correção física da lista*
Substituir a linha tracejada por um cone com vértice na origem, eixo em (η,φ) e
abertura correspondente a ΔR=0.4 na face do calo, comprimento até o cilindro
externo. Material fresnel translúcido (forte na borda, quase nada no miolo —
"feixe de holofote"), intensidade/opacidade ∝ ET. No hover: realçar as células
constituintes (lista `cells` já parseada). A linha atual vira o eixo do cone.
*Por que é correto:* um jet anti-kt **é** um cone de raio R no espaço η/φ; é
assim que Atlantis/VP1 o desenham. Custo: ~1 cone de 24 segmentos por jet
(dezenas de triângulos), desprezível. Esforço: M.

**B2. "Replay da colisão" no cinema mode** — *frente de onda esférica à velocidade da luz*
Animação de apresentação: uma casca esférica parte do vértice primário e as
células se acendem quando a frente (r = c·t, desacelerada ~10⁹× para leitura
humana) as cruza — implementável como um uniform `uWaveR` no shader existente
das células (comparar com `uCenterTex`, que já tem o centro de cada célula).
Fisicamente motivado (partículas ~c), zero dados novos, e é o momento "uau" de
qualquer demonstração. Restrito ao cinema/botão replay (restrição I.4.3).
Esforço: M. Custo perf: ~zero (1 uniform + 1 comparação por vértice).

**B3. Vértices com física visível**
- **Linha de voo b-tag**: segmento primário→secundário (dados já parseados) com
  seta curta; é literalmente a assinatura do quark b (L_xy ~ mm).
- **Pile-up como colar de contas na beamline**: pontos discretos ao longo de z
  (a distribuição em z dos vértices de pile-up É a luminosidade do bunch).
- Primário com flare/starburst sutil (sprite aditivo).
Esforço: S/M. Custo: desprezível.

**B4. Minimap 2.0 — de heatmap a "radar" do evento**
- **Jets plotados como círculos de raio R** (no plano η/φ um jet é exatamente
  um círculo — representação perfeita e exata).
- **MET como marcador/cunha em φ** na borda (MET não tem η — uma seta no eixo φ
  é a representação honesta).
- **Indicador do campo de visão da câmera 3D** (η/φ do eixo de visão).
- **Duplo-clique navega**: aponta a câmera 3D para aquele (η,φ).
- Marcador dos retângulos-gate ativos já existe; adicionar contagem de células
  dentro de cada um.
Esforço: M (tudo Canvas 2D, sem custo de GPU).

**B5. Clusters: de floresta de linhas a glifos**
Milhares de linhas tracejadas viram: um marcador "splash" (disco fresnel
pequeno) na face do calo, escala ∝ ET, com a linha completa aparecendo só no
hover/seleção. Reduz ruído visual e draw calls, e ET passa a ser visível.
No hover, pulso de realce nas células do cluster (lista `cells` já existe).
Esforço: M.

**B6. MET honesto e bonito**
- Trocar o rótulo "ν" por "ET^miss" (ν é uma interpretação; ET^miss é a medida).
- Seta **tracejada** (convenção universal para invisíveis), com marching dashes
  animados **apenas durante interação/cinema**.
- Opcional: arco no plano transverso indicando a incerteza em φ se um dia o
  XML trouxer; setas-fantasma das coleções alternativas (EMTopo/Calo) num
  toggle de expert.
Esforço: S.

**B7. Hits com identidade**
- SCT: desenhar o **strip real** (segmento entre os endpoints já parseados).
- Cor por subdetector (Pixel/SCT/TRT/câmaras de múon), com mini-legenda no
  tooltip.
- Modo persistente no nível 1 (Hits) — hoje os hits só existem no hover.
Esforço: S/M.

**B8. Slicer com superfície de corte**
- Rim glow nas células na borda do corte (o shader já sabe a distância ao
  plano da cunha — é 1 smoothstep a mais): efeito "metal cortado".
- Leque translúcido das duas paredes da cunha visível durante o drag.
- HUD numérico durante o drag: φ₁, φ₂, abertura em graus, Z-range.
Esforço: M.

**B9. Ghost/estrutura como blueprint**
- Shader holograma fresnel (bordas mais opacas) no lugar de opacity 0.01.
- Linhas η além das 64 linhas φ.
- Labels 3D discretos dos subdetectores (LAr barrel, Tile EB±, HEC, FCAL) num
  toggle — valor educacional para shifters novos.
Esforço: M.

**B10. Tooltip/pinned cards completos**
- Adicionar campos parseados e não mostrados: tau `logLhRatio`/`isolFrac`/
  `numTracks`, jet `mass`, contagem de células do cluster.
- Responder à nota #16 do ticket: onlineID já aparece; cell/cluster time
  dependem do dado existir no XML (ver I.3).
Esforço: S.

### Menos interessantes / adiadas

| Ideia | Veredito | Motivo |
|---|---|---|
| Lego plot 3D (histograma η/φ extrudado) | adiar | Feature inteira de visualização alternativa; grande esforço, público restrito — discutir com Nikiforos/Oleg antes |
| Animações permanentes (dash scroll em todas as linhas, pulsos idle) | não | Quebra o render on-demand (I.4.3) — GPU deixaria de ficar ociosa; animar só em cinema/interação |
| Recalcular curvatura de track por B-field | desnecessário | A polyline do fit ATLAS já embute a curvatura; redundância com risco de divergir do fit |
| Playback temporal real do evento | bloqueado por dado | Cell time não existe no JiveXML (I.3); B2 (frente de luz) entrega a narrativa sem precisar do dado |
| Exibir conversões de fótons, shower shapes | bloqueado por dado | Campos não existem nos blocos XML atuais |
| Esferas de hit maiores/persistentes em L3 | não | Poluição visual no modo físico; B7 cobre no nível 1 |

---

## Parte IV — Plano de execução na branch

Branch: `visual-quality-lab`. Ordem proposta (cada passo mensurável e
mergeável por si):

1. **A8** Presets de qualidade (infra) →
2. **A1** Fat lines + **B6** MET (rápidos, ganho imediato) →
3. **A3 + A6** Rim/matcap + fog/fundo →
4. **B1** Cones de jet + **B3** vértices →
5. **B4** Minimap 2.0 + **B5** clusters →
6. **A4** Tone mapping (toggle) →
7. **A2** Bloom (vendorar composer) + **B2** replay no cinema →
8. **B7/B8/B9/B10** conforme apetite →
9. **A7** AO por último (experimento).

### Critérios de validação (gate de merge)

- `tests/smoke/run.mjs` passa com os budgets atuais no preset **Standard**;
  preset Beauty ganha budgets próprios documentados.
- **Standard fica pixel-comparável ao visual de hoje** (os shifters não podem
  ser surpreendidos por mudança de leitura).
- Beauty: 60 fps em GPU dedicada, ≥30 fps em iGPU a 1600×900 (medir com
  `?perf=1`, p95 < 33ms).
- Idle continua com GPU ociosa (nenhuma animação fora de cinema/interação).
- A/B screenshots (o harness de screenshot MSAA 4x já existe) anexados ao PR.

### Pendências de decisão (discutir antes de implementar)

- A4/A2 mudam percepção de cor → validar com Luciano e, idealmente, com os
  RCs (Nikiforos/Oleg) usando screenshots A/B.
- B4 (clique navega) muda interação do minimap → confirmar que não conflita
  com o fluxo de desenhar retângulos.
- Lego plot: levantar interesse no ticket antes de investir.
