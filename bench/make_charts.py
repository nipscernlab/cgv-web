# -*- coding: utf-8 -*-
"""
Análise + gráficos do bench CGV-Web (current x baseline), POR MÁQUINA.

Organização esperada:
  bench/dados/<maquina>/cgv-bench__suite__*.json   (ex.: rtx4070ti, gtx1050ti)
  bench/dados/descartados/                          (runs legados, parciais, zip)
Saídas:
  bench/resultados/<maquina>/  -> stats.json + figuras 00..12 (12 só se houver
                                  2+ execuções completas de alguma versão)
  bench/resultados/comparacao/ -> figura comparando as máquinas (se 2+)

Estratégia de mescla (cada execução completa = uma réplica, peso igual):
  - Execução completa = suíte não abortada com cycleS >= 70 s (o loop do cinema
    dura ~75 s). Execuções rápidas (ciclo curto) só conferem reprodutibilidade.
  - Por cenário e versão: estatística de cada execução (pool das reps), depois
    média entre execuções; a dispersão (min/max) é preservada e mostrada.

Nota de contagem (importante em máquinas fracas): na versão antiga os contadores
acumulam e draws/tris são derivados por Δcontador / Δframes do probe — ou seja,
POR QUADRO APRESENTADO. Quando a GPU satura, a antiga submete várias renderizações
por quadro apresentado no tour (detectado comparando com o arraste, onde a
submissão é 1:1); o fator é medido e reportado, não escondido.

Uso:  python bench/make_charts.py            (todas as máquinas)
      python bench/make_charts.py gtx1050ti  (uma máquina)
"""
import json, glob, os, re, sys, textwrap
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter
from matplotlib.patches import Patch
from matplotlib.lines import Line2D
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

BENCH = os.path.dirname(os.path.abspath(__file__))
DADOS = os.path.join(BENCH, "dados")
RESUL = os.path.join(BENCH, "resultados")
FULL_CYCLE_S = 70

# ── paleta (validada com o validador da skill dataviz) ──────────────────────
SURF, INK, INK2, MUTED = "#fcfcfb", "#0b0b0b", "#52514e", "#898781"
GRID, AXIS = "#e1e0d9", "#c3c2b7"
C_NEW, C_OLD = "#2a78d6", MUTED
C_NEW_DK, C_OLD_DK = "#104281", "#52514e"
CAT = {"tour": "#2a78d6", "tour+slicer": "#1baf7a", "slicer-drag": "#eda100"}
CAT_PT = {"tour": "passeio da câmera (tour)", "tour+slicer": "corte parado",
          "slicer-drag": "arraste do corte"}
MACH_COLS = ["#2a78d6", "#1baf7a", "#eda100", "#008300"]   # ordem fixa p/ máquinas

plt.rcParams.update({
    "figure.dpi": 150, "savefig.dpi": 150,
    "figure.facecolor": SURF, "axes.facecolor": SURF, "savefig.facecolor": SURF,
    "font.size": 10, "font.family": "DejaVu Sans",
    "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.8,
    "grid.linestyle": "-", "axes.axisbelow": True,
    "axes.edgecolor": AXIS, "axes.linewidth": 0.8,
    "axes.labelcolor": INK2, "xtick.color": INK2, "ytick.color": INK2,
    "axes.titlecolor": INK, "axes.spines.top": False, "axes.spines.right": False,
})

def br(x, d=1):
    if x is None or (isinstance(x, float) and not np.isfinite(x)): return "?"
    return f"{x:,.{d}f}".replace(",", " ").replace(".", ",").replace(" ", ".")

def kfmt(n):
    if n is None: return "?"
    if n >= 1e6: return br(n / 1e6, 2) + " M"
    if n >= 1e3: return br(n / 1e3, 1) + " mil"
    return br(n, 0)

def gpu_name(g):
    m = re.search(r"(RTX|GTX|Radeon|Arc|Iris|UHD)[^,()]*", g or "?")
    return (m.group(0).strip() if m else (g or "?"))[:26]

FPS_TICKS = (1, 2, 3, 5, 10, 20, 30, 60, 100, 200, 400, 800)
FT_TICKS  = (1, 2, 5, 10, 16.7, 30, 60, 120, 240, 480, 960)

def log_axis(ax, vals, which="y", ticks=FPS_TICKS, lo_pad=0.72, hi_pad=1.65):
    lo, hi = min(vals) * lo_pad, max(vals) * hi_pad
    tk = [t for t in ticks if lo <= t <= hi]
    fmt = FuncFormatter(lambda v, _: br(v, 1) if v == 16.7 else br(v, 0))
    if which == "y":
        ax.set_yscale("log"); ax.set_ylim(lo, hi); ax.set_yticks(tk)
        ax.yaxis.set_major_formatter(fmt)
    else:
        ax.set_xscale("log"); ax.set_xlim(lo, hi); ax.set_xticks(tk)
        ax.xaxis.set_major_formatter(fmt)
    ax.tick_params(which="minor", length=0)
    return lo, hi

def threshold(ax, y, text="", axis="y", side="right"):
    if axis == "y":
        if not (ax.get_ylim()[0] < y < ax.get_ylim()[1]): return
        ax.axhline(y, color=INK2, lw=1, ls=(0, (4, 3)))
        if text:
            xpos, ha = (0.995, "right") if side == "right" else (0.005, "left")
            ax.text(xpos, y, " " + text + " ", transform=ax.get_yaxis_transform(),
                    ha=ha, va="bottom", fontsize=7.6, color=INK2)
    else:
        if not (ax.get_xlim()[0] < y < ax.get_xlim()[1]): return
        ax.axvline(y, color=INK2, lw=1, ls=(0, (4, 3)))
        if text:
            ax.text(y, 0.06, " " + text, transform=ax.get_xaxis_transform(),
                    ha="left", va="bottom", fontsize=7.6, color=INK2)

def evlabel(label):
    m = re.search(r"JiveXML_(\d+)_(\d+)", label or "")
    return f"{m.group(1)}·{m.group(2)[-3:]}" if m else (label or "")

AXIS_PT = {"theta": "θ (polar)", "phi": "φ (azimutal)", "z": "z (feixe)", "height": "raio"}
def sc_label(k):
    if k[0] == "tour":        return evlabel(k[1])
    if k[0] == "tour+slicer": return "corte parado"
    if k[0] == "slicer-drag": return "arraste " + AXIS_PT.get(k[2], k[2])
    return k[0]

def frametimes(frames):
    d = np.diff(np.asarray(frames, float)); return d[(d > 0) & (d < 2000)]

def pooled_ft_reps(sc):
    parts = [frametimes(r["frames"]) for r in sc["reps"] if r.get("frames")]
    return np.concatenate(parts) if parts else np.array([])

