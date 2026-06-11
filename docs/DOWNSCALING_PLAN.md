# Plano B — Downscaling Adaptativo de Qualidade Gráfica (NÃO implementado)

> **Status: plano de estudo.** Decisão registrada em 2026-06-11: a otimização estrutural
> (ver `PERFORMANCE_PLAN.md`) entregou os ganhos sem tocar na qualidade visual. Este
> documento existe para o caso de, no futuro, algum hardware (celulares antigos, iGPUs
> fracas) ainda não atingir a meta de fluidez — aí, e somente aí, vale implementar o que
> está descrito aqui. Escrito com detalhe suficiente para uma IA (ou humano) implementar
> sem redescobrir o contexto.

## 1. Princípio e por que funciona

Depois da otimização estrutural, o custo de frame do CGV Web em hardware fraco é dominado
por **fill rate** (pixels × custo do fragment shader) e **resolve do MSAA**, ambos
proporcionais à área do framebuffer:

```
custo_fill ∝ largura × altura × DPR² × (1 + custo_MSAA)
```

Reduzir o `devicePixelRatio` efetivo de 2.0 → 1.4 corta o custo de fill em ~2×; para
1.0, ~4×. É o único knob com ganho garantido e proporcional que resta depois de
eliminar draw calls e trabalho de CPU — e é exatamente o que engines de jogos chamam de
**Dynamic Resolution Scaling (DRS)**.

A perda de qualidade é a nitidez: a imagem é renderizada menor e esticada pelo
compositor do navegador (upscale bilinear do canvas). Em movimento (órbita, drag de
slicer) a perda é quase imperceptível; em imagem parada é visível — por isso o desenho
abaixo **só reduz resolução DURANTE interação contínua** e restaura o DPR pleno no
primeiro frame de repouso ("o usuário nunca vê uma imagem parada borrada").

## 2. Arquitetura proposta

### 2.1 Governador de resolução (novo módulo `public/js/adaptiveDpr.js`)

Estado:

```js
const DPR_MAX = Math.min(window.devicePixelRatio || 1, 2); // teto atual do app
const DPR_MIN = 1.0;          // nunca abaixo de 1.0 em desktop; 0.75 só em mobile
const STEPS   = [1.0, 0.85, 0.7, 0.6, 0.5]; // multiplicadores sobre DPR_MAX
let stepIdx   = 0;            // 0 = qualidade plena
```

Entradas (por frame renderizado, medidas no render loop):

- `frameMs` — tempo CPU do `renderer.render` + intervalo entre frames renderizados
  consecutivos (já coletado pelo HUD `?perf=1` em `renderLoop.js` — reutilizar o ring
  buffer `_frameMs`).
- `interacting` — booleano: `true` entre `controls.addEventListener('start')` e 400 ms
  após `'end'`, OU enquanto `slicer.isDragging()`, OU enquanto cinema anima
  (`cinema.isAnimating()`).

Regras (executar no fim de `_loopTick`, no máximo a cada 250 ms):

1. **Degradar**: se `interacting` e a mediana dos últimos 12 frames renderizados
   `> 1000/alvo + 4 ms` (alvo = taxa do monitor detectada, ver §2.4) e `stepIdx <
   STEPS.length-1` → `stepIdx++`, aplicar, zerar o ring, cooldown 500 ms.
2. **Recuperar durante interação**: se mediana `< 0.6 × (1000/alvo)` por 24 frames e
   `stepIdx > 0` → `stepIdx--`, cooldown 1000 ms (histerese assimétrica: desce rápido,
   sobe devagar — evita "bombeamento").
3. **Restauração no repouso**: na transição `interacting → false`, agendar UM frame com
   `stepIdx = 0` (qualidade plena) via `markDirty()`. Imagem parada é sempre full-res.
4. **Aplicação**:
   ```js
   renderer.setPixelRatio(DPR_MAX * STEPS[stepIdx]);
   renderer.setSize(window.innerWidth, window.innerHeight, false);
   markDirty();
   ```
   Atenção: `_restoreRendererAfterFocus()` e o handler de `resize` em `renderLoop.js`
   hoje aplicam `Math.min(devicePixelRatio, 2)` fixo — devem passar a consultar o
   governador (`getCurrentDpr()`), senão um alt-tab desfaz o estado.

### 2.2 Interação com o que já existe

