# Stress test de FPS — Cinema mode (CGV-Web)

Mede o FPS do Cinema mode em vários XMLs (e no Slicer), comparando a **versão atual**
(`bench-current` = HEAD) com a **versão anterior às melhorias de performance**
(`bench-baseline` = `2cbaaa1`, 10/jun).

A medição é feita por um **script externo** (`cgv-bench.js`) que você cola no Console do
navegador. Ele **não modifica o código do CGV-Web** — só roda um loop `requestAnimationFrame`
próprio e carimba o tempo de cada frame. É o **mesmo método** nas duas versões → comparação
justa (o HUD interno do app **não** é comparável entre versões: a antiga conta rAF, a nova
mede CPU descapada).

---

## Decisões (e o porquê)

- **FPS real, sem teto:** o `launch-chrome.bat` abre o Chrome com `--disable-gpu-vsync
  --disable-frame-rate-limit`. Sem isso, num monitor de 60 Hz o número trava em 60 mesmo que
  a GPU consiga 120/200. As flags só deixam *contar* acima de 60 — **não** alteram o app, e
  são aplicadas igual nas duas versões.
- **Baseline = `2cbaaa1` (verificado):** pai imediato da reescrita de performance, com a
  **mesma geometria** (`geometry-v4`), os **mesmos 7 XMLs** (`samples-v1`) e os **mesmos
  elementos físicos**. Mantido intacto.
- **Ciclos completos e contínuos:** o tester entra no cinema **uma vez**, aquece, e mede N
  ciclos **em sequência** (sem reset no meio). `ciclo(s)` deve ser **≥ o loop** (atual ~75 s,
  baseline ~60 s); o padrão 78 s cobre os dois.
- **Sem reset de câmera:** o tester **não** dispara `r` — com o slicer ativo isso reverteria
  seu corte. Seu corte/enquadramento ficam intactos.
- **Segurança:** se a aba perde o foco ou os frames param, o run é **abortado e nada é salvo**.
  Há botão **■ Parar**. Mantenha a janela em primeiro plano.
- **Dados brutos primeiro:** o JSON guarda o timestamp de **cada frame** + `cells` (contagem
  de células do evento) + `hud` (draws/tris/fps do app). Análise depois, com `analyze.mjs`.

---

## Setup numa máquina nova (ex.: Alienware)

Pré-requisitos no PATH: **git**, **node**, **python**.

```bash
git clone https://github.com/nipscernlab/cgv-web.git
cd cgv-web
git checkout bench-current          # traz o app atual + a pasta bench/
bench\switch.bat current            # baixa geometria + 7 XMLs (assets ~216 MB, não vêm no git)
python serve.py 8080                # deixe rodando num terminal dedicado
```

> Os XMLs e a geometria **não** estão no git (gitignored); o `switch.bat` os baixa via fetch
> (mesmos releases nas duas versões). Eles ficam fora do git e **persistem** ao trocar de versão.

---

## Padronização da máquina (ANTES de medir)

- **GPU dedicada:** `chrome://gpu` → *Hardware accelerated* e a GPU certa (no Aurora R15, a
  RTX — não a iGPU). Painel NVIDIA → energia = *Máximo desempenho*; Vsync = *usar config. do
  aplicativo*; Windows → Configurações gráficas → Chrome = *Alto desempenho*.
- **Energia:** plano *Alto desempenho*; Alienware Command Center em *Performance*.
- **Janela em primeiro plano, sem cobrir** (o render loop do app pausa se a aba some).
- **Mesmo Chrome** nas duas versões; anote a versão. Feche apps de fundo; pause Windows Update.
- **Térmico:** 1 run de descarte p/ aquecer; deixe o cooldown entre runs.

> O `gpu` gravado em cada JSON tem que ser **o mesmo** nas duas versões. Se a antiga cair na
> iGPU e a nova na dGPU, a comparação está contaminada.

---

## Medir (por versão)

1. `bench\launch-chrome.bat 8080` (Chrome com o teto destravado).
2. **Carregue um XML** pela lista (assista carregar).
3. (só no caso do Slicer) `Shift+S` p/ ligar o slicer; para **todas as células** abra a cunha
   até o HUD mostrar `∠ ≈ 360°` (cuidado: passar de 360° volta a 0° = esconde tudo), ou deixe
   o corte padrão de 90°. **Use o mesmo estado nas duas versões** e anote-o na nota.
4. Abra o Console (F12), **cole todo o `cgv-bench.js`** → painel no canto.
5. Ajuste **label** (ex.: `xml1_516761`), **modo** (`tour` ou `tour+slicer`), **nota**
   (máquina/GPU; e o ângulo do corte se for slicer).
6. Clique **"▶ Rodar"** e **assista** (não troque de aba). O `~fps` ao vivo deve passar de 60
   na versão nova. Ao fim, baixa um JSON com os dados brutos.
7. **Carregue o próximo XML** e repita do passo 4.

**Plano:** 7 XMLs em `tour` + 1 em `tour+slicer`.

### Trocar de versão
```bash
bench\switch.bat baseline     # ou: current
```
Depois **F5 no Chrome** e **re-cole o `cgv-bench.js`** (ele some no reload). O `serve.py` serve
do disco (sem cache), então o F5 já carrega a versão trocada — mesmo servidor, mesma porta.

---

## Formato dos dados (bruto)

Um JSON por run: `{ label, mode, versionHint, gpu, dpr, viewport, note, cells:{tile,lar,hec,
fcal,total}, hud:{fps,draws,tris,cpuP50,cpuP95}, config:{reps,warmupS,cycleS}, ts,
reps:[{ rep, frames:[ms rel. ao 1º frame], summary }] }`. A verdade são os arrays `frames`.

**Análise:** `node bench/analyze.mjs` (todos os JSONs de `bench/`) ou `... arquivo.json`.
Reporta por rep e agregado: FPS médio/mediana/desvio, percentis, 1% e 0.1% low, frame-time
(p50/p95/p99/max), travadas (<30 fps), CV de suavidade, células e draws/tris do HUD, e um
perfil FPS×trajetória. A comparação final atual×baseline (speedup por evento) sai cruzando os
JSONs das duas versões.

> Para slicer, o `cells` registrado é o do **evento**; a geometria renderizada é a **inteira**
> (~184k células) — use isso como eixo X nesse caso.

---

## Troubleshooting

- **`ERR_CONNECTION_REFUSED`** → `python serve.py 8080` não está rodando.
- **App em "Initializing…" / lista vazia** → faltou o fetch: `bench\switch.bat current` (ou
  `node tools\scripts\fetch-geometry.mjs` + `fetch-samples.mjs`).
- **`~fps` preso em 60** → use o `launch-chrome.bat` (não o Chrome normal); painel NVIDIA com
  Vsync = *config. do aplicativo*; confira `chrome://gpu`.
- **Run "ABORTADO"** → a aba perdeu o foco ou os frames pararam. Mantenha em primeiro plano.
- **GPU diferente entre versões** (campo `gpu`) → force a mesma dGPU pro Chrome nas duas.
- **`git checkout` falha ao trocar de versão** → há edição não commitada em arquivo versionado;
  rode `git status` (os outputs `cgv-bench__*.json` são gitignored, não atrapalham).

Quando tiver os JSONs das duas versões, me avise que cruzo tudo num relatório comparativo.