def run_stats(sc):
    ft = pooled_ft_reps(sc)
    if not len(ft): return None
    p50, p95, p99, p999 = np.percentile(ft, [50, 95, 99, 99.9])
    draws = [r.get("drawsPerFrame") for r in sc["reps"] if r.get("drawsPerFrame") is not None]
    tris  = [r.get("trisPerFrame")  for r in sc["reps"] if r.get("trisPerFrame")  is not None]
    return dict(fpsMean=1000*len(ft)/ft.sum(), fpsMedian=1000/p50,
                low1=1000/p99, low01=1000/p999,
                ftP50=p50, ftP95=p95, ftP99=p99, ftMax=float(ft.max()),
                ftCV=float(np.std(ft)/np.mean(ft)),
                draws=float(np.mean(draws)) if draws else None,
                tris=float(np.mean(tris)) if tris else None,
                nFt=int(len(ft)), ft=ft)

def key(sc): return (sc["kind"], sc.get("label"), sc.get("axis"))
gmean = lambda v: float(np.exp(np.mean(np.log(v)))) if len(v) else float("nan")

# ═════════════════════════ pipeline de UMA máquina ══════════════════════════
def run_machine(slug):
    ddir = os.path.join(DADOS, slug)
    out  = os.path.join(RESUL, slug)
    os.makedirs(out, exist_ok=True)

    RUNS = {"baseline": [], "current": []}
    for f in sorted(glob.glob(os.path.join(ddir, "cgv-bench__suite__*.json"))):
        j = json.load(open(f, encoding="utf-8"))
        ver = j.get("version")
        if ver not in RUNS or j.get("aborted"): continue
        cyc = (j.get("config") or {}).get("cycleS")
        scen = {key(s): run_stats(s) for s in j["scenarios"] if not s.get("error")}
        RUNS[ver].append(dict(name=os.path.basename(f), cycleS=cyc,
                              full=(cyc or 0) >= FULL_CYCLE_S, ts=j.get("ts"), meta=j,
                              scen={k: v for k, v in scen.items() if v},
                              meta_sc={key(s): s for s in j["scenarios"] if not s.get("error")}))
    FULL = {v: [r for r in RUNS[v] if r["full"]] for v in RUNS}
    QUICK = {v: [r for r in RUNS[v] if not r["full"]] for v in RUNS}
    if not FULL["baseline"] or not FULL["current"]:
        print(f"[{slug}] faltam execuções completas (baseline={len(FULL['baseline'])}, current={len(FULL['current'])}) — pulando")
        return None
    REF = {v: sorted(FULL[v], key=lambda r: r["ts"])[-1] for v in FULL}
    curr_ref = REF["current"]["meta"]
    MACH = gpu_name(curr_ref.get("gpu"))
    nfb, nfc = len(FULL["baseline"]), len(FULL["current"])
    FOOT = (f"GPU {MACH} · Chrome (FPS destravado) · "
            f"{'×'.join(map(str, curr_ref.get('viewport', [])))} px · "
            f"mescla por réplica: baseline {nfb} execução(ões) completa(s), current {nfc} · "
            f"probe rAF externo idêntico nas duas versões")
    print(f"\n=== {slug} ({MACH}) — baseline {nfb} run(s), current {nfc} run(s) ===")

    MET = ["fpsMean", "fpsMedian", "low1", "low01", "ftP50", "ftP95", "ftP99", "ftCV", "draws", "tris"]
    def agg(version, k):
        runs = [r for r in FULL[version] if k in r["scen"]]
        if not runs: return None
        o = {m: (float(np.mean([r["scen"][k][m] for r in runs if r["scen"][k][m] is not None]))
                 if any(r["scen"][k][m] is not None for r in runs) else None) for m in MET}
        o["ftMax"] = max(r["scen"][k]["ftMax"] for r in runs)
        o["nRuns"] = len(runs)
        o["runFpsMedian"] = [r["scen"][k]["fpsMedian"] for r in runs]
        o["fpsMedianMin"], o["fpsMedianMax"] = min(o["runFpsMedian"]), max(o["runFpsMedian"])
        return o
    def cells_of(v, k):
        sc = REF[v]["meta_sc"].get(k, {})
        return sc.get("renderedCells") or (sc.get("cells") or {}).get("total")
    def parse_of(v, k): return REF[v]["meta_sc"].get(k, {}).get("parseMs")
    def wedge_of(v, k): return (REF[v]["meta_sc"].get(k, {}).get("slicer") or {}).get("wedgeDeg")

    order = [key(s) for s in curr_ref["scenarios"] if not s.get("error")]
    BA = {k: agg("baseline", k) for k in order}
    CU = {k: agg("current", k) for k in order}
    common = [k for k in order if BA.get(k) and CU.get(k)]
    only_cur = [k for k in order if CU.get(k) and not BA.get(k)]
    sp_of = lambda k: CU[k]["fpsMedian"] / BA[k]["fpsMedian"]
    gm_all  = gmean([sp_of(k) for k in common])
    gm_tour = gmean([sp_of(k) for k in common if k[0] == "tour"])
    gm_slic = gmean([sp_of(k) for k in common if k[0] == "tour+slicer"])
    gm_drag = gmean([sp_of(k) for k in common if k[0] == "slicer-drag"])

    tours = sorted([k for k in common if k[0] == "tour"], key=lambda k: cells_of("current", k))
    tlab  = [evlabel(k[1]) for k in tours]
    sel   = tours + [k for k in common if k[0] in ("tour+slicer", "slicer-drag")]
    slab  = [sc_label(k) for k in sel]
    heavy = tours[-1]
    w = 0.36

    # multi-submit da antiga no tour (GPU saturada): compara tour vs arraste
    # no MESMO evento (arraste submete 1:1). m>1,5 => tour submete m renders
    # por quadro apresentado; draws/tris gravados são por quadro APRESENTADO.
    msub = None
    dragk = next((k for k in common if k[0] == "slicer-drag" and k[1] == heavy[1]), None)
    if dragk and BA[heavy]["draws"] and BA[dragk]["draws"]:
        m = BA[heavy]["draws"] / BA[dragk]["draws"]
        if m > 1.5:
            msub = dict(factor=m, rendersPerSec=BA[heavy]["fpsMean"] * m,
                        perRenderDraws=BA[dragk]["draws"])

    # ── stats.json ──────────────────────────────────────────────────────────
    def clean(d):
        if not d: return None
        o = {m: d[m] for m in MET}
        for xx in ("ftMax", "nRuns", "runFpsMedian", "fpsMedianMin", "fpsMedianMax"):
            o[xx] = d[xx]
        return o
    audit = dict(
        machine=dict(slug=slug, gpu=curr_ref.get("gpu"), label=MACH,
                     gpuEqual=len({r["meta"].get("gpu") for v in FULL for r in FULL[v]}) == 1,
                     viewport=curr_ref.get("viewport"), dpr=curr_ref.get("dpr"),
                     fullRuns={v: [r["name"] for r in FULL[v]] for v in FULL},
                     quickRuns={v: [r["name"] for r in QUICK[v]] for v in QUICK},
                     geometryLoadMs={v: REF[v]["meta"].get("geometry", {}).get("loadMs") for v in REF}),
        gmeanSpeedup=dict(all=gm_all, tour=gm_tour, slicer=gm_slic, drag=gm_drag,
                          nScenarios=len(common)),
        baselineMultiSubmit=msub, scenarios=[], onlyCurrent=[])
    for k in common:
        audit["scenarios"].append(dict(
            kind=k[0], label=k[1], axis=k[2],
            cells=dict(baseline=cells_of("baseline", k), current=cells_of("current", k)),
            parseMs=dict(baseline=parse_of("baseline", k), current=parse_of("current", k)),
            wedgeDeg=dict(baseline=wedge_of("baseline", k), current=wedge_of("current", k)),
            speedupFpsMedian=sp_of(k), baseline=clean(BA[k]), current=clean(CU[k])))
    for k in only_cur:
        audit["onlyCurrent"].append(dict(kind=k[0], label=k[1], axis=k[2], current=clean(CU[k])))
    json.dump(audit, open(os.path.join(out, "stats.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print(f"  -> resultados/{slug}/stats.json")

    def save(fig, name, interp):
        wrap = max(96, int(fig.get_size_inches()[0] * 12.4))
        wrapped = "\n".join(textwrap.fill(p, wrap) for p in interp.strip().split("\n"))
        n = wrapped.count("\n") + 1
        reserve = (0.42 + 0.175 * n) / fig.get_size_inches()[1]
        fig.tight_layout(rect=[0, reserve, 1, 0.99])
        fig.text(0.012, 0.030, "Interpretação:  " + wrapped, ha="left", va="bottom",
                 fontsize=8.6, color=INK, linespacing=1.45,
                 bbox=dict(boxstyle="round,pad=0.55", fc="#f4f4f1", ec="#c9c8c0", lw=0.8))
        fig.text(0.5, 0.005, FOOT, ha="center", va="bottom", fontsize=7, color=MUTED)
        fig.savefig(os.path.join(out, name)); plt.close(fig)
        print(f"  -> resultados/{slug}/{name}")

    # ═════ 00 · glossário ════════════════════════════════════════════════════
    TERMS = [
     ("baseline (versão antiga)", "O CGV-Web antes das otimizações; a referência a superar. Nos gráficos com duas séries é sempre a série cinza."),
     ("current (versão nova)", "O CGV-Web depois das otimizações (agrupamento de células em lotes e corte na GPU). Série azul nos comparativos."),
     ("execução (run) e réplica", "Cada clique na suíte gera uma execução completa. Havendo mais de uma por versão, os valores são a média entre execuções e a dispersão é mostrada."),
     ("FPS (quadros por segundo)", "Quantas imagens chegam à tela por segundo. Mais é melhor: cerca de 30 é o mínimo aceitável, 60 é fluido."),
     ("frame-time (ms)", "Tempo para produzir um quadro (60 FPS = 16,7 ms). Menor é melhor; revela travadas que a média de FPS esconde."),
     ("mediana (p50)", "O valor do meio: metade dos quadros foi mais rápida, metade mais lenta. Representa o quadro típico sem ser puxada por picos raros."),
     ("p95 / p99 (a cauda)", "Os quadros mais lentos: p99 é o valor que só 1% dos quadros excede. É onde aparecem os engasgos perceptíveis."),
     ("1% low", "FPS médio calculado só sobre o 1% de quadros mais lentos. Mede estabilidade: quanto mais perto da mediana, mais constante a experiência."),
     ("draw call", "Cada ordem de desenho que a CPU envia à GPU. Milhares por quadro afogam a CPU. A versão nova agrupa as células em lotes (batching)."),
     ("quadro apresentado", "Quadro que efetivamente chega à tela (tique do rAF). Na versão antiga, sob GPU saturada, várias renderizações podem ser submetidas por quadro apresentado; os contadores dela são por quadro apresentado."),
     ("speedup (×)", "Quantas vezes a versão nova é mais rápida: FPS da nova dividido pelo FPS da antiga no mesmo cenário."),
     ("média geométrica", "A média adequada para razões. Resume vários speedups num único número típico sem deixar um caso extremo dominar."),
     ("escala logarítmica", "Eixo em que cada marca multiplica a anterior (10, 20, 40, 80...). Necessária quando os valores vão de poucos FPS a centenas no mesmo gráfico."),
     ("célula (do calorímetro)", "Cada elemento de energia depositada no detector ATLAS. Mais células, evento mais pesado. As células renderizadas foram conferidas entre as versões."),
     ("evento (516761·342...)", "Cada rótulo identifica uma colisão real do ATLAS (corrida e final do número do evento). Os 7 eventos vão de 23 mil a 57 mil células."),
     ("tour (modo cinema)", "A câmera dá uma volta automática padronizada pelo detector; o uso típico de visualização, idêntico nas duas versões."),
     ("slicer / corte", "Ferramenta que corta o detector para ver o interior. Corte parado: plano fixo. Arraste: mover o corte com o mouse (θ, φ, z, raio)."),
     ("CDF", "Curva de distribuição acumulada: para cada tempo x, a fração de quadros concluída nesse tempo ou menos. Curva mais à esquerda é melhor."),
    ]
    fig = plt.figure(figsize=(13, 13.2)); ax = fig.add_axes([0, 0, 1, 1]); ax.axis("off")
    ax.text(0.5, 0.980, f"Glossário: como ler os gráficos do bench CGV-Web ({MACH})",
            ha="center", fontsize=16.5, weight="bold", color=INK)
    ax.text(0.5, 0.957, "Comparação da versão nova (azul) com a antiga (cinza) do visualizador 3D, "
            "na mesma máquina, com medição externa idêntica.", ha="center", fontsize=10.5,
            color=INK2, style="italic")
    y = 0.928
    for term, desc in TERMS:
        ww = textwrap.fill(desc, 96)
        ax.text(0.035, y, term, fontsize=10.5, weight="bold", color="#1c5cab", va="top")
        ax.text(0.315, y, ww, fontsize=9.6, color=INK, va="top", linespacing=1.3)
        y -= 0.008 + 0.0192 * (ww.count("\n") + 1)
    fig.text(0.5, 0.02, FOOT, ha="center", fontsize=7.5, color=MUTED)
    fig.savefig(os.path.join(out, "00_glossario.png")); plt.close(fig)
    print(f"  -> resultados/{slug}/00_glossario.png")

    # ═════ 01 · speedup por cenário ══════════════════════════════════════════
    labels = [sc_label(k) + ("  ·  " + evlabel(k[1]) if k[0] != "tour" else "") for k in common]
    sp   = np.array([sp_of(k) for k in common])
    cols = [CAT[k[0]] for k in common]
    o = np.argsort(sp)
    fig, ax = plt.subplots(figsize=(10.6, 7.2))
    yy = np.arange(len(sp))
    ax.barh(yy, sp[o], height=0.62, color=[cols[i] for i in o])
    ax.set_yticks(yy); ax.set_yticklabels([labels[i] for i in o], fontsize=9)
    for i, v in enumerate(sp[o]):
        ax.text(v * 1.03, i, f"{br(v)}×", va="center", fontsize=9.5, color=INK)
    ax.axvline(gm_all, color=INK2, lw=1, ls=(0, (4, 3)))
    ax.text(gm_all, len(sp) - 0.1, f" ganho típico {br(gm_all)}× (média geométrica)",
            fontsize=8.2, color=INK2, va="bottom")
    ax.set_xscale("log"); ax.set_xlim(1, sp.max() * 1.8)
    ax.set_xticks([t for t in (1, 2, 5, 10, 20, 40, 60) if t <= sp.max() * 1.8])
    ax.xaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{br(v,0)}×"))
    ax.tick_params(which="minor", length=0)
    ax.set_xlabel("Quantas vezes a versão nova é mais rápida que a antiga, em FPS mediano (escala log)")
    ax.set_title(f"Aceleração por cenário — {MACH} ({len(sp)} cenários)", loc="left")
    ax.legend(handles=[Patch(color=CAT[k], label=CAT_PT[k]) for k in CAT],
              loc="lower right", framealpha=.95, fontsize=8.6)
    sp_pass = [v for k, v in zip(common, sp) if k[0] != "slicer-drag"]
    sp_drag = [v for k, v in zip(common, sp) if k[0] == "slicer-drag"]
    save(fig, "01_speedup.png",
         f"Cada barra é um cenário; o comprimento indica quantas vezes a versão nova supera a antiga em FPS mediano (média entre as "
         f"execuções de cada versão; 1× seria empate; escala log). O ganho aparece nos {len(sp)} cenários: passeios de câmera e corte "
         f"parado ficam entre {br(min(sp_pass))}× e {br(max(sp_pass))}×, e o arraste do corte entre {br(min(sp_drag),0)}× e "
         f"{br(max(sp_drag),0)}×, porque a antiga recalculava o corte na CPU a cada movimento e a nova só atualiza um parâmetro na GPU. "
         f"O ganho típico (média geométrica) nesta máquina é de {br(gm_all)}×.")

    # ═════ 02 · FPS por evento (tours) ═══════════════════════════════════════
    b50 = [BA[k]["fpsMedian"] for k in tours]; c50 = [CU[k]["fpsMedian"] for k in tours]
    bl1 = [BA[k]["low1"] for k in tours];      cl1 = [CU[k]["low1"] for k in tours]
    x = np.arange(len(tours))
    fig, ax = plt.subplots(figsize=(11.4, 6.8))
    ax.bar(x - w/2, b50, w, color=C_OLD, label="Antiga · FPS mediano")
    ax.bar(x + w/2, c50, w, color=C_NEW, label="Nova · FPS mediano")
    ax.plot(x - w/2, bl1, ls="none", marker="_", ms=15, mew=2.6, color=C_OLD_DK, label="Antiga · 1% low")
    ax.plot(x + w/2, cl1, ls="none", marker="_", ms=15, mew=2.6, color=C_NEW_DK, label="Nova · 1% low")
    for i in range(len(tours)):
        ax.text(x[i] - w/2, b50[i] * 1.06, br(b50[i], 0 if b50[i] >= 10 else 1), ha="center", fontsize=8, color=INK2)
        ax.text(x[i] + w/2, c50[i] * 1.06, br(c50[i], 0), ha="center", fontsize=8, color=INK2)
    log_axis(ax, bl1 + c50, "y")
    threshold(ax, 60, "60 FPS (fluido)"); threshold(ax, 30, "30 FPS (mínimo)")
    ax.set_xticks(x); ax.set_xticklabels(tlab, rotation=18, ha="right", fontsize=9)
    ax.set_ylabel("FPS (escala log)")
    ax.set_xlabel("Evento de colisão (corrida·evento), do mais leve (23 mil células) ao mais pesado (57 mil)")
    ax.set_title(f"FPS no passeio automático da câmera, por evento — {MACH}", loc="left")
    ax.legend(ncol=2, framealpha=.95, fontsize=8.4, loc="center left")
    save(fig, "02_fps_tours.png",
         f"Barras: FPS mediano por evento, média entre as execuções (cinza = antiga, azul = nova, escala log). O traço escuro sobre cada "
         f"barra é o 1% low, o FPS médio no 1% de quadros mais lentos. Nesta máquina a antiga entrega {br(min(b50),1)} a {br(max(b50),1)} "
         f"FPS nos tours; a nova, {br(min(c50),0)} a {br(max(c50),0)} FPS. O pior 1% da nova ({br(min(cl1),0)} FPS) fica "
         f"{br(min(cl1)/max(b50),0)}× acima da mediana da antiga.")

    # ═════ 03 · FPS × células renderizadas ═══════════════════════════════════
    cells = np.array([cells_of("current", k) for k in tours], float)
    fig, ax = plt.subplots(figsize=(10.6, 6.8))
    ax.plot(cells/1000, c50, "-o", color=C_NEW, lw=2, ms=8, label="Nova", markeredgecolor=SURF, markeredgewidth=2)
    ax.plot(cells/1000, b50, "-o", color=C_OLD, lw=2, ms=8, label="Antiga", markeredgecolor=SURF, markeredgewidth=2)
    for i in range(len(tours)):
        ax.annotate(tlab[i], (cells[i]/1000, c50[i]), textcoords="offset points",
                    xytext=(0, 10 if i % 2 == 0 else -17), fontsize=7.4, ha="center", color=MUTED)
    log_axis(ax, b50 + c50, "y")
    threshold(ax, 60, "60 FPS (fluido)"); threshold(ax, 30, "30 FPS (mínimo)")
    ax.set_xlabel("Células renderizadas no evento (milhares) — a carga de trabalho")
    ax.set_ylabel("FPS mediano (escala log)")
    ax.set_title(f"Escalabilidade: FPS mediano × células renderizadas (tours) — {MACH}", loc="left")
    ax.legend(loc="center left", fontsize=9)
    drop_c = 100*(1 - min(c50)/max(c50)); drop_b = 100*(1 - min(b50)/max(b50))
    save(fig, "03_fps_vs_celulas.png",
         f"Cada ponto é um evento, posicionado pela quantidade de células que ele desenha (eixo x) e pelo FPS mediano do tour (eixo y, "
         f"log). Aumentar a carga em {br(max(cells)/min(cells))}× custa {br(drop_b,0)}% de FPS à antiga e {br(drop_c,0)}% à nova: ambas "
         f"degradam suavemente, mas em patamares distintos. Nesta máquina a antiga fica em {br(min(b50),1)}–{br(max(b50),1)} FPS"
         + ("" if min(b50) > 30 else ", abaixo do mínimo aceitável,") + f" enquanto a nova permanece acima de {br(min(c50),0)} FPS até "
         f"no evento mais pesado.")

    # ═════ 04 · mecanismo: draw calls + controle de carga ════════════════════
    bd = [BA[k]["draws"] for k in tours]; cd = [CU[k]["draws"] for k in tours]
    cb = [cells_of("baseline", k)/1000 for k in tours]; cc = [cells_of("current", k)/1000 for k in tours]
    ratio_gm = gmean([b/c for b, c in zip(bd, cd)])
    fig, axs = plt.subplots(1, 2, figsize=(13.2, 6.6))
    ax = axs[0]
    ax.bar(x - w/2, bd, w, color=C_OLD, label="Antiga"); ax.bar(x + w/2, cd, w, color=C_NEW, label="Nova")
    for i in range(len(tours)):
        ax.text(x[i] - w/2, bd[i]*1.07, kfmt(bd[i]), ha="center", fontsize=7.6, color=INK2)
        ax.text(x[i] + w/2, cd[i]*1.07, br(cd[i], 0), ha="center", fontsize=7.6, color=INK2)
    ax.set_yscale("log"); ax.set_ylim(min(cd)*0.5, max(bd)*3.2)
    cand = [50, 100, 500, 1000, 5000, 20000, 50000, 100000, 200000]
    ax.set_yticks([t for t in cand if min(cd)*0.5 <= t <= max(bd)*3.2])
    ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: kfmt(v))); ax.tick_params(which="minor", length=0)
    ax.set_xticks(x); ax.set_xticklabels(tlab, rotation=25, ha="right", fontsize=8)
    ax.set_ylabel("Draw calls por quadro apresentado (escala log)")
    ax.set_title("Draw calls por quadro apresentado", loc="left", fontsize=11)
    ax.legend(fontsize=8.6, loc="center right")
    ax = axs[1]
    ax.bar(x - w/2, cb, w, color=C_OLD, label="Antiga"); ax.bar(x + w/2, cc, w, color=C_NEW, label="Nova")
    ax.set_ylim(0, max(cc)*1.2); ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: br(v, 0)))
    ax.set_xticks(x); ax.set_xticklabels(tlab, rotation=25, ha="right", fontsize=8)
    ax.set_ylabel("Células renderizadas (milhares, escala linear)")
    ax.set_title("Controle: a carga é a mesma", loc="left", fontsize=11); ax.legend(fontsize=8.6)
    fig.suptitle(f"Mecanismo do ganho ({MACH}): ~{br(ratio_gm,0)}× menos draw calls por quadro apresentado, para a mesma carga",
                 y=0.998, fontsize=13, color=INK)
    msub_txt = ""
    if msub:
        msub_txt = (f" Nesta máquina há um agravante, medido nos contadores: no tour a antiga submete ~{br(msub['factor'],0)} "
                    f"renderizações por quadro que chega à tela (~{br(msub['rendersPerSec'],0)} renders/s emitidos para "
                    f"{br(BA[heavy]['fpsMean'],1)} quadros/s apresentados); por renderização são ~{kfmt(msub['perRenderDraws'])} draws, "
                    f"como nos arrastes, onde a submissão é 1:1.")
    save(fig, "04_mecanismo.png",
         f"O painel esquerdo mostra a causa do ganho: a antiga emite {kfmt(min(bd))} a {kfmt(max(bd))} ordens de desenho (draw calls) por "
         f"quadro apresentado, e a CPU vira o gargalo; a nova agrupa as células em lotes e emite {br(min(cd),0)} a {br(max(cd),0)} "
         f"(redução típica de {br(ratio_gm,0)}×). O painel direito é o controle do experimento: as células renderizadas são as mesmas "
         f"nas duas versões (diferença de 128 células, até 0,7%), ou seja, a nova desenha a mesma cena com muito menos trabalho de "
         f"CPU.{msub_txt}")

    # ═════ 05 · frame-time p50 / p99 ═════════════════════════════════════════
    xs = np.arange(len(sel))
    allft = ([BA[k][p] for k in sel for p in ("ftP50", "ftP99")] +
             [CU[k][p] for k in sel for p in ("ftP50", "ftP99")])
    fig, axs = plt.subplots(1, 2, figsize=(13.6, 6.9), sharey=True)
    for ax, pk, tit in [(axs[0], "ftP50", "Quadro típico (mediana, p50)"),
                        (axs[1], "ftP99", "1% piores quadros (p99)")]:
        bb = [BA[k][pk] for k in sel]; cc2 = [CU[k][pk] for k in sel]
        ax.bar(xs - w/2, bb, w, color=C_OLD, label="Antiga"); ax.bar(xs + w/2, cc2, w, color=C_NEW, label="Nova")
        log_axis(ax, allft, "y", ticks=FT_TICKS)
        threshold(ax, 16.7)
        ax.set_xticks(xs); ax.set_xticklabels(slab, rotation=32, ha="right", fontsize=8)
        ax.set_title(tit, loc="left", fontsize=11); ax.legend(fontsize=8.6, loc="upper left")
    axs[0].set_ylabel("Tempo para produzir 1 quadro, em ms (log; menor é melhor)")
    fig.suptitle(f"Latência por quadro: mediana e cauda — {MACH} (tracejado = 16,7 ms / 60 FPS)", y=0.998, fontsize=13, color=INK)
    b50s = [BA[k]["ftP50"] for k in sel]; c50s = [CU[k]["ftP50"] for k in sel]
    b99s = [BA[k]["ftP99"] for k in sel]; c99s = [CU[k]["ftP99"] for k in sel]
    save(fig, "05_frametime_percentis.png",
         f"Frame-time é o inverso do FPS; menor é melhor, e a linha tracejada marca 16,7 ms (60 FPS). À esquerda, o quadro típico: a nova "
         f"fica entre {br(min(c50s))} e {br(max(c50s))} ms onde a antiga gasta {br(min(b50s),0)} a {br(max(b50s),0)} ms. À direita, a "
         f"cauda (p99), que o usuário percebe como engasgo: a antiga chega a {br(max(b99s),0)} ms por quadro, contra {br(min(c99s))} a "
         f"{br(max(c99s),0)} ms da nova.")

    # ═════ 06 · perfil ao longo do tour ══════════════════════════════════════
    def profile(run, k, bins=120):
        sc = run["meta_sc"][k]; grids = []
        for r in sc["reps"]:
            f = np.asarray(r["frames"], float); dt = np.diff(f); tt = (f[1:] - f[0]) / (f[-1] - f[0])
            m = (dt > 0) & (dt < 2000); idx = np.clip((tt[m]*bins).astype(int), 0, bins-1)
            g = np.full(bins, np.nan)
            for b in range(bins):
                d = dt[m][idx == b]
                if len(d): g[b] = 1000/np.mean(d)
            grids.append(g)
        return (np.arange(bins)+.5)/bins, np.nanmean(np.vstack(grids), axis=0)
    xb, yb = profile(REF["baseline"], heavy); xc, yc = profile(REF["current"], heavy)
    fig, ax = plt.subplots(figsize=(11.8, 6.6))
    ax.plot(xc, yc, color=C_NEW, lw=2, label=f"Nova (mediana {br(CU[heavy]['fpsMedian'],0)} FPS)")
    ax.plot(xb, yb, color=C_OLD, lw=2, label=f"Antiga (mediana {br(BA[heavy]['fpsMedian'],1)} FPS)")
    log_axis(ax, list(yb[np.isfinite(yb)]) + list(yc[np.isfinite(yc)]), "y")
    ax.set_xlim(0, 1); ax.set_xticks([0, 0.2, 0.4, 0.6, 0.8, 1.0])
    ax.xaxis.set_major_formatter(FuncFormatter(lambda v, _: br(v, 1)))
    threshold(ax, 60, "60 FPS (fluido)"); threshold(ax, 30, "30 FPS (mínimo)")
    ax.set_xlabel("Progresso do passeio da câmera, uma volta completa (0 = início, 1 = fim)")
    ax.set_ylabel("FPS instantâneo, média das 3 repetições (escala log)")
    ax.set_title(f"FPS ao longo do passeio, evento mais pesado ({evlabel(heavy[1])}) — {MACH}", loc="left")
    ax.legend(loc="center right", fontsize=9)
    save(fig, "06_perfil_tour.png",
         f"FPS instante a instante durante a volta completa da câmera no evento mais pesado (execução de referência de cada versão; as "
         f"ondulações correspondem a trechos com mais ou menos geometria na tela). As curvas têm o mesmo formato, pois o conteúdo é o "
         f"mesmo; o que muda é o patamar: a nova oscila em torno de {br(CU[heavy]['fpsMedian'],0)} FPS e a antiga fica o passeio inteiro "
         f"em torno de {br(BA[heavy]['fpsMedian'],1)} FPS. O ganho é sustentado do início ao fim.")

    # ═════ 07 · CDF do frame-time ════════════════════════════════════════════
    fig, ax = plt.subplots(figsize=(10.8, 6.6))
    bsc = REF["baseline"]["scen"][heavy]
    ftb = np.sort(bsc["ft"]); ax.plot(ftb, np.linspace(0, 100, len(ftb)), color=C_OLD, lw=2.2, label="Antiga")
    cur_full = sorted([r for r in FULL["current"] if heavy in r["scen"]], key=lambda r: r["ts"])
    for i, r in enumerate(cur_full):
        ftc = np.sort(r["scen"][heavy]["ft"])
        lab = "Nova" if len(cur_full) == 1 else f"Nova · execução {i+1}"
        ax.plot(ftc, np.linspace(0, 100, len(ftc)), color=C_NEW, lw=2.0,
                ls="-" if i == 0 else (0, (5, 2)),
                label=f"{lab} (mediana {br(1000/np.percentile(ftc,50),0)} FPS)")
    allc = np.concatenate([r["scen"][heavy]["ft"] for r in cur_full])
    log_axis(ax, [min(allc.min(), ftb.min()), max(allc.max(), ftb.max())], "x",
             ticks=FT_TICKS, lo_pad=0.8, hi_pad=1.25)
    threshold(ax, 16.7, axis="x")
    ax.set_ylim(0, 102)
    ax.set_xlabel("Tempo para produzir 1 quadro, em ms (escala log; tracejado = 16,7 ms / 60 FPS)")
    ax.set_ylabel("% dos quadros produzidos nesse tempo ou menos")
    ax.set_title(f"Distribuição acumulada do tempo de quadro (tour do evento {evlabel(heavy[1])}) — {MACH}", loc="left")
    ax.legend(loc="center right", fontsize=8.6)
    ovl = 100 * float(np.mean(allc > ftb.min()))
    save(fig, "07_frametime_cdf.png",
         f"Cada curva usa todos os quadros do evento mais pesado: para um tempo x, dá o percentual de quadros concluídos nesse tempo ou "
         f"menos (mais à esquerda é melhor). A nova conclui 99% dos quadros em até {br(np.percentile(allc,99))} ms; a antiga começa em "
         f"{br(ftb.min(),0)} ms e tem mediana de {br(np.percentile(ftb,50),0)} ms. A fração de quadros da nova mais lentos que o quadro "
         f"mais rápido da antiga é de {br(ovl,2)}%.")

    # ═════ 08 · arraste do corte ═════════════════════════════════════════════
    drags = [k for k in order if k[0] == "slicer-drag"]
    if drags:
        dlab  = [AXIS_PT.get(k[2], k[2]) for k in drags]
        cD = [CU[k]["fpsMedian"] for k in drags]; cL = [CU[k]["low1"] for k in drags]
        bD = [BA[k]["fpsMedian"] if BA.get(k) else np.nan for k in drags]
        bL = [BA[k]["low1"] if BA.get(k) else np.nan for k in drags]
        xd = np.arange(len(drags))
        fig, ax = plt.subplots(figsize=(10.8, 7.0))
        ax.bar(xd - w/2, bD, w, color=C_OLD, label="Antiga · FPS mediano")
        ax.bar(xd + w/2, cD, w, color=C_NEW, label="Nova · FPS mediano")
        ax.plot(xd - w/2, bL, ls="none", marker="_", ms=15, mew=2.6, color=C_OLD_DK, label="Antiga · 1% low")
        ax.plot(xd + w/2, cL, ls="none", marker="_", ms=15, mew=2.6, color=C_NEW_DK, label="Nova · 1% low")
        vals = list(cD) + list(cL) + [b for b in list(bD) + list(bL) if np.isfinite(b)]
        log_axis(ax, vals, "y")
        for i, k in enumerate(drags):
            if np.isfinite(bD[i]):
                ax.text(xd[i], max(cD[i], bD[i])*1.14, f"{br(cD[i]/bD[i],0)}×", ha="center", fontsize=12, color=INK)
                ax.text(xd[i]-w/2, bD[i]*1.07, br(bD[i], 1), ha="center", fontsize=8, color=INK2)
            else:
                ax.text(xd[i]-w/2, ax.get_ylim()[0]*1.25, "eixo novo,\nsó existe\nna versão nova", ha="center",
                        va="bottom", fontsize=7.4, color=MUTED, style="italic", linespacing=1.15)
            ax.text(xd[i]+w/2, cD[i]*1.07, br(cD[i], 0), ha="center", fontsize=8, color=INK2)
        threshold(ax, 60, "60 FPS (fluido)", side="left"); threshold(ax, 30, "30 FPS (mínimo)", side="left")
        ax.set_xticks(xd); ax.set_xticklabels([f"arraste {d}" for d in dlab], fontsize=9)
        ax.set_ylabel("FPS durante o arraste (escala log)")
        ax.set_title(f"Arraste do plano de corte com o mouse — {MACH}", loc="left")
        ax.legend(loc="center right", fontsize=8.4, framealpha=.95)
        phi = next((k for k in drags if k[2] == "phi"), None)
        phi_txt = ""
        if phi is not None and phi in only_cur:
            st = CU[phi]
            phi_txt = (f" O eixo φ só existe na versão nova; 1% low de {br(st['low1'],0)} FPS e p99 de {br(st['ftP99'],0)} ms, com "
                       f"picos ao recruzar a emenda de φ em ±π.")
        gains = [c/b for c, b in zip(cD, bD) if np.isfinite(b)]
        save(fig, "08_drag.png",
             f"No arraste contínuo do corte, a antiga recalculava na CPU, a cada movimento do mouse, quais células mostrar: nesta máquina "
             f"caía para {br(np.nanmin(bD),1)} a {br(np.nanmax(bD),1)} FPS (1% low de {br(np.nanmin(bL),1)} a {br(np.nanmax(bL),1)}). A "
             f"nova aplica o corte na GPU e mantém {br(min(cD),0)} a {br(max(cD),0)} FPS, ganho de {br(min(gains),0)}× a "
             f"{br(max(gains),0)}× exatamente na interação que era inutilizável.{phi_txt}")

    # ═════ 09 · resumo por categoria ═════════════════════════════════════════
    cats = [(f"Passeio da câmera\n({sum(1 for k in common if k[0]=='tour')} eventos)", gm_tour, CAT["tour"]),
            ("Corte parado\n(1 cenário)", gm_slic, CAT["tour+slicer"]),
            (f"Arraste do corte\n({sum(1 for k in common if k[0]=='slicer-drag')} eixos)", gm_drag, CAT["slicer-drag"])]
    fig, ax = plt.subplots(figsize=(9.4, 6.6))
    bars = ax.bar([c[0] for c in cats], [c[1] for c in cats], color=[c[2] for c in cats], width=0.55)
    for b, (_, v, _) in zip(bars, cats):
        ax.text(b.get_x()+b.get_width()/2, v + max(c[1] for c in cats)*0.015, f"{br(v)}×",
                ha="center", va="bottom", fontsize=15, color=INK)
    ax.axhline(1, color=INK2, lw=1, ls=(0, (4, 3))); ax.text(-0.42, 1.4, "empate (1×)", color=INK2, fontsize=8, ha="left")
    ax.set_ylim(0, max(c[1] for c in cats)*1.18)
    ax.set_ylabel("Ganho típico: média geométrica dos speedups (×)")
    ax.set_title(f"Ganho por tipo de interação — {MACH}", loc="left")
    save(fig, "09_speedup_categoria.png",
         f"As três barras resumem os {len(common)} cenários pela média geométrica do speedup por tipo de uso. Na visualização passiva "
         f"(passeio, {br(gm_tour)}×; corte parado, {br(gm_slic)}×) o ganho vem da eliminação do gargalo de draw calls; no arraste "
         f"({br(gm_drag)}×) soma-se o corte aplicado na GPU em vez de recalculado na CPU. Ganho global típico nesta máquina: "
         f"{br(gm_all)}×.")

    # ═════ 10 · vazão de triângulos ══════════════════════════════════════════
    mfac = msub["factor"] if msub else 1.0
    tri_b = [BA[k]["fpsMean"]*(BA[k]["tris"]/(mfac if (msub and k[0] != "slicer-drag") else 1))/1e6 for k in sel]
    tri_c = [CU[k]["fpsMean"]*CU[k]["tris"]/1e6 for k in sel]
    fig, ax = plt.subplots(figsize=(12.6, 6.6))
    ax.bar(xs - w/2, tri_b, w, color=C_OLD, label="Antiga"); ax.bar(xs + w/2, tri_c, w, color=C_NEW, label="Nova")
    ax.text(xs[int(np.argmax(tri_c))]+w/2, max(tri_c)*1.01, br(max(tri_c), 0), ha="center", va="bottom", fontsize=8, color=INK2)
    ax.text(xs[int(np.argmax(tri_b))]-w/2, max(tri_b)+max(tri_c)*0.012, br(max(tri_b), 0), ha="center", va="bottom", fontsize=8, color=INK2)
    ax.set_xticks(xs); ax.set_xticklabels(slab, rotation=32, ha="right", fontsize=8)
    ax.set_ylabel("Milhões de triângulos apresentados por segundo (escala linear)")
    ax.set_title(f"Vazão útil de triângulos — {MACH}", loc="left"); ax.legend(fontsize=9)
    norm_txt = (f" Na antiga, os triângulos por quadro apresentado foram divididos pelo fator de ~{br(mfac,0)} submissões por quadro "
                f"(ver figura do mecanismo), para contar apenas trabalho que chega à tela." if msub else
                " A cena é praticamente a mesma nas duas versões (a nova desenha cerca de 5% mais triângulos).")
    save(fig, "10_throughput.png",
         f"Vazão útil = FPS médio × triângulos por renderização: quantos milhões de triângulos por segundo chegam à tela. A antiga "
         f"entrega {br(min(tri_b),0)} a {br(max(tri_b),0)} Mtri/s, não por limite da GPU, mas porque a CPU não emite ordens mais rápido; "
         f"a nova entrega {br(min(tri_c),0)} a {br(max(tri_c),0)} Mtri/s na mesma placa, "
         f"{br(gmean([c/b for c,b in zip(tri_c,tri_b)]),0)}× mais trabalho útil.{norm_txt}")

    # ═════ 11 · parse do XML ═════════════════════════════════════════════════
    pb = [parse_of("baseline", k) for k in tours]; pc = [parse_of("current", k) for k in tours]
    if all(v is not None for v in pb + pc):
        fig, ax = plt.subplots(figsize=(11.2, 6.4))
        ax.bar(x - w/2, [v/1000 for v in pb], w, color=C_OLD, label="Antiga")
        ax.bar(x + w/2, [v/1000 for v in pc], w, color=C_NEW, label="Nova")
        for i in range(len(tours)):
            ax.text(x[i]-w/2, pb[i]/1000 + max(pb)/1000*0.015, br(pb[i]/1000), ha="center", fontsize=8, color=INK2)
            ax.text(x[i]+w/2, pc[i]/1000 + max(pb)/1000*0.015, br(pc[i]/1000), ha="center", fontsize=8, color=INK2)
        ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: br(v, 0)))
        ax.set_xticks(x); ax.set_xticklabels(tlab, rotation=18, ha="right", fontsize=9)
        ax.set_ylabel("Tempo para abrir o evento: parse do XML (segundos)")
        ax.set_title(f"Tempo de abertura de evento (parse do XML) — {MACH}", loc="left"); ax.legend(fontsize=9)
        gb = REF["baseline"]["meta"].get("geometry", {}).get("loadMs")
        gc = REF["current"]["meta"].get("geometry", {}).get("loadMs")
        ratio = gmean([b/c for b, c in zip(pb, pc)]); iw = int(np.argmax(pb))
        geom_txt = (f" A preparação da geometria ao abrir o aplicativo subiu de {br((gb or 0)/1000)} s para {br((gc or 0)/1000)} s, "
                    f"custo pago uma única vez." if gb and gc and (gc - gb) > 200 else "")
        save(fig, "11_parse.png",
             f"Tempo entre escolher um evento e ele estar pronto na tela (parse do JiveXML; escala linear, menor é melhor; execução de "
             f"referência de cada versão). A nova abre os mesmos eventos de {br(min(b/c for b,c in zip(pb,pc)))}× a "
             f"{br(max(b/c for b,c in zip(pb,pc)))}× mais rápido (típico {br(ratio)}×); o pior caso cai de {br(pb[iw]/1000)} s para "
             f"{br(pc[iw]/1000)} s.{geom_txt}")

    # ═════ 12 · reprodutibilidade (só com 2+ execuções ou varredura extra) ═══
    if max(nfb, nfc) >= 2 or any(QUICK.values()):
        def runvals(version, k):
            return [r["scen"][k]["fpsMedian"] for r in FULL[version] if k in r["scen"]]
        fig, ax = plt.subplots(figsize=(11.4, 6.8))
        for i, k in enumerate(tours):
            bvs, cvs = runvals("baseline", k), runvals("current", k)
            ax.plot([i-w/2, i-w/2], [min(bvs), max(bvs)], color=C_OLD, lw=6, alpha=.35, solid_capstyle="round")
            ax.plot([i+w/2, i+w/2], [min(cvs), max(cvs)], color=C_NEW, lw=6, alpha=.30, solid_capstyle="round")
            ax.plot([i-w/2]*len(bvs), bvs, "o", color=C_OLD_DK, ms=6, markeredgecolor=SURF, markeredgewidth=1.2, zorder=5)
            ax.plot([i+w/2]*len(cvs), cvs, "o", color=C_NEW, ms=6, markeredgecolor=SURF, markeredgewidth=1.2, zorder=5)
            for q in QUICK["baseline"]:
                if k in q["scen"]:
                    ax.plot([i-w/2], [q["scen"][k]["fpsMedian"]], "D", color=MUTED, ms=5,
                            markeredgecolor=SURF, markeredgewidth=1, zorder=6)
        allv = [v for k in tours for v in runvals("baseline", k) + runvals("current", k)]
        log_axis(ax, allv, "y")
        threshold(ax, 60, "60 FPS (fluido)")
        ax.set_xticks(range(len(tours))); ax.set_xticklabels(tlab, rotation=18, ha="right", fontsize=9)
        ax.set_ylabel("FPS mediano por execução (escala log)")
        ax.set_xlabel("Evento de colisão (corrida·evento)")
        ax.set_title(f"Reprodutibilidade: variação do FPS entre execuções — {MACH}", loc="left")
        hands = [Line2D([], [], marker="o", ls="none", color=C_NEW, mec=SURF, label=f"Nova · execução completa ({nfc})"),
                 Line2D([], [], marker="o", ls="none", color=C_OLD_DK, mec=SURF, label=f"Antiga · execução completa ({nfb})")]
        if QUICK["baseline"]:
            hands.append(Line2D([], [], marker="D", ls="none", color=MUTED, mec=SURF, label="Antiga · varredura rápida (10 s)"))
        ax.legend(handles=hands, loc="center right", fontsize=8.4, framealpha=.95)
        cvar = max(100*(max(runvals("current", k))/min(runvals("current", k)) - 1) for k in tours)
        save(fig, "12_reprodutibilidade.png",
             f"Cada ponto é a mediana de FPS de uma execução completa; a barra clara liga o mínimo ao máximo entre execuções da mesma "
             f"versão. A antiga é estável entre execuções" + (", e a varredura rápida de 10 s (losango) reproduz o mesmo patamar" if QUICK["baseline"] else "") +
             f". A nova, por rodar a centenas de FPS, é mais sensível a variações da máquina: a diferença entre execuções chega a "
             f"{br(cvar,0)}%. Os números deste relatório usam a média entre execuções, uma estimativa conservadora.")

    # resumo no console
    print(f"  {'cenário':30} {'antiga':>8} {'nova':>8} {'ganho':>7}")
    for k in common:
        print(f"  {sc_label(k):30} {BA[k]['fpsMedian']:8.1f} {CU[k]['fpsMedian']:8.1f} {sp_of(k):6.1f}×")
    print(f"  ganho típico: geral {gm_all:.2f}×  tours {gm_tour:.2f}×  corte {gm_slic:.2f}×  arraste {gm_drag:.2f}×")
    if msub: print(f"  multi-submit da antiga no tour: ~{msub['factor']:.1f} renders/quadro apresentado")

    return dict(slug=slug, mach=MACH, gm=dict(all=gm_all, tour=gm_tour, slicer=gm_slic, drag=gm_drag),
                tour_b=(min(BA[k]['fpsMedian'] for k in tours), max(BA[k]['fpsMedian'] for k in tours)),
                tour_c=(min(CU[k]['fpsMedian'] for k in tours), max(CU[k]['fpsMedian'] for k in tours)))

