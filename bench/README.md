# Stress test de FPS — Cinema mode (CGV-Web)

Mede o FPS do Cinema mode em vários XMLs e no Slicer, comparando a **versão atual**
(`HEAD`) com a **versão anterior às melhorias de performance** (`2cbaaa1`, 10/jun).

A medição é feita por um **script externo** (`cgv-bench.js`) que você cola no Console
do navegador. Ele **não modifica o código do CGV-Web** em nenhuma das versões — só roda
um loop `requestAnimationFrame` próprio e carimba o tempo de cada frame. É o **mesmo
método** nas duas versões → comparação justa (o HUD interno do app **não** é comparável
entre versões: a antiga conta rAF, a nova mede CPU descapada).

---

## Decisões (e o porquê)

### Medir FPS real, acima do teto do monitor
O launcher abre o Chrome com `--disable-gpu-vsync --disable-frame-rate-limit`. Sem isso,
num monitor de 60Hz o `requestAnimationFrame` dispara só 60×/s, o app **renderiza só 60
frames** e o número trava em 60 — mesmo que a GPU consiga 120/200. As flags removem o teto
para a gente medir a velocidade **real**.

> Estas flags **não deixam o app mais rápido** e **não favorecem a versão nova**: só deixam
> a gente *contar* acima de 60. São aplicadas **igual nas duas versões** e **não mexem** nas
> flags de GPU do app (`powerPreference`/`alpha`/`precision`, que ficam no `renderer.js` de
> cada versão — flags de linha de comando não sobrescrevem opções de `getContext`).

### Baseline = `2cbaaa1` (verificado)
Último commit **antes** da reescrita de performance (`1f3b7c9`, 11/jun), mantido intacto.
Confirmado que tem **a mesma base** que o HEAD:

| Item | HEAD | `2cbaaa1` |
|---|---|---|
| Geometria (release) | `geometry-v4` | `geometry-v4` ✅ mesmo GLB |
| Samples (release) | `samples-v1` | `samples-v1` ✅ mesmos 7 XMLs (manifesto idêntico) |
| Elementos físicos | fótons, elétrons, múons, taus, jatos, tracks, clusters, hits, MET, vértices | **os mesmos** (introduzidos em 04/mai) ✅ |

Ir para um commit mais antigo **não** melhora isso (a física e a geometria já são as mesmas
desde maio) — só adicionaria diferenças não relacionadas. `2cbaaa1` isola "todas as
melhorias" com o mínimo de ruído.

### Ciclos completos e contínuos
Cada rep é um **ciclo completo** do cinema. O tester entra no cinema **uma vez**, aquece, e
mede os N ciclos **em sequência** (sem resetar a câmera entre eles) — nada de "voltar do
zero" no meio. Por isso `ciclo(s)` deve ser **≥ a duração do loop** (atual ~75 s, baseline
~60 s); o padrão 78 s cobre os dois.

### Segurança
Se a aba perde o foco / fica oculta (o render loop do app **pausa**) ou se os frames param,
o run é **abortado e nada é salvo** (medição inválida). Há botão **■ Parar**. Mantenha a
janela em primeiro plano.

### Dados brutos primeiro
O JSON guarda o timestamp de **cada frame**. A análise estatística é feita depois com
`node bench/analyze.mjs`.

### Sobre "o mesmo caminho de câmera"
No **modo Tour** o caminho difere entre versões (cinema reescrito: 60 s na antiga, 75 s na
atual) — não dá pra igualar sem mexer no código antigo. Mitigação: (1) dentro de uma versão,
reseto a câmera antes de cada rep → 3 reps reproduzíveis; (2) o **modo Órbita** (`autoRotate`)
avança o mesmo ângulo por frame nas duas → varredura uniforme idêntica (comparação mais
controlada). Recomendado medir **nos dois modos**.

---

## Pré-requisitos (uma vez por máquina)

```bash
# Duas versões coexistindo via worktree (a partir da pasta do repo):
git worktree add ../cgv-current  HEAD        # versão atual   -> porta 8080
git worktree add ../cgv-baseline 2cbaaa1     # antes da perf  -> porta 8081

# Em CADA worktree (IMPORTANTE — sem isto o app não carrega: assets ficam em public/):
npm ci
npm run fetch:geometry        # baixa CaloGeometry.glb.gz -> public/geometry_data/
npm run fetch:samples         # baixa os 7 XMLs           -> public/default_xml/
```

Suba os dois servidores (terminais separados):

```bash
# em ../cgv-current
python serve.py 8080
# em ../cgv-baseline
python serve.py 8081
```

---

## Padronização da máquina (ANTES de medir)

- **GPU dedicada:** `chrome://gpu` deve mostrar *Hardware accelerated* e a GPU certa
  (no Aurora R15, a RTX — não a iGPU). Painel NVIDIA → energia = *Máximo desempenho*;
  Vsync = *Usar configuração do aplicativo*; Windows → Configurações gráficas → Chrome =
  *Alto desempenho*.
