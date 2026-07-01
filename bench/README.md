# Stress test de FPS — Cinema mode (CGV-Web)

Mede o FPS do **Cinema mode** (e de um cenário com o **Slicer**) em vários XMLs,
comparando a **versão nova** (`bench-current`) com a **versão anterior às melhorias
de performance** (`bench-baseline`). O resultado alimenta o paper do **ENMC**:
quanto o projeto novo melhorou, quantificado.

A medição é feita por um **runner externo** (`public/js/bench.js`) que **não faz parte
do app** e **não altera o código medido**. Ele roda um loop `requestAnimationFrame`
**próprio** e carimba o tempo de cada frame — **método idêntico** nas duas versões →
comparação justa.

---

## Regra de ouro (justiça)

> **Nada instrumentado pode mudar o desempenho de nenhuma das versões.** Mesmo PC,
> mesma GPU, tudo limpo. A comparação é externa.

Como isso é garantido:

- **Régua = o probe rAF externo.** O frame-time/FPS que vale para a comparação é o
  do `bench.js`, medido do mesmo jeito nas duas branches. O loop de cinema roda o
  **código original** de cada versão.
- **Hook neutro `window.__cgvApp`** (instalado pelo `main.js` **só** com `?bench=1`):
  não envolve `renderer.render`, não registra callback por-frame, não reseta contador,
  não mexe em `autoReset`. Só **lê** contadores nativos e **navega** entre medições.
- **draws/tris** saem de `renderer.info` (o three.js já mantém isso a cada render) —
  lidos **sob demanda**, custo por-frame **zero**. No baseline os contadores acumulam,
  então o runner deriva draws/frame por `Δcontador ÷ Δframes`.
- **Nenhum cronômetro de CPU é injetado** em nenhuma versão (isso deixaria o baseline
  artificialmente mais lento). O `cpuP50/P95` interno do current **não** entra na
  comparação — a régua de custo é o frame-time externo.
- Sem `?bench=1`, o app é **byte-a-byte** o de produção.

---

## Setup numa máquina nova

Pré-requisitos no PATH: **git**, **node**, **python**.

```bash
git clone https://github.com/nipscernlab/cgv-web.git
cd cgv-web
git checkout bench-current           # ou bench-baseline
bench\switch.bat current             # baixa geometria + 7 XMLs (~216 MB, não vêm no git)
python serve.py 8080                 # deixe rodando num terminal dedicado
```

> Os XMLs e a geometria são baixados pelo `switch.bat` (mesmos releases nas duas
> versões) e **persistem** ao trocar de branch.

---

## Padronização da máquina (ANTES de medir)

- **GPU dedicada:** `chrome://gpu` → *Hardware accelerated* e a GPU certa (a dGPU, não
  a iGPU). Painel NVIDIA → energia *Máximo desempenho*; Vsync = *usar config. do app*.
  Windows → Configurações gráficas → Chrome = *Alto desempenho*.
- **Energia:** plano *Alto desempenho*.
- **Janela em primeiro plano, sem cobrir** (o render loop do app pausa se a aba some —
  a suíte aborta o cenário nesse caso).
- **Mesmo Chrome** nas duas versões; anote a versão. Feche apps de fundo.
- **Térmico:** deixe cooldown entre versões.

> O campo `gpu` gravado no JSON tem que ser **o mesmo** nas duas versões. Se uma cair
> na iGPU, a comparação está contaminada (o `analyze.mjs` avisa).

---

## Medir — 1 clique por versão

1. `bench\launch-chrome.bat 8080` — abre o Chrome com o teto de FPS **destravado** e a
   URL `?bench=1` (o painel da suíte aparece sozinho no canto).
2. Espere o app carregar. O painel mostra `versão do app: baseline|current`.
3. (opcional) Ajuste **nota** (máquina/GPU), **reps/aquece/ciclo** e o **ângulo do
   slicer** do último XML.