- **Screenshots**: nenhuma mudança — o export já renderiza em `WebGLRenderTarget`
  offscreen com resolução própria (ver `screenshot.js`), imune ao DPR do canvas.
- **HUD `?perf=1`**: já exibe o DPR atual; adicionar o `stepIdx` ajuda a depurar.
- **Picking/hover**: independente de resolução (raycast matemático) — nada muda.
- **Minimap**: canvas 2D separado — não tocar.
- **`?nodrs=1`**: prever um query param para desativar o governador (debug e
  comparações A/B), e um toggle em Settings (`localStorage['cgv-drs']`).

### 2.3 MSAA dinâmico (opcional, segunda alavanca)

O contexto WebGL é criado com `antialias: true` (MSAA 4x, fixo — não dá para mudar sem
recriar o contexto). Alternativa com a mesma arquitetura do screenshot:

- Renderizar a cena num `WebGLRenderTarget` com `samples: 4` em full-res quando ocioso
  e `samples: 0` em resolução reduzida durante interação, e blitar para o canvas
  (quad fullscreen ou `copyFramebufferToTexture` invertido).
- Custo: 1 blit por frame; ganho: controle independente de resolução E antialiasing.
- Só vale a pena se o DRS de resolução não bastar — implementar depois e atrás do
  mesmo toggle.

### 2.4 Detecção da taxa do monitor (alvo do governador)

Não usar 60 fixo. No boot, medir a cadência real do rAF:

```js
// ~20 amostras de requestAnimationFrame; alvo = mediana arredondada para
// {60, 75, 90, 120, 144, 165, 240} mais próximo.
```

Guardar como `targetHz`; o orçamento de frame vira `1000/targetHz`. (Também é o que o
HUD deveria exibir como referência.)

### 2.5 Mobile: ajustes específicos

- `DPR_MAX` em celular costuma ser 3 — manter o teto atual de 2 já é um "downscale"
  aceito; o governador parte daí.
- Permitir `STEPS` até 0.5 (DPR efetivo 1.0 em tela DPR-3) — em telas pequenas e
  densas a perda é menos visível.
- Gatilho extra: `navigator.getBattery()` / `prefers-reduced-motion` podem iniciar com
  `stepIdx = 1`.

## 3. Critérios de aceitação (quando implementar)

1. Com `?perf=1`, arrastar a câmera em show-all num hardware fraco: p95 de frame ≤
   orçamento do monitor, com DPR visivelmente reduzido APENAS durante o movimento.
2. Soltar o mouse: 1 frame depois a imagem está em DPR pleno (comparar screenshot
   parado com/sem DRS → **pixel-idêntico**).
3. Export de screenshot: byte-idêntico com DRS ligado/desligado.
4. Suite `npm run smoke`: adicionar um step que força `stepIdx` máximo, verifica que o
   canvas interno encolheu (`renderer.domElement.width`), e que após `mouseup` +
   1 frame ele volta ao tamanho pleno.

## 4. Riscos conhecidos

- **Bombeamento (oscilação)**: mitigado pela histerese assimétrica e cooldowns (§2.1).
- **Conflito com `_restoreRendererAfterFocus`/resize**: centralizar TODA escrita de
  pixel ratio no governador (única fonte de verdade).
- **Texto/UI**: o DOM (painéis, tooltips) nunca é afetado — só o canvas 3D.
- **Compositor**: o upscale do canvas usa filtro bilinear do navegador; em fator < 0.7
  pode aparecer shimmer em linhas finas (contornos de célula). Se incomodar, limitar
  `STEPS` a 0.7 em desktop e/ou desenhar contornos com 1.5 px de espessura via
  `image-rendering` não se aplica a WebGL — aceitar ou usar o caminho RT+blit (§2.3)
  com filtro de upscale customizado (FSR1-like: easu simplificado em um shader de
  16 instruções — referência: AMD FidelityFX-SR1, licença MIT, portável para GLSL ES3).

## 5. Por que NÃO está implementado hoje

Política do projeto (2026-06-11): **nenhuma perda de qualidade visual** enquanto a
otimização estrutural for suficiente. Medições pós-otimização no laptop de referência:
60 fps cravado (limitado por vsync/rAF, não pelo app). Reavaliar este plano somente se
aparecer hardware-alvo abaixo da meta — e então implementar §2.1 + §2.4 primeiro
(1–2 dias), deixando §2.3 para um segundo passo.