- **Energia:** plano *Alto desempenho*; Alienware Command Center em *Performance*; desligar
  economia de bateria / efficiency mode do Chrome.
- **Janela em primeiro plano, sem cobrir** (o render loop pausa se a aba some). Sem protetor
  de tela; display não pode desligar.
- **Mesmo Chrome nas duas versões**; travar auto-update na sessão; anotar a versão.
- **Fechar** apps de fundo; pausar Windows Update / indexação / OneDrive.
- **Térmico:** 1 run de descarte para aquecer; deixar o cooldown entre runs.

> **Safeguard de GPU:** o `gpu` gravado em cada JSON (via WebGL) tem que ser **o mesmo** nas
> duas versões. Se a antiga cair na iGPU e a nova na dGPU, a comparação está contaminada.

---

## Protocolo de medição (por versão)

Faça TODA a versão atual primeiro, depois TODA a baseline. Em cada uma:

1. Abra o navegador pelo launcher (teto destravado):
   `bench\launch-chrome.bat 8080` (atual) | `bench\launch-chrome.bat 8081` (baseline)
2. Confira `chrome://gpu` (1ª vez) e volte para a aba do app.
3. **Carregue o XML #1** pela lista (você assiste carregar).
4. (só no XML escolhido p/ o Slicer) ligue o **Slicer** com `Shift+S` e espere a geometria
   inteira aparecer.
5. Abra o Console (F12), **cole todo o `cgv-bench.js`** e Enter → painel no canto.
6. Ajuste o **label** (ex.: `xml1_516761`), escolha o **modo** (`tour`/`orbit`; `*+slicer`
   se o Slicer estiver ligado), preencha a **nota** (máquina/GPU).
7. Clique **"▶ Rodar"** e **assista** — a câmera faz N ciclos seguidos, sem reset no meio
   (não troque de aba). O `~fps` ao vivo deve passar de 60 na versão nova; se travar em 60,
   o vsync não foi destravado (ver Troubleshooting).
8. Ao fim baixa um JSON com os dados brutos. **Carregue o próximo XML** e repita do passo 5.
9. (Opcional) clique **"↻ modo Órbita"** no painel e repita no modo controlado.

Repita TUDO na outra versão (porta diferente). O script é o **mesmo arquivo**, sem mudanças.

---

## Matriz de coleta

| Versão | XMLs | Modo(s) | Reps | Loops |
|---|---|---|---|---|
| atual (HEAD) | 7 + 1 slicer | tour (+ orbit opcional) | 3 | 24 (48 c/ orbit) |
| baseline (2cbaaa1) | 7 + 1 slicer | tour (+ orbit opcional) | 3 | 24 (48 c/ orbit) |

Ciclo padrão = 78 s (≥ o loop: atual ~75 s, baseline ~60 s). Os N reps rodam em sequência
contínua (~`warmup + reps×ciclo` por XML; ex.: 8 + 3×78 ≈ 4 min).

---

## Formato dos dados (bruto)

Um JSON por run: `{ label, mode, versionHint, url, ua, gpu, dpr, viewport, note, config,
ts, reps:[{ rep, frames:[ms relativos ao 1º frame], summary }] }` (config = {reps, warmupS,
cycleS}). O `summary` é só conveniência; a verdade são os arrays `frames`.

**Análise:** `node bench/analyze.mjs` (todos os JSONs de `bench/`) ou `node bench/analyze.mjs
arquivo.json`. Reporta, por rep e agregado: FPS médio/mediana/desvio, percentis, 1% e 0.1%
low, frame-time (p50/p95/p99/max), travadas (<30 fps, >2× mediana), CV de suavidade e um
perfil FPS×trajetória. A comparação final old×new (speedup por XML) sai cruzando os JSONs
das duas versões.

---

## Troubleshooting

- **`ERR_CONNECTION_REFUSED`** → o servidor não está rodando nessa porta. Rode `python
  serve.py 8080` (ou 8081) no worktree certo.
- **App abre mas fica em "Initializing…" / sem geometria / lista vazia** → faltou o fetch.
  Rode `npm run fetch:geometry` e `npm run fetch:samples` (assets vão para `public/`).
- **`~fps` preso em 60** → vsync não destravado: use o `launch-chrome.bat` (não o Chrome
  normal), painel NVIDIA com Vsync = *config. do aplicativo*, e confira `chrome://gpu`.
- **GPU diferente entre versões** (campo `gpu` no JSON) → force a mesma dGPU para o Chrome
  nas duas (Configurações gráficas do Windows / painel NVIDIA).
- **Run "ABORTADO"** → a aba perdeu o foco ou os frames pararam durante a medição. Mantenha
  a janela em primeiro plano e refaça (nada inválido é salvo).
- **"Baixar tudo (0)"** mesmo após rodar → recolou o script depois? O contador agora
  atualiza a cada run; os JSONs por-run já estão baixados de qualquer forma.

Cruzo os dados das duas versões no relatório final quando você terminar a coleta.