4. Clique **"▶ Rodar suíte completa"** e **deixe rodando** (não troque de aba). A suíte:
   - percorre **todos os XMLs** da lista: carrega → entra no cinema → aquece → mede N
     ciclos contínuos → sai;
   - no **último XML** liga o **Slicer** (`show-all`, geometria pesada) e mede de novo;
   - baixa **um único JSON** com tudo:
     `cgv-bench__suite__<versão>__<ts>.json`.
5. **Troque de branch** (`bench\switch.bat baseline|current`), **F5** no Chrome, e clique
   de novo. Isso gera o **segundo JSON**.

> Tempo aproximado por versão: `(nº XMLs + 1) × reps × ciclo` (ex.: 8 × 3 × 78 s ≈ 31 min).
> Baixe `reps`/`ciclo` para runs mais curtos.

### Segurança

Se a aba perde o foco ou os frames param (2,5 s sem frame novo), o **cenário atual é
abortado**; a suíte segue para o próximo e, se já houver cenários válidos, salva um
JSON **PARCIAL**. Há botão **■ Parar**.

---

## Formato dos dados (schema `cgv-bench/2`)

Um JSON por versão:

```
{ schema:"cgv-bench/2", version:"baseline"|"current", gpu, dpr, viewport, note,
  geometry:{fromCache,loadMs,bytes}, config:{reps,warmupS,cycleS,slicerDeg}, ts,
  scenarios:[ { kind:"tour"|"tour+slicer", label:<xml>, cells:{tile,lar,hec,fcal,total},
               parseMs, slicer:null|{wedgeDeg,showAll}, counters:{accumulates,dpr},
               reps:[ { rep, frames:[ms rel. ao 1º frame], drawsPerFrame, trisPerFrame,
                        counters:{start,end}, summary } ] } ] }
```

A verdade são os arrays `frames` (timestamps brutos de cada frame).

---

## Análise

```bash
node bench/analyze.mjs           # todos os bench/cgv-bench__*.json
node bench/analyze.mjs arquivo.json
```

Reporta, por cenário: FPS média/mediana/desvio, percentis, **1% e 0.1% low**, frame-time
(p50/p95/p99/max), travadas (<30 fps), CV de suavidade, **draws/tris por frame**, e um
perfil FPS×trajetória. Com os **2 JSONs** (baseline + current) na mesma pasta, imprime a
**tabela comparativa** `current × baseline`: speedup de FPS por evento, razão de draws/tris
e frame-time — o resultado do paper.

---

## Trocar de versão

```bash
bench\switch.bat baseline     # ou: current
```

Depois **F5 no Chrome**. O `serve.py` serve do disco com `no-cache`, então o F5 já carrega
a versão trocada — mesmo servidor, mesma porta. O painel é injetado de novo pelo `?bench=1`
(não some no reload; você **não** precisa colar nada).

---

## Troubleshooting

- **Painel não aparece** → a URL precisa ter `?bench=1` (use o `launch-chrome.bat`). Se
  aparecer `window.__cgvApp não apareceu`, a versão atual não tem o hook — confira que a
  branch tem o `main.js` com o bloco `window.__cgvApp`.
- **`ERR_CONNECTION_REFUSED`** → `python serve.py 8080` não está rodando.
- **App em "Initializing…" / lista vazia** → faltou o fetch: `bench\switch.bat current`.
- **`~fps` preso em 60** → use o `launch-chrome.bat` (não o Chrome normal); painel NVIDIA
  com Vsync = *config. do aplicativo*; confira `chrome://gpu`.
- **Cenário "abortado"** → a aba perdeu o foco ou os frames pararam. Mantenha em primeiro
  plano.
- **GPU diferente entre versões** → force a mesma dGPU pro Chrome nas duas.
- **`git checkout` falha** → há edição não commitada em arquivo versionado; rode
  `git status`.

Quando tiver os 2 JSONs, rode o `analyze.mjs` (ou me mande) para o relatório comparativo.