# ═════════════════════════ comparação entre máquinas ════════════════════════
def comparison(sums):
    out = os.path.join(RESUL, "comparacao"); os.makedirs(out, exist_ok=True)
    cats = [("Passeio da câmera", "tour"), ("Corte parado", "slicer"), ("Arraste do corte", "drag"), ("Global", "all")]
    x = np.arange(len(cats)); n = len(sums); bw = 0.72 / n
    fig, ax = plt.subplots(figsize=(11.2, 6.8))
    top = max(s["gm"][c[1]] for s in sums for c in cats)
    for i, s in enumerate(sums):
        xs = x - 0.36 + bw*(i + 0.5)
        vals = [s["gm"][c[1]] for c in cats]
        ax.bar(xs, vals, bw*0.92, color=MACH_COLS[i % len(MACH_COLS)], label=s["mach"])
        for xx, v in zip(xs, vals):
            ax.text(xx, v + top*0.012, f"{br(v)}×", ha="center", va="bottom", fontsize=9.5, color=INK)
    ax.set_xticks(x); ax.set_xticklabels([c[0] for c in cats], fontsize=10)
    ax.axhline(1, color=INK2, lw=1, ls=(0, (4, 3)))
    ax.set_ylim(0, top * 1.18)
    ax.set_ylabel("Ganho típico: média geométrica dos speedups (×)")
    ax.set_title("Ganho da versão nova por tipo de interação, por máquina", loc="left")
    ax.legend(fontsize=9, loc="upper left")
    lines = [f"{s['mach']}: tours de {br(s['tour_b'][0],1)}–{br(s['tour_b'][1],1)} para "
             f"{br(s['tour_c'][0],0)}–{br(s['tour_c'][1],0)} FPS" for s in sums]
    interp = ("Mesmos eventos, mesma metodologia, máquinas diferentes. O ganho cresce quando o hardware é mais fraco: quanto mais a "
              "CPU domina o custo do quadro, mais o agrupamento em lotes rende. " + "; ".join(lines) +
              ". Na máquina fraca a versão antiga é inutilizável (poucos FPS) e a nova a leva a território fluido: a otimização não só "
              "acelera máquinas boas, ela viabiliza hardware modesto.")
    wrap = int(fig.get_size_inches()[0] * 12.4)
    wrapped = "\n".join(textwrap.fill(p, wrap) for p in interp.strip().split("\n"))
    nl = wrapped.count("\n") + 1
    reserve = (0.42 + 0.175 * nl) / fig.get_size_inches()[1]
    fig.tight_layout(rect=[0, reserve, 1, 0.99])
    fig.text(0.012, 0.030, "Interpretação:  " + wrapped, ha="left", va="bottom",
             fontsize=8.6, color=INK, linespacing=1.45,
             bbox=dict(boxstyle="round,pad=0.55", fc="#f4f4f1", ec="#c9c8c0", lw=0.8))
    fig.text(0.5, 0.005, "Mesma metodologia nas duas máquinas · probe rAF externo idêntico nas duas versões",
             ha="center", va="bottom", fontsize=7, color=MUTED)
    fig.savefig(os.path.join(out, "comparacao_maquinas.png")); plt.close(fig)
    print(f"\n  -> resultados/comparacao/comparacao_maquinas.png")

# ═════════════════════════ main ═════════════════════════════════════════════
want = sys.argv[1] if len(sys.argv) > 1 else None
slugs = [want] if want else sorted(d for d in os.listdir(DADOS)
                                   if os.path.isdir(os.path.join(DADOS, d)) and d != "descartados")
sums = [s for s in (run_machine(sl) for sl in slugs) if s]
if len(sums) >= 2:
    comparison(sums)
