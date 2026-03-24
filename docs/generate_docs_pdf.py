#!/usr/bin/env python3
"""
CGV WEB Technical Documentation — PDF Generator
Usage : py generate_docs_pdf.py
Output: docs/CGV_WEB_Documentation.pdf
"""
import os, sys

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import cm, mm
    from reportlab.lib.colors import HexColor, white, black
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        PageBreak, KeepTogether, HRFlowable, Preformatted,
    )
    from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
except ImportError:
    sys.exit("ERROR: pip install reportlab")

# ── Register fonts ──────────────────────────────────────────────────────────────
_FD = r'C:\Windows\Fonts'
pdfmetrics.registerFont(TTFont('MF',    _FD + r'\arial.ttf'))
pdfmetrics.registerFont(TTFont('MF-B',  _FD + r'\arialbd.ttf'))
pdfmetrics.registerFont(TTFont('MF-I',  _FD + r'\ariali.ttf'))
pdfmetrics.registerFont(TTFont('MF-BI', _FD + r'\arialbi.ttf'))
pdfmetrics.registerFont(TTFont('CF',    _FD + r'\cour.ttf'))
pdfmetrics.registerFont(TTFont('CF-B',  _FD + r'\courbd.ttf'))
pdfmetrics.registerFontFamily('MF', normal='MF', bold='MF-B',
                               italic='MF-I', boldItalic='MF-BI')
pdfmetrics.registerFontFamily('CF', normal='CF', bold='CF-B')

# ── Colors ──────────────────────────────────────────────────────────────────────
CA   = HexColor('#1a5276')
CA2  = HexColor('#2980b9')
CBD  = HexColor('#d5dce4')
CCB  = HexColor('#f4f6f9')
CCBD = HexColor('#dce3eb')
CT2  = HexColor('#4a4a6a')
CSB  = HexColor('#f8fafc')
CNB  = HexColor('#eaf2f8')
CWB  = HexColor('#fef9e7')
CWBD = HexColor('#f39c12')
CGT  = HexColor('#888888')
CDG  = HexColor('#e8f0f6')
CDGA = HexColor('#cce0f5')
CDGB = HexColor('#93b7d0')
CROW = HexColor('#f8fafc')

# ── Page geometry ───────────────────────────────────────────────────────────────
PW, PH = A4
ML = MR = 2.0 * cm
MT = MB = 2.5 * cm
CW = PW - ML - MR   # ~170 mm

# ── Styles ──────────────────────────────────────────────────────────────────────
def S(name, **kw):
    return ParagraphStyle(name, **kw)

SBODY = S('SBODY', fontName='MF',   fontSize=10,   leading=15,
          textColor=HexColor('#1a1a2e'), alignment=TA_JUSTIFY, spaceAfter=6)
SH1   = S('SH1',   fontName='MF-B', fontSize=22,   leading=28,
          textColor=CA, alignment=TA_CENTER, spaceAfter=8)
SH2   = S('SH2',   fontName='MF-B', fontSize=15,   leading=20,
          textColor=CA, spaceBefore=18, spaceAfter=8)
SH3   = S('SH3',   fontName='MF-B', fontSize=12,   leading=16,
          textColor=CA, spaceBefore=12, spaceAfter=5)
SH4   = S('SH4',   fontName='MF-B', fontSize=10.5, leading=14,
          textColor=CA, spaceBefore=10, spaceAfter=4)
SSUB  = S('SSUB',  fontName='MF-I', fontSize=12,   leading=16,
          textColor=CT2, alignment=TA_CENTER, spaceAfter=4)
SMETA = S('SMETA', fontName='MF',   fontSize=9,    leading=13,
          textColor=CGT, alignment=TA_CENTER, spaceAfter=20)
SCODE = S('SCODE', fontName='CF',   fontSize=8.5,  leading=13,
          textColor=HexColor('#1a1a2e'))
SNOTE = S('SNOTE', fontName='MF',   fontSize=9.5,  leading=14,
          textColor=HexColor('#1a1a2e'))
SLIST = S('SLIST', fontName='MF',   fontSize=10,   leading=15,
          textColor=HexColor('#1a1a2e'), leftIndent=14, spaceAfter=3)
SFOOT = S('SFOOT', fontName='MF',   fontSize=8,    leading=12,
          textColor=CGT, alignment=TA_CENTER)
SDBOX = S('SDBOX', fontName='MF-B', fontSize=9,    leading=13,
          alignment=TA_CENTER, textColor=HexColor('#1a1a2e'))
SARR  = S('SARR',  fontName='MF-B', fontSize=14,   leading=18,
          alignment=TA_CENTER, textColor=CA2)
STOC  = S('STOC',  fontName='MF-B', fontSize=10.5, leading=17, textColor=CA)
STOC1 = S('STOC1', fontName='MF',   fontSize=10,   leading=15,
          textColor=HexColor('#1a1a2e'), leftIndent=16)
STOC2 = S('STOC2', fontName='MF',   fontSize=9,    leading=14,
          textColor=CT2, leftIndent=32)

# ── Helpers ─────────────────────────────────────────────────────────────────────
def pp(text, s=None):   return Paragraph(text, s or SBODY)
def sp(h=4):            return Spacer(1, h)
def hr():               return HRFlowable(width='100%', thickness=0.5,
                                          color=CBD, spaceAfter=8, spaceBefore=8)
def pgbrk():            return PageBreak()
def ic(t):
    t = t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    return f'<font name="CF" size="9" color="#c0392b">{t}</font>'
def b(t):               return f'<b>{t}</b>'
def fr(t):              return f'<font name="CF-B" size="9" color="#2980b9">{t}</font>'

def code_block(text):
    pre = Preformatted(text, SCODE)
    t = Table([[pre]], colWidths=[CW - 4 * mm])
    t.setStyle(TableStyle([
        ('BACKGROUND',    (0, 0), (0, 0), CCB),
        ('BOX',           (0, 0), (0, 0), 0.5, CCBD),
        ('LINEBEFORE',    (0, 0), (0, 0), 3,   CA2),
        ('TOPPADDING',    (0, 0), (0, 0), 8),
        ('BOTTOMPADDING', (0, 0), (0, 0), 8),
        ('LEFTPADDING',   (0, 0), (0, 0), 10),
        ('RIGHTPADDING',  (0, 0), (0, 0), 8),
    ]))
    return t

def note_box(text):
    t = Table([[pp(text, SNOTE)]], colWidths=[CW - 2 * mm])
    t.setStyle(TableStyle([
        ('BACKGROUND',    (0, 0), (0, 0), CNB),
        ('BOX',           (0, 0), (0, 0), 0.5, CA2),
        ('LINEBEFORE',    (0, 0), (0, 0), 3,   CA2),
        ('TOPPADDING',    (0, 0), (0, 0), 8),
        ('BOTTOMPADDING', (0, 0), (0, 0), 8),
        ('LEFTPADDING',   (0, 0), (0, 0), 10),
        ('RIGHTPADDING',  (0, 0), (0, 0), 8),
    ]))
    return t

def warn_box(text):
    t = Table([[pp(text, SNOTE)]], colWidths=[CW - 2 * mm])
    t.setStyle(TableStyle([
        ('BACKGROUND',    (0, 0), (0, 0), CWB),
        ('BOX',           (0, 0), (0, 0), 0.5, CWBD),
        ('LINEBEFORE',    (0, 0), (0, 0), 3,   CWBD),
        ('TOPPADDING',    (0, 0), (0, 0), 8),
        ('BOTTOMPADDING', (0, 0), (0, 0), 8),
        ('LEFTPADDING',   (0, 0), (0, 0), 10),
        ('RIGHTPADDING',  (0, 0), (0, 0), 8),
    ]))
    return t

def dtable(headers, rows, col_widths=None):
    TSH = S('_TSH', fontName='MF-B', fontSize=9,  leading=13, textColor=white)
    TSD = S('_TSD', fontName='MF',   fontSize=9,  leading=13,
            textColor=HexColor('#1a1a2e'))
    data = [[pp(h, TSH) for h in headers]]
    for row in rows:
        data.append([pp(str(c), TSD) for c in row])
    if col_widths is None:
        col_widths = [CW / len(headers)] * len(headers)
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND',    (0, 0), (-1,  0), CA),
        ('ROWBACKGROUNDS',(0, 1), (-1, -1), [white, CROW]),
        ('GRID',          (0, 0), (-1, -1), 0.5, CBD),
        ('VALIGN',        (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING',    (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING',   (0, 0), (-1, -1), 6),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 6),
    ]))
    return t

def blist(items):
    return [pp(f'• {it}', SLIST) for it in items] + [sp(4)]

def nlist(items):
    return [pp(f'{i}. {it}', SLIST) for i, it in enumerate(items, 1)] + [sp(4)]

# ── Diagrams ────────────────────────────────────────────────────────────────────

def diag_wrap(inner):
    outer = Table([[inner]], colWidths=[CW])
    outer.setStyle(TableStyle([
        ('BACKGROUND',    (0, 0), (0, 0), CSB),
        ('BOX',           (0, 0), (0, 0), 0.5, CBD),
        ('TOPPADDING',    (0, 0), (0, 0), 14),
        ('BOTTOMPADDING', (0, 0), (0, 0), 14),
        ('LEFTPADDING',   (0, 0), (0, 0), 12),
        ('RIGHTPADDING',  (0, 0), (0, 0), 12),
    ]))
    return KeepTogether([outer, sp(8)])

def diag_pipeline():
    """Section 3.1 — Conversion pipeline."""
    half = (CW - 8 * mm) / 2

    def bx(main, sub=''):
        txt = f'<b>{main}</b>'
        if sub:
            txt += f'<br/><font name="MF" size="8" color="#4a4a6a">{sub}</font>'
        return pp(txt, SDBOX)

    data = [
        [bx('.root file'), ''],
        [pp('↓', SARR), ''],
        [bx('JSROOT openFile',
            'openFile() → readObject()  |  Encontra TGeoManager / TGeoVolume'), ''],
        [pp('↓', SARR), pp('↓', SARR)],
        [bx('buildCgv',  'travessia em profundidade — árvore textual'),
         bx('buildGltf', 'travessia em profundidade — Three.js Meshes')],
        [pp('↓', SARR), pp('↓', SARR)],
        [bx('.cgv',      'arquivo texto plano'),
         bx('GLTFExporter → .glb', 'arquivo binário GLTF 2.0')],
    ]

    t = Table(data, colWidths=[half, half])
    t.setStyle(TableStyle([
        ('SPAN',       (0, 0), (1, 0)),
        ('BACKGROUND', (0, 0), (1, 0), CDGA),
        ('BOX',        (0, 0), (1, 0), 1.5, CA2),
        ('SPAN',       (0, 1), (1, 1)),
        ('SPAN',       (0, 2), (1, 2)),
        ('BACKGROUND', (0, 2), (1, 2), CDG),
        ('BOX',        (0, 2), (1, 2), 1,   CDGB),
        ('BACKGROUND', (0, 4), (0, 4), CDG), ('BOX', (0, 4), (0, 4), 1, CDGB),
        ('BACKGROUND', (1, 4), (1, 4), CDG), ('BOX', (1, 4), (1, 4), 1, CDGB),
        ('BACKGROUND', (0, 6), (0, 6), CDG), ('BOX', (0, 6), (0, 6), 1, CDGB),
        ('BACKGROUND', (1, 6), (1, 6), CDG), ('BOX', (1, 6), (1, 6), 1, CDGB),
        ('ALIGN',       (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN',      (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING',    (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING',   (0, 0), (-1, -1), 6),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 6),
    ]))
    return diag_wrap(t)


def diag_initapp():
    """Section 5.1 — initApp initialization steps."""
    SN  = S('_SN',  fontName='MF-B', fontSize=9, leading=13,
             alignment=TA_CENTER, textColor=white)
    SD  = S('_SD',  fontName='MF',   fontSize=9, leading=13,
             textColor=HexColor('#1a1a2e'))
    SPC = S('_SPC', fontName='MF-B', fontSize=9, leading=13,
             alignment=TA_CENTER, textColor=CA2)

    def row(num, label, ann, pct):
        nc = pp(str(num), SN)
        lbl = f'<b>{label}</b>'
        if ann:
            lbl += f'<br/><font name="MF" size="8" color="#4a4a6a">{ann}</font>'
        lc = pp(lbl, SD)
        pc = pp(pct, SPC) if pct else pp('', SPC)
        return [nc, lc, pc]

    steps = [
        (1, 'Detectar idioma',
         'localStorage / navigator.language', ''),
        (2, 'Carregar módulo WASM',
         'await init()', '20%'),
        (3, 'Download em paralelo: GLB e CGV',
         'Fetch com streaming de progresso via Cache API', '55%'),
        (4, 'Validar GLB',
         "Verificação dos magic bytes 'glTF'", ''),
        (5, 'Indexar CGV',
         'load_cgv() via WASM — contagem de células', '65%'),
        (6, 'Construir cena 3D',
         'GLTFLoader.parse() — indexar meshes por nome — câmera — Ghost Atlas — Beam Axis',
         '90%'),
        (7, 'Iniciar poller de eventos',
         'Busca eventos ATLAS ao vivo a cada 5 segundos', '100%'),
    ]

    data = [row(n, l, a, pc) for n, l, a, pc in steps]
    cw = [0.8 * cm, CW - 0.8 * cm - 1.8 * cm, 1.8 * cm]
    t = Table(data, colWidths=cw)
    t.setStyle(TableStyle([
        ('BACKGROUND',    (0, 0), (0, -1), CA),
        ('ROWBACKGROUNDS',(1, 0), (-1, -1), [white, CSB]),
        ('GRID',          (0, 0), (-1, -1), 0.5, CBD),
        ('ALIGN',         (0, 0), (0, -1),  'CENTER'),
        ('ALIGN',         (2, 0), (2, -1),  'CENTER'),
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING',    (0, 0), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ('LEFTPADDING',   (0, 0), (-1, -1), 6),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 6),
    ]))
    return diag_wrap(t)


def diag_poller():
    """Section 6.1 — LivePoller state transitions."""
    return dtable(
        ['Estado', 'Gatilho / Condição', 'Próximo Estado'],
        [
            [b('Polling'),
             'Início do ciclo ou timer de 5 s expirado',
             'Downloading (êxito) / Erro (falha de rede)'],
            [b('Downloading'),
             'Novo event ID detectado; faz fetch do XML',
             'Same (êxito) / Erro (falha de rede)'],
            [b('Same'),
             'Event ID idêntico ao anterior; nenhum novo evento',
             'Polling (após 5 s)'],
            [b('Erro'),
             'Falha de rede em Polling ou Downloading',
             'Polling (após retry de 5 s)'],
        ],
        col_widths=[3.0 * cm, CW * 0.52, CW * 0.52 - 3.0 * cm],
    )


# ── Page callback ───────────────────────────────────────────────────────────────

def _page_decor(canvas, doc):
    canvas.saveState()
    canvas.setFont('MF', 9)
    canvas.setFillColor(CGT)
    canvas.drawCentredString(PW / 2, 14 * mm, str(doc.page))
    if doc.page > 1:
        canvas.setFont('MF', 8)
        canvas.setFillColor(CGT)
        canvas.drawString(ML, PH - 18 * mm, 'CGV WEB — Documentação Técnica Completa')
        canvas.drawRightString(PW - MR, PH - 18 * mm, 'Março 2026')
        canvas.setStrokeColor(CBD)
        canvas.setLineWidth(0.5)
        canvas.line(ML, PH - 19.5 * mm, PW - MR, PH - 19.5 * mm)
    canvas.restoreState()


# ── Content builder ─────────────────────────────────────────────────────────────

def build_story():
    story = []
    E = story.extend
    A = story.append

    # ── Cover ──────────────────────────────────────────────────────────────────
    A(sp(30))
    A(pp('CGV WEB', SH1))
    A(pp('Calorimeter Geometry Viewer — Documentação Técnica Completa', SSUB))
    A(pp('Versão 1.0 · Março 2026', SMETA))
    A(sp(16))

    cover_rows = [
        [pp(f'{b("Projeto:")} CGV WEB — Visualizador 3D de Geometria de Calorímetros do ATLAS (CERN)')],
        [pp(f'{b("Instituição:")} UFJF / NIPSCERN · CERN ATLAS TileCal')],
        [pp(f'{b("Repositório:")} github.com/nipscernlab/cgv-web')],
        [pp(f'{b("Tecnologias:")} JavaScript (Node.js + Browser), Rust/WebAssembly, Three.js, JSROOT')],
    ]
    cover_t = Table(cover_rows, colWidths=[CW - 4 * mm])
    cover_t.setStyle(TableStyle([
        ('BACKGROUND',    (0, 0), (0, -1), CSB),
        ('BOX',           (0, 0), (0, -1), 0.5, CBD),
        ('TOPPADDING',    (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING',   (0, 0), (-1, -1), 16),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 16),
    ]))
    A(cover_t)
    A(pgbrk())

    # ── Table of Contents ───────────────────────────────────────────────────────
    A(pp('Sumário', SH2))
    A(sp(4))
    toc_entries = [
        ('1. Visão Geral do Projeto', [
            '1.1 O que é o CGV WEB',
            '1.2 Estrutura de Arquivos',
            '1.3 Dependências e Tecnologias',
        ]),
        ('2. Formatos de Dados', [
            '2.1 Arquivo .root',
            '2.2 Arquivo .cgv',
            '2.3 Arquivo .glb',
            '2.4 XML de Eventos (JiveXML)',
        ]),
        ('3. Pipeline de Conversão: .root → .cgv + .glb', [
            '3.1 Visão Geral do Pipeline',
            '3.2 Leitura do Arquivo .root',
            '3.3 Geração do .cgv (Árvore Hierárquica)',
            '3.4 Geração do .glb (Modelo 3D)',
            '3.5 Otimização e Filtragem do GLB',
        ]),
        ('4. Processamento de Eventos XML (WASM/Rust)', [
            '4.1 Arquitetura do Módulo WASM',
            '4.2 Parsing do XML',
            '4.3 Mapeamento TileCal',
            '4.4 Mapeamento LAr EM Barrel',
            '4.5 Mapeamento LAr EM Endcap',
            '4.6 Mapeamento HEC',
            '4.7 Mapeamento MBTS',
            '4.8 Tratamento de Hits Duplicados',
            '4.9 Formato da Resposta JSON',
        ]),
        ('5. Viewer Web (index.html)', [
            '5.1 Inicialização da Aplicação',
            '5.2 Carregamento da Geometria',
            '5.3 Renderização de Eventos (loadXmlContent)',
            '5.4 Sistema de Colormaps',
            '5.5 Interação e Seleção de Células',
            '5.6 Ghost Atlas e Elementos Auxiliares',
            '5.7 Jets (Cones 3D)',
        ]),
        ('6. Sistema de Eventos ao Vivo', [
            '6.1 LivePoller',
            '6.2 CORS Proxy',
            '6.3 Cache de Eventos',
            '6.4 Modo Offline',
        ]),
        ('7. Delivery dos Arquivos', [
            '7.1 Estratégia de Cache',
            '7.2 Hosting e CDN',
            '7.3 Validação de Integridade',
        ]),
        ('8. Restrições, Validações e Tolerâncias', []),
        ('9. Setup e Utilitários', []),
        ('10. Internacionalização', []),
    ]
    for title, subs in toc_entries:
        A(pp(title, STOC))
        for sub in subs:
            A(pp(sub, STOC1))
    A(pgbrk())

    # ── Section 1 ───────────────────────────────────────────────────────────────
    A(pp('1. Visão Geral do Projeto', SH2))

    A(pp('1.1 O que é o CGV WEB', SH3))
    A(pp('O <b>CGV WEB</b> (Calorimeter Geometry Viewer) é um sistema web de visualização 3D '
         'interativo para dados de colisão do detector ATLAS no CERN. O projeto possui dois '
         'grandes pilares:'))
    E(nlist([
        f'{b("Pipeline de Conversão Offline:")} Converte arquivos de geometria CERN '
        f'{ic(".root")} em dois formatos web-friendly: um arquivo de hierarquia textual '
        f'{ic(".cgv")} e um modelo 3D binário {ic(".glb")} (GLTF 2.0).',
        f'{b("Viewer Web Interativo:")} Uma aplicação single-page que carrega a geometria 3D, '
        'recebe dados de eventos de colisão via XML (JiveXML), mapeia os hits de energia às '
        'células físicas do detector, e renderiza tudo em tempo real com Three.js.',
    ]))
    A(pp('O sistema suporta dados ao vivo do ATLAS (via polling do servidor CERN) e também '
         'carregamento local de arquivos XML para análise offline. Cobre os seguintes '
         'sub-detectores calorimétricos:'))
    A(sp(4))
    A(dtable(
        ['Sub-detector', 'Abreviação', 'Cobertura η', 'Descrição'],
        [
            ['Tile Calorimeter', 'TileCal / TILE', '|η| &lt; 1.7',
             'Calorímetro hadrônico de barril com telhas cintilantes'],
            ['Minimum Bias Trigger Scintillators', 'MBTS', '2.1 &lt; |η| &lt; 3.8',
             'Cintiladores para trigger de minimum bias'],
            ['Liquid Argon EM Calorimeter', 'LAr', '|η| &lt; 3.2',
             'Calorímetro eletromagnético de argônio líquido (barrel + endcap)'],
            ['Hadronic Endcap Calorimeter', 'HEC', '1.5 &lt; |η| &lt; 3.2',
             'Calorímetro hadrônico de endcap'],
        ],
        col_widths=[4.5*cm, 3.2*cm, 2.8*cm, CW - 4.5*cm - 3.2*cm - 2.8*cm],
    ))

    A(pp('1.2 Estrutura de Arquivos', SH3))
    A(code_block(
        'cgv-web/\n'
        '├── index.html                    # Viewer web principal (~2930 linhas)\n'
        '├── root2scene.mjs                # Conversor .root → .cgv + .glb (616 linhas)\n'
        '├── setup.mjs                     # Pós-instalação: patch de imports JSROOT\n'
        '├── filter_glb.mjs                # Filtra geometria TileCal do GLB completo\n'
        '├── optimize_glb.mjs              # Remove dados não utilizados e comprime GLB\n'
        '├── package.json                  # Configuração npm e dependências\n'
        '├── lib/\n'
        '│   ├── polyfill.mjs              # Polyfill FileReader para Node.js\n'
        '│   ├── geobase.mjs               # Construtor de geometrias JSROOT (patcheado)\n'
        '│   └── csg.mjs                   # CSG (Constructive Solid Geometry, patcheado)\n'
        '├── wasm/\n'
        '│   ├── src/lib.rs                # Código-fonte Rust do módulo WASM (667 linhas)\n'
        '│   ├── Cargo.toml                # Dependências Rust\n'
        '│   └── pkg/\n'
        '│       ├── tile_viz.js           # Wrapper JavaScript para o WASM\n'
        '│       ├── tile_viz_bg.wasm      # Módulo WebAssembly binário\n'
        '│       └── tile_viz.d.ts         # Definições TypeScript\n'
        '├── xml_test/live_cern/\n'
        '│   ├── live_poller.js            # Poller de eventos ao vivo do ATLAS (280 linhas)\n'
        '│   └── cors-proxy.js             # CORS proxy para Cloudflare Workers\n'
        '└── root_file/\n'
        '    ├── CaloGeometry.glb          # Geometria 3D pré-gerada\n'
        '    └── CaloGeometry.cgv          # Hierarquia textual pré-gerada'
    ))

    A(pp('1.3 Dependências e Tecnologias', SH3))
    A(dtable(
        ['Componente', 'Tecnologia', 'Uso'],
        [
            ['Leitura .root',       'JSROOT (^7.10.3)',                'Parser de arquivos ROOT do CERN'],
            ['Geometria 3D',        'Three.js (0.162.0 via CDN)',      'Renderização WebGL, meshes, materiais'],
            ['Exportação GLB',      'GLTFExporter (Three.js addon)',   'Serialização da cena para GLTF 2.0 binário'],
            ['Processamento hits',  'Rust → WebAssembly',             'Matching de alta performance de hits a células'],
            ['Otimização GLB',      '@gltf-transform/core + functions','Deduplicação, poda, quantização'],
            ['CORS Proxy',          'Cloudflare Workers',              'Bypass CORS para dados ATLAS ao vivo'],
        ],
        col_widths=[3.8*cm, 5.0*cm, CW - 3.8*cm - 5.0*cm],
    ))
    A(pgbrk())

    # ── Section 2 ───────────────────────────────────────────────────────────────
    A(pp('2. Formatos de Dados', SH2))

    A(pp('2.1 Arquivo .root', SH3))
    A(pp(f'O arquivo {ic(".root")} é o formato padrão de armazenamento de dados do framework ROOT '
         f'(CERN). No contexto do CGV WEB, contém a {b("geometria completa do detector "
         "calorimétrico")} na forma de um objeto {ic("TGeoManager")} (ou {ic("TGeoVolume")}), '
         'que encapsula uma árvore hierárquica de volumes geométricos.'))
    A(pp('Cada nó da árvore representa um volume físico do detector e contém:'))
    E(blist([
        f'{ic("fName")} — Identificador do volume (ex: {ic("Tile1p")}, {ic("EMBarrel0p")})',
        f'{ic("fVolume")} — Referência ao {ic("TGeoVolume")} com shape e filhos',
        f'{ic("fShape")} — Primitiva geométrica (TGeoBBox, TGeoTube, TGeoTubeSeg, etc.)',
        f'{ic("fMatrix")} — Transformação local (translação, rotação, escala)',
        f'{ic("fNodes")} — Array de nós filhos ({ic("TGeoNode")})',
        f'{ic("fGeoAtt")} — Atributos de visibilidade (bit 0x08 = kVisThis)',
        f'{ic("fFillColor")}, {ic("fLineColor")} — Cores ROOT (índices de paleta)',
    ]))

    A(pp('2.2 Arquivo .cgv', SH3))
    A(pp(f'O formato {ic(".cgv")} (Calorimeter Geometry Viewer) é um {b("arquivo de texto flat")} '
         'que codifica a hierarquia completa de volumes do detector. Cada linha representa um '
         'caminho na árvore, do nó raiz até uma folha.'))
    A(pp('Estrutura do formato:', SH4))
    A(code_block(
        '# Calorimeter Geometry Viewer (CGVWEB)\n'
        '# source   : CaloGeometry.root\n'
        '# generated: 2026-03-24T12:34:56.789Z\n'
        '# format   : name  ->  name  ->  ...  ->  leaf\n'
        '\n'
        'Calorimeter\n'
        'Calorimeter\t->\tTile1p\n'
        'Calorimeter\t->\tTile1p\t->\tTile1p0_0\n'
        'Calorimeter\t->\tTile1p\t->\tTile1p0_0\t->\tcell_0\n'
        'Calorimeter\t->\tTile1p\t->\tTile1p0_0\t->\tcell_1\n'
        '...\n'
        'Calorimeter\t->\tEMBarrel0p\t->\tEMBarrel0p0_0\t->\tcell_0'
    ))
    A(pp(f'{b("Regras do formato:")}'))
    E(blist([
        f'Linhas começando com {ic("#")} são comentários (ignoradas pelo parser)',
        f'Separador de caminho: TAB → TAB (caractere U+2192, seta para direita)',
        f'Apenas linhas terminando com {ic("cell_*")} são contadas como células reais',
        'A correspondência de nomes é case-sensitive',
        f'O caminho completo serve como {b("chave única")} para mapear hits a meshes 3D',
    ]))
    A(note_box(
        f'{b("Importância:")} O caminho CGV é a "cola" entre o WASM (que gera paths como '
        f'{ic("Calorimeter→Tile1p_0→Tile1p0_0→cell_5")}) e o viewer (que indexa meshes pelo '
        'nome no GLB).'
    ))
    A(sp(4))

    A(pp('2.3 Arquivo .glb', SH3))
    A(pp(f'O {ic(".glb")} é o formato binário do padrão GLTF 2.0 (GL Transmission Format). '
         'No CGV WEB, cada mesh no GLB corresponde a uma '
         f'{b("célula individual do detector")}.'))
    A(pp(f'{b("Características do GLB gerado:")}'))
    E(blist([
        f'Cada {ic("THREE.Mesh")} tem {ic("mesh.name")} = caminho CGV completo',
        f'Geometrias idênticas são {b("compartilhadas")} (deduplicação por shape signature)',
        'Transformações são decompostas em posição (T), rotação (R) e escala (S)',
        f'Materiais incluem cor ROOT e opacidade extraída de {ic("fFillStyle")}',
        f'O formato binário é compacto e carregável diretamente pelo Three.js via {ic("GLTFLoader")}',
    ]))

    A(pp('2.4 XML de Eventos (JiveXML)', SH3))
    A(pp(f'Os eventos de colisão são fornecidos no formato {b("JiveXML")}, padrão usado pelo '
         'ATLAS Event Display. Cada arquivo contém hits de energia depositados nos calorímetros.'))
    A(pp('Estrutura esperada do XML:', SH4))
    A(code_block(
        '<Event>\n'
        '  <TILE count="5200">\n'
        '    <energy>100.5 200.3 150.2 ...</energy>\n'
        '    <eta>0.05 -0.15 0.25 ...</eta>\n'
        '    <phi>1.57 -2.1 0.8 ...</phi>\n'
        '    <sub>3 2 5 ...</sub>\n'
        '  </TILE>\n'
        '\n'
        '  <MBTS count="32">\n'
        '    <energy>50 75 ...</energy>\n'
        '    <channel>0 1 ...</channel>\n'
        '    <module>2 3 ...</module>\n'
        '    <eta>2.4 -2.4 ...</eta>\n'
        '    <phi>0 0.78 ...</phi>\n'
        '  </MBTS>\n'
        '\n'
        '  <LAr count="12000">\n'
        '    <energy>120 140 ...</energy>\n'
        '    <eta>0.5 0.6 ...</eta>\n'
        '    <phi>1.2 2.3 ...</phi>\n'
        '    <slot>0 1 ...</slot>\n'
        '  </LAr>\n'
        '\n'
        '  <HEC count="3000">\n'
        '    <energy>180 200 ...</energy>\n'
        '    <eta>1.8 1.9 ...</eta>\n'
        '    <phi>1.5 2.0 ...</phi>\n'
        '    <slot>0 1 ...</slot>\n'
        '  </HEC>\n'
        '\n'
        '  <Jet storeGateKey="AntiKt4EMTopoJets_xAOD" count="5">\n'
        '    <eta>0.5 -1.2 ...</eta>\n'
        '    <phi>1.5 -0.8 ...</phi>\n'
        '    <et>150 80 ...</et>\n'
        '    <energy>200 120 ...</energy>\n'
        '  </Jet>\n'
        '</Event>'
    ))
    A(pp('Cada sub-detector possui arrays de valores separados por espaço. Os arrays devem ter '
         f'o {b("mesmo comprimento")} — em caso de discrepância, o sistema trunca ao menor comprimento.'))
    A(pgbrk())

    # ── Section 3 ───────────────────────────────────────────────────────────────
    A(pp('3. Pipeline de Conversão: .root → .cgv + .glb', SH2))

    A(pp('3.1 Visão Geral do Pipeline', SH3))
    A(pp(f'O script {fr("root2scene.mjs")} é o ponto de entrada para a conversão. Ele é executado '
         f'via Node.js e produz dois arquivos de saída a partir de um único arquivo {ic(".root")}:'))
    A(sp(6))
    A(diag_pipeline())

    A(pp('Uso via linha de comando:', SH4))
    A(code_block(
        'node root2scene.mjs CaloGeometry.root --out ./root_file --visible-only --verbose'
    ))
    A(dtable(
        ['Opção', 'Descrição'],
        [
            [ic('--out <dir>'),       'Diretório de saída (padrão: mesmo do .root)'],
            [ic('--max-faces <n>'),   'Limite de faces por shape (0 = ilimitado)'],
            [ic('--depth <n>'),       'Profundidade máxima da árvore (0 = completa)'],
            [ic('--subtree <prefix>'),'Filtra filhos diretos da raiz por prefixo de nome'],
            [ic('--visible-only'),    'Ignora volumes invisíveis (bit kVisThis = 0x08)'],
            [ic('--no-gltf'),         'Gera apenas o .cgv'],
            [ic('--no-cgv'),          'Gera apenas o .glb'],
            [ic('--verbose'),         'Log detalhado de cada nó processado'],
        ],
        col_widths=[4.5*cm, CW - 4.5*cm],
    ))

    A(pp('3.2 Leitura do Arquivo .root', SH3))
    A(pp(f'A leitura é feita em duas etapas no arquivo {fr("root2scene.mjs")}:'))
    A(pp('Etapa 1: Abertura do arquivo', SH4))
    A(pp(f'A função {ic("openRootFile()")} (linha 121) utiliza a biblioteca JSROOT para abrir o '
         'arquivo binário e listar suas chaves:'))
    A(code_block(
        '// root2scene.mjs — openRootFile (linha 121)\n'
        'async function openRootFile(path) {\n'
        '  const file = await openFile(path);    // JSROOT abre o binário ROOT\n'
        '  if (!file) die(`Nao foi possivel abrir: ${path}`);\n'
        '  const keys = Array.isArray(file.fKeys) ? file.fKeys : [];\n'
        '  info(`${keys.length} chave(s) no arquivo`);\n'
        '  return { file, keys };\n'
        '}'
    ))
    A(pp('Etapa 2: Localização do TGeoManager', SH4))
    A(pp(f'A função {ic("findGeoManager()")} (linha 130) percorre as chaves do arquivo procurando '
         'um objeto de geometria:'))
    A(code_block(
        '// root2scene.mjs — findGeoManager (linha 130)\n'
        'async function findGeoManager(file, keys) {\n'
        "  const GEO = new Set(['TGeoManager', 'TGeoVolume', 'TGeoVolumeAssembly']);\n"
        '  for (const key of keys) {\n'
        '    if (GEO.has(key.fClassName)) {\n'
        '      const obj = await file.readObject(key.fName, key.fCycle);\n'
        '      return { obj, key };\n'
        '    }\n'
        '  }\n'
        '  return null;\n'
        '}'
    ))
    A(pp(f'O sistema aceita três tipos de objetos raiz: {ic("TGeoManager")}, {ic("TGeoVolume")} '
         f'e {ic("TGeoVolumeAssembly")}. Se for um {ic("TGeoManager")}, o volume raiz é acessado '
         f'via {ic("obj.fMasterVolume")}.'))

    A(pp('3.3 Geração do .cgv (Árvore Hierárquica)', SH3))
    A(pp(f'A função {ic("buildCgv()")} (linha 374 de {fr("root2scene.mjs")}) realiza uma '
         f'{b("travessia em profundidade baseada em pilha")} da árvore de nós geométricos, '
         'emitindo uma linha para cada nó visitado.'))
    A(code_block(
        '// root2scene.mjs — buildCgv (simplificado, linha 374)\n'
        'function buildCgv(geoResult, allKeys, rootPath, opts) {\n'
        '  const lines = [];\n'
        "  lines.push('# Calorimeter Geometry Viewer (CGVWEB)');\n"
        '  lines.push(`# source   : ${basename(rootPath)}`);\n'
        '\n'
        '  const topNode = (obj._typename === \'TGeoManager\')\n'
        '    ? { fName: key.fName, fVolume: obj.fMasterVolume, fGeoAtt: 0xFF, fMatrix: null }\n'
        '    : obj;\n'
        '\n'
        '  const stack = [{ node: topNode, ancestors: [] }];\n'
        '\n'
        '  while (stack.length > 0) {\n'
        '    const { node, ancestors } = stack.pop();\n'
        '    const volume  = node.fVolume ?? node;\n'
        '    const geoAtt  = node.fGeoAtt ?? volume?.fGeoAtt ?? 0xFF;\n'
        '\n'
        '    if (opts.visibleOnly && !Boolean(geoAtt & 0x08)) continue;\n'
        '\n'
        "    const name     = node.fName ?? volume?.fName ?? '?';\n"
        '    const segments = [...ancestors, name];\n'
        "    lines.push(segments.join('\\t->\\t'));\n"
        '\n'
        '    const children = volume?.fNodes?.arr ?? [];\n'
        '    if (children.length > 0 && (opts.maxDepth === 0 || ancestors.length < opts.maxDepth)) {\n'
        '      for (let i = children.length - 1; i >= 0; i--)\n'
        '        stack.push({ node: children[i], ancestors: segments });\n'
        '    }\n'
        '  }\n'
        "  return lines.join('\\n') + '\\n';\n"
        '}'
    ))
    A(pp(f'{b("Passo a passo do algoritmo:")}'))
    E(nlist([
        f'Cria o nó raiz (topNode) a partir do TGeoManager ou TGeoVolume',
        f'Inicializa uma pilha com o nó raiz e ancestors vazio',
        f'Para cada nó retirado da pilha: verifica visibilidade via bit {ic("geoAtt & 0x08")}, '
        f'constrói o caminho completo juntando ancestors + nome atual com {ic("\\t→\\t")}, '
        f'emite a linha no arquivo de saída, empilha os filhos em ordem reversa',
        f'Respeita o limite de profundidade ({ic("--depth")})',
    ]))

    A(pp('3.4 Geração do .glb (Modelo 3D)', SH3))
    A(pp(f'A função {ic("buildGltf()")} (linha 460 de {fr("root2scene.mjs")}) constrói uma cena '
         'Three.js onde cada célula do detector é um mesh nomeado.'))

    A(pp('3.4.1 Deduplicação de Geometrias (Shape Signature)', SH4))
    A(pp(f'A função {ic("shapeSignature()")} (linha 248) gera uma chave única baseada nos '
         'parâmetros da shape:'))
    A(code_block(
        '// root2scene.mjs — shapeSignature (linha 248)\n'
        'function shapeSignature(shape) {\n'
        "  const t = shape._typename ?? '';\n"
        '  switch (t) {\n'
        '    case \'TGeoBBox\':\n'
        '      return `BBox_${r4(shape.fDX)}_${r4(shape.fDY)}_${r4(shape.fDZ)}`;\n'
        '    case \'TGeoTube\':\n'
        '      return `Tube_${r4(shape.fRmin)}_${r4(shape.fRmax)}_${r4(shape.fDZ)}`;\n'
        '    case \'TGeoTubeSeg\':\n'
        '      return `TSeg_${r4(shape.fRmin)}_${r4(shape.fRmax)}_${r4(shape.fDZ)}`\n'
        '           + `_${r4(shape.fPhi1)}_${r4(shape.fPhi2)}`;\n'
        "    default:\n"
        '      return `${t}_rnd_${Math.random()}`;  // shapes complexas: sem compartilhamento\n'
        '  }\n'
        '}'
    ))

    A(pp('3.4.2 Extração de Cores ROOT', SH4))
    A(code_block(
        '// root2scene.mjs — volumeColorThree (linha 184)\n'
        'function volumeColorThree(volume, rootColors) {\n'
        '  const { hex, opacity } = volumeColorCss(volume, rootColors);\n'
        '  return { color: new THREE.Color(hex), opacity };\n'
        '}\n'
        '\n'
        'function volumeColorCss(volume, rootColors) {\n'
        "  let hex = '#888888', opacity = 1.0;\n"
        '  if ((volume.fFillColor ?? 0) > 1)\n'
        '    hex = colorHex(volume.fFillColor, rootColors);\n'
        '  else if ((volume.fLineColor ?? -1) >= 0)\n'
        '    hex = colorHex(volume.fLineColor, rootColors);\n'
        '  const mat = volume.fMedium?.fMaterial;\n'
        '  if (mat) {\n'
        '    const fs = mat.fFillStyle ?? 0;\n'
        '    if (fs >= 3000 && fs <= 3100)\n'
        '      opacity = (100 - (fs - 3000)) / 100;\n'
        '  }\n'
        '  return { hex, opacity };\n'
        '}'
    ))

    A(pp('3.4.3 Construção dos Meshes', SH4))
    A(code_block(
        '// root2scene.mjs — buildGltf loop principal (simplificado, linha 487)\n'
        "const stack = [{ node: topNode, worldMat: identity, ancestorPath: '', depth: 0 }];\n"
        '\n'
        'while (stack.length > 0) {\n'
        '  const { node, worldMat, ancestorPath, depth } = stack.pop();\n'
        '  const shape = volume?.fShape;\n'
        '  const path  = ancestorPath ? `${ancestorPath}->${name}` : name;\n'
        '\n'
        '  const local   = nodeToMatrix4(node);\n'
        '  const nodeMat = local ? worldMat.clone().multiply(local) : worldMat;\n'
        '\n'
        '  if (shape) {\n'
        '    let bufGeo = geoCache.get(shapeSignature(shape));\n'
        '    if (!bufGeo) bufGeo = createGeometry(shape, opts.maxFaces);\n'
        '\n'
        '    if (bufGeo) {\n'
        '      const { color, opacity } = volumeColorThree(volume, rootColors);\n'
        '      const mat  = matCache.get(color, opacity);\n'
        '      const mesh = new THREE.Mesh(bufGeo, mat);\n'
        '      mesh.name  = path;  // Nome = caminho CGV completo\n'
        '      const pos = new THREE.Vector3(), quat = new THREE.Quaternion();\n'
        '      nodeMat.decompose(pos, quat, scl);\n'
        '      mesh.position.copy(pos);\n'
        '      mesh.quaternion.copy(quat);\n'
        '      scene.add(mesh);\n'
        '    }\n'
        '  }\n'
        '  for (const child of children.reverse())\n'
        '    stack.push({ node: child, worldMat: nodeMat, ancestorPath: path, depth: depth+1 });\n'
        '}'
    ))
    A(pp(f'Ao final, a cena é exportada como GLB binário via {ic("GLTFExporter")}:'))
    A(code_block(
        'const exporter = new GLTFExporter();\n'
        'const glbArrayBuffer = await exporter.parseAsync(scene, {\n'
        '  binary: true, embedImages: false, onlyVisible: false\n'
        '});\n'
        'return Buffer.from(glbArrayBuffer);'
    ))

    A(pp('3.4.4 Cache de Materiais', SH4))
    A(code_block(
        '// root2scene.mjs — MaterialCache (linha 442)\n'
        'class MaterialCache {\n'
        '  #map = new Map();\n'
        '  get(color, opacity) {\n'
        '    const key = `${color.getHexString()}_${opacity.toFixed(3)}`;\n'
        '    if (!this.#map.has(key)) {\n'
        '      this.#map.set(key, new THREE.MeshStandardMaterial({\n'
        '        color, opacity,\n'
        '        transparent: opacity < 1.0,\n'
        '        roughness: 0.55, metalness: 0.05,\n'
        '        side: THREE.DoubleSide,\n'
        '      }));\n'
        '    }\n'
        '    return this.#map.get(key);\n'
        '  }\n'
        '}'
    ))

    A(pp('3.5 Otimização e Filtragem do GLB', SH3))
    A(pp(f'{b("filter_glb.mjs")}', SH4))
    A(pp(f'O script {fr("filter_glb.mjs")} remove nós não-TileCal do GLB completo. Utiliza '
         f'{ic("@gltf-transform")} para percorrer os nós e remover os que contêm '
         f'{ic("HEC")}, {ic("EMBarrel")}, {ic("EMEndCap")}, etc.:'))
    A(code_block(
        '// filter_glb.mjs (simplificado)\n'
        'function shouldRemove(node) {\n'
        '  const n = node.getName();\n'
        "  if (!n.includes('Tile') && (\n"
        "    n.includes('HEC') || n.includes('EMBarrel') ||\n"
        "    n.includes('EMEndCap') || n.includes('Ground') || n === 'Calorimeter->I'\n"
        '  )) return true;\n'
        '  return false;\n'
        '}\n'
        '// Após remoção, poda recursos não referenciados\n'
        'await doc.transform(prune(), dedup());'
    ))
    A(pp(f'{b("optimize_glb.mjs")}', SH4))
    A(pp(f'O script {fr("optimize_glb.mjs")} reduz o tamanho do GLB removendo dados desnecessários '
         'para o viewer:'))
    E(nlist([
        f'Strip de atributos de vértice: TEXCOORD_0, TEXCOORD_1, TANGENT, COLOR_0 '
        f'(o viewer usa cor por instância)',
        f'Remoção de materiais: o viewer substitui todos por {ic("baseMat")}',
        'Deduplicação: accessors e buffers idênticos são mesclados',
        f'Quantização (opcional): Float32 → Int16 com fator de escala (flag {ic("--quantize")})',
    ]))
    A(pp(f'Resultado típico: {b("~80% de redução")} no tamanho do arquivo.'))
    A(pgbrk())

    # ── Section 4 ───────────────────────────────────────────────────────────────
    A(pp('4. Processamento de Eventos XML (WASM/Rust)', SH2))

    A(pp('4.1 Arquitetura do Módulo WASM', SH3))
    A(pp(f'O módulo WebAssembly é compilado a partir de Rust ({fr("wasm/src/lib.rs")}) e expõe '
         'duas funções públicas ao JavaScript:'))
    A(dtable(
        ['Função', 'Parâmetros', 'Retorno', 'Descrição'],
        [
            [ic('load_cgv(cgv_text)'),    'String com conteúdo CGV',     'usize (nº de células)',
             'Conta células no CGV para validação'],
            [ic('process_event(xml_text)'),'String com XML do evento',    'String JSON',
             'Processa hits e retorna mapeamento'],
        ],
        col_widths=[4.2*cm, 3.8*cm, 3.0*cm, CW - 4.2*cm - 3.8*cm - 3.0*cm],
    ))
    A(pp('O módulo é carregado no viewer via:'))
    A(code_block(
        '// index.html (linha 1047)\n'
        "import init, { load_cgv, process_event } from './wasm/pkg/tile_viz.js';\n"
        '// Na inicialização:\n'
        'await init();  // Carrega e inicializa o .wasm'
    ))

    A(pp('4.2 Parsing do XML', SH3))
    A(pp('O parser XML é implementado diretamente em Rust com funções de busca de texto, '
         'sem dependência de um parser XML completo:'))
    A(code_block(
        '// wasm/src/lib.rs — extract_array (linha 630)\n'
        'fn extract_array(content: &str, tag: &str) -> Option<Vec<f32>> {\n'
        '    let open  = format!("<{}>",  tag);\n'
        '    let close = format!("</{}>", tag);\n'
        '    let s = content.find(&open)?  + open.len();\n'
        '    let e = content[s..].find(&close)? + s;\n'
        '    Some(content[s..e].split_whitespace()\n'
        '        .filter_map(|t| t.parse().ok())\n'
        '        .collect())\n'
        '}'
    ))
    A(pp(f'{b("Fluxo de parsing para cada sub-detector:")}'))
    E(nlist([
        f'Localiza a tag de abertura (ex: {ic("<TILE")}) no XML',
        f'Extrai o conteúdo entre {ic("<TILE>")} e {ic("</TILE>")}',
        'Para cada campo (energy, eta, phi, sub), extrai o texto entre as sub-tags',
        f'Divide por whitespace e parseia para {ic("f32")}',
        f'Tokens inválidos são silenciosamente ignorados ({ic("filter_map")})',
        f'O tamanho efetivo {ic("n")} é o mínimo de todos os arrays',
    ]))

    A(pp('4.3 Mapeamento TileCal', SH3))
    A(pp(f'O TileCal é mapeado usando uma {b("tabela estática de 64 células")} definida no início '
         'do arquivo Rust. Cada entrada define:'))
    A(code_block(
        '// wasm/src/lib.rs (linha 9)\n'
        'struct TileCell {\n'
        '    sub:       u8,           // Sub-detector (0-7)\n'
        '    eta_c:     f32,          // eta central da célula\n'
        '    tile_vol:  &\'static str, // Nome do volume no CGV (ex: "Tile1p")\n'
        '    eta_i:     u8,           // Indice eta\n'
        '    phi_n:     u8,           // Numero de setores phi (64 ou 8)\n'
        '    cell_name: &\'static str, // Rotulo (ex: "A1", "BC5", "D3")\n'
        '}'
    ))
    A(pp('Sub-detectores TileCal:'))
    A(dtable(
        ['sub', 'Nome', 'η', 'Volumes CGV'],
        [
            ['3', 'LBA (Long Barrel A-side)', 'η &gt; 0', 'Tile1p, Tile23p, Tile4p'],
            ['2', 'LBC (Long Barrel C-side)', 'η &lt; 0', 'Tile1n, Tile23n, Tile4n'],
            ['5', 'EBA regular (Extended Barrel A)', 'η &gt; 0', 'Tile5p–Tile8p'],
            ['0', 'EBC regular (Extended Barrel C)', 'η &lt; 0', 'Tile5n–Tile8n'],
            ['4', 'EBA especial', 'η &gt; 0', 'Tile9p–Tile13p'],
            ['1', 'EBC especial', 'η &lt; 0', 'Tile9n–Tile13n'],
            ['6', 'MBTS-A', 'η &gt; 0', 'Tile14p, Tile15p'],
            ['7', 'MBTS-C', 'η &lt; 0', 'Tile14n, Tile15n'],
        ],
        col_widths=[1.0*cm, 5.5*cm, 2.0*cm, CW - 1.0*cm - 5.5*cm - 2.0*cm],
    ))
    A(pp('Algoritmo de lookup:', SH4))
    A(code_block(
        '// wasm/src/lib.rs — lookup_tile_cell_nth (linha 114)\n'
        'fn lookup_tile_cell_nth(hit_eta: f32, hit_phi: f32, hit_sub: u8, nth: usize)\n'
        '    -> Option<(String, &\'static str)>\n'
        '{\n'
        '    // 1. Distância mínima em eta para o sub-detector\n'
        '    let min_dist = TILE_CELLS.iter()\n'
        '        .filter(|c| c.sub == hit_sub)\n'
        '        .map(|c| (c.eta_c - hit_eta).abs())\n'
        '        .fold(f32::INFINITY, f32::min);\n'
        '\n'
        '    // 2. Candidatos dentro da tolerância\n'
        '    let tol = min_dist + 0.0005;\n'
        '    let candidates: Vec<&TileCell> = TILE_CELLS.iter()\n'
        '        .filter(|c| c.sub == hit_sub && (c.eta_c - hit_eta).abs() <= tol)\n'
        '        .collect();\n'
        '\n'
        '    // 3. Seleciona pelo índice nth (para hits duplicados)\n'
        '    let cell = candidates[nth % candidates.len()];\n'
        '\n'
        '    // 4. Calcula setor phi (0..phi_n-1)\n'
        '    let raw = ((hit_phi + PI) * phi_n / (2.0 * PI)).floor() as i32;\n'
        '    let j = raw.rem_euclid(cell.phi_n as i32) as usize;\n'
        '\n'
        '    // 5. Retorna o caminho CGV completo\n'
        '    Some((\n'
        '        format!("Calorimeter->{vol}_0->{vol}{i}_{i}->cell_{j}"),\n'
        '        cell.cell_name\n'
        '    ))\n'
        '}'
    ))

    A(pp('4.4 Mapeamento LAr EM Barrel', SH3))
    A(pp('O LAr Barrel possui 4 camadas com segmentação variável em η:'))
    A(dtable(
        ['Camada', 'Nome', 'Nº células η', 'Δη', 'Setores φ'],
        [
            ['0', 'PS (Presampler)',  '61',  '0.025',   '64'],
            ['1', 'S1 (Strips)',      '449', '~0.003125 (fine) + 1 coarse', '64'],
            ['2', 'S2 (Middle)',      '52',  '0.025',   '256'],
            ['3', 'S3 (Back)',        '24',  '0.05',    '256'],
        ],
        col_widths=[1.8*cm, 3.5*cm, 3.0*cm, 4.5*cm, CW - 1.8*cm - 3.5*cm - 3.0*cm - 4.5*cm],
    ))
    A(code_block(
        '// wasm/src/lib.rs — laba_eta (linha 150)\n'
        'fn laba_eta(layer: usize, i: usize) -> f32 {\n'
        '    match layer {\n'
        '        0 => 0.0125 + 0.025 * i as f32,           // 61 cells, delta_eta=0.025\n'
        '        1 => {\n'
        '            if i < 448 { 0.001_562_5 + 0.003_125 * i as f32 }\n'
        '            else { 1.4125_f32 }                   // ultima celula (coarse)\n'
        '        }\n'
        '        2 => 0.0125 + 0.025 * i as f32,           // 52 cells, delta_eta=0.025\n'
        '        3 => 0.025  + 0.05  * i as f32,           // 24 cells, delta_eta=0.05\n'
        '        _ => 0.0,\n'
        '    }\n'
        '}'
    ))
    A(pp('Algoritmo de lookup LAr Barrel:'))
    E(nlist([
        'Verifica se |η| ≤ 1.55 (cobertura do barrel)',
        'Para cada uma das 4 camadas: estima o índice via aritmética e busca em vizinhança ±1',
        f'Filtra candidatos: {ic("dist <= best_dist + 0.001")}',
        'Ordena por distância e depois por camada',
        f'Seleciona o candidato pelo parâmetro {ic("nth")}',
        f'Gera caminho: {ic("Calorimeter->EMBarrel{L}{side}_0->EMBarrel{L}{side}{i}_{i}->cell_{j}")}',
    ]))

    A(pp('4.5 Mapeamento LAr EM Endcap', SH3))
    A(pp('O Endcap cobre 1.35 &lt; |η| &lt; 3.25, com segmentação não-uniforme:'))
    A(code_block(
        '// wasm/src/lib.rs — laeb_eta para camada 1 (exemplo, linha 239)\n'
        'fn laeb_eta(layer: usize, i: usize) -> f32 {\n'
        '    match layer {\n'
        '        1 => match i {\n'
        '            0 => 1.40828,\n'
        '            1 => 1.44578,\n'
        '            2 => 1.47078,\n'
        '            3 => 1.49578,\n'
        '            4..=99   => 1.509_84 + 0.003_125   * (i - 4) as f32,\n'
        '            100..=147 => 1.810_36 + 0.004_166_67 * (i - 100) as f32,\n'
        '            148..=211 => 2.011_41 + 0.006_25     * (i - 148) as f32,\n'
        '            _         => 2.420_78 + 0.025        * (i - 212) as f32,\n'
        '        },\n'
        '        // ...\n'
        '    }\n'
        '}'
    ))
    A(pp('A busca no endcap usa scan linear (tamanhos pequenos: máximo 216 células) e tolerância '
         'variável por camada e índice.'))

    A(pp('4.6 Mapeamento HEC', SH3))
    A(pp(f'O HEC (Hadronic Endcap) usa uma tabela de posições radiais {ic("HECZ[7][14]")} para '
         'calcular η via a relação geométrica:'))
    A(code_block(
        '// wasm/src/lib.rs — r_z_to_eta (linha 365)\n'
        'fn r_z_to_eta(r: f32, z: f32) -> f32 {\n'
        '    let theta = r.atan2(z);\n'
        '    -(theta * 0.5).tan().ln()\n'
        '}'
    ))
    A(pp('O HEC é dividido em 4 volumes lógicos, que combinam até 2 camadas reais:'))
    A(dtable(
        ['Volume', 'Células η', 'Tipo', 'Camadas reais'],
        [
            ['HEC1',  '14', 'BuildHEC',  'Camada 0'],
            ['HEC23', '13', 'MergeHEC',  'Camadas 1+2'],
            ['HEC45', '12', 'MergeHEC',  'Camadas 3+4'],
            ['HEC67', '12', 'MergeHEC',  'Camadas 5+6'],
        ],
        col_widths=[2.5*cm, 2.5*cm, 3.0*cm, CW - 2.5*cm - 2.5*cm - 3.0*cm],
    ))
    A(pp(f'Para volumes {b("MergeHEC")}, o η é calculado como a média dos η das duas camadas '
         'componentes. A tolerância de matching é de {b("0.08 em η")}.'))

    A(pp('4.7 Mapeamento MBTS', SH3))
    A(pp('O MBTS é processado com parser dedicado que extrai arrays de '
         f'{ic("energy")}, {ic("channel")}, {ic("module")}, {ic("eta")} e {ic("phi")}:'))
    A(code_block(
        '// wasm/src/lib.rs — process_event, seção MBTS (linha 494)\n'
        'let (vol, cell_name, eta_out) = match ch {\n'
        '    0 => (format!("Tile14{side}"), "MBTS2", 2.40),\n'
        '    1 => (format!("Tile15{side}"), "MBTS1", 3.20),\n'
        '    _ => continue,  // channel invalido: ignorado\n'
        '};\n'
        'let path = format!("Calorimeter->{vol}_0->{vol}0_0->cell_{md}");'
    ))
    A(pp(f'O MBTS mapeia diretamente pelo {ic("channel")} (0 = MBTS2, 1 = MBTS1) e usa o '
         f'{ic("module")} como índice da célula φ.'))

    A(pp('4.8 Tratamento de Hits Duplicados', SH3))
    A(pp('O XML pode conter múltiplos hits com os mesmos (η, φ). O sistema usa um '
         f'{ic("HashMap")} de contagem para selecionar candidatos distintos:'))
    A(code_block(
        '// wasm/src/lib.rs — Tratamento de duplicatas (exemplo TILE, linha 468)\n'
        'let mut seen: HashMap<(i32, u8, u8), usize> = HashMap::new();\n'
        'for i in 0..n {\n'
        '    let eta_key   = (hit_eta * 1000.0).round() as i32;\n'
        '    let phi_j_key = ((hit_phi + PI) * 64.0 / (2.0 * PI)).floor() as u8;\n'
        '    let seen_key  = (eta_key, phi_j_key, hit_sub);\n'
        '    let nth = *seen.get(&seen_key).unwrap_or(&0);\n'
        '    seen.insert(seen_key, nth + 1);\n'
        '    match lookup_tile_cell_nth(hit_eta, hit_phi, hit_sub, nth) { ... }\n'
        '}'
    ))
    A(pp(f'Para LAr e HEC, a chave de duplicação é {ic("(eta_key * 10000, phi_key * 1000)")}, '
         'proporcionando resolução mais fina.'))

    A(pp('4.9 Formato da Resposta JSON', SH3))
    A(pp(f'A função {ic("process_event()")} retorna uma string JSON com a seguinte estrutura:'))
    A(code_block(
        '{\n'
        '  "ok": true,\n'
        '  "cells_mapped": 5832,\n'
        '  "cells_unmapped": 48,\n'
        '  "e_min": -245.3400,\n'
        '  "e_max": 18420.5000,\n'
        '  "tile_mapped": 3200,\n'
        '  "tile_unmapped": 20,\n'
        '  "mbts_mapped": 32,\n'
        '  "lar_mapped": 2100,\n'
        '  "lar_unmapped": 25,\n'
        '  "hec_mapped": 500,\n'
        '  "hec_unmapped": 3,\n'
        '  "hits": [\n'
        '    {\n'
        '      "path": "Calorimeter->Tile1p_0->Tile1p0_0->cell_5",\n'
        '      "energy": 1250.3000,\n'
        '      "eta": 0.0500,\n'
        '      "phi": 0.4908,\n'
        '      "cell": "A1",\n'
        '      "det": "TILE"\n'
        '    }\n'
        '  ]\n'
        '}'
    ))
    A(pgbrk())

    # ── Section 5 ───────────────────────────────────────────────────────────────
    A(pp('5. Viewer Web (index.html)', SH2))

    A(pp('5.1 Inicialização da Aplicação', SH3))
    A(pp(f'A aplicação é inicializada pela função {ic("initApp()")} (linha 2798 de '
         f'{fr("index.html")}), que segue uma sequência precisa de passos:'))
    A(sp(6))
    A(diag_initapp())

    A(code_block(
        '// index.html — initApp (simplificado, linha 2798)\n'
        'async function initApp() {\n'
        '  applyLang(storedLang);\n'
        '  await init();                                  // 1. WASM\n'
        '\n'
        '  const [glbBuf, cgvText] = await Promise.all([ // 2. Download paralelo\n'
        '    cachedArrayBuffer(GLB_URL, onProgress),\n'
        '    cachedText(CGV_URL),\n'
        '  ]);\n'
        '\n'
        '  const h  = new Uint8Array(glbBuf, 0, 12);     // 3. Valida GLB\n'
        '  const ok = h[0]===0x67 && h[1]===0x6C &&\n'
        "             h[2]===0x54 && h[3]===0x46;        // 'glTF'\n"
        "  if (!ok) throw new Error('Not a valid GLB binary');\n"
        '\n'
        '  const cellCount = load_cgv(cgvText);          // 4. Indexa CGV\n'
        '  totalCellCount  = cellCount;\n'
        '\n'
        '  const gltf = await new Promise((res, rej) =>  // 5. Parse GLB\n'
        "    new GLTFLoader().parse(glbBuf, '', res, rej));\n"
        '  gltf.scene.traverse(o => {\n'
        '    if (o.isMesh) {\n'
        '      o.material = baseMat;\n'
        '      o.visible  = false;\n'
        '      meshIndex[o.name] = o;                    // Chave = caminho CGV\n'
        '    }\n'
        '  });\n'
        '\n'
        '  buildGhostAtlas(1.0, new THREE.Vector3(0, 0, 0));\n'
        '  buildBeamAxis(new THREE.Vector3(0, 0, 0), 1.0, size * 0.5);\n'
        '\n'
        '  await poller.init();\n'
        '  poller.start();                               // 6. Inicia poller\n'
        '}'
    ))

    A(pp('5.2 Carregamento da Geometria', SH3))
    A(pp('Estratégia de URL:', SH4))
    A(code_block(
        '// index.html (linha 1054)\n'
        "const _isLocal = location.hostname === 'localhost' || location.protocol === 'file:';\n"
        'const GLB_URL = _isLocal\n'
        "  ? './root_file/CaloGeometry.glb'\n"
        "  : 'https://media.githubusercontent.com/media/nipscernlab/cgv-web/main/root_file/CaloGeometry.glb';\n"
        "const CGV_URL = './root_file/CaloGeometry.cgv';"
    ))
    A(pp('Em produção (GitHub Pages), o GLB é servido via '
         f'{ic("media.githubusercontent.com")} (Git LFS com CORS), enquanto o CGV '
         '(texto leve) é servido diretamente.'))
    A(pp('Cache com progresso:', SH4))
    A(code_block(
        '// index.html — cachedArrayBuffer (linha 1078)\n'
        'async function cachedArrayBuffer(url, onProgress) {\n'
        "  if ('caches' in window) {\n"
        '    const c   = await caches.open(GEO_CACHE_VER);\n'
        '    const hit = await c.match(url);\n'
        '    if (hit) { onProgress?.(-1, -1); return hit.arrayBuffer(); }\n'
        '  }\n'
        '  const res    = await fetch(url);\n'
        '  const reader = res.body.getReader();\n'
        '  const chunks = []; let loaded = 0;\n'
        '  while (true) {\n'
        '    const { done, value } = await reader.read();\n'
        '    if (done) break;\n'
        '    chunks.push(value); loaded += value.length;\n'
        '    onProgress?.(loaded, total);\n'
        '  }\n'
        '  _geoStore(url, buf.buffer);\n'
        '  return buf.buffer;\n'
        '}'
    ))

    A(pp('5.3 Renderização de Eventos (loadXmlContent)', SH3))
    A(pp(f'A função {ic("loadXmlContent()")} (linha 2389 de {fr("index.html")}) é o ponto '
         'central onde um XML de evento é transformado em visualização 3D:'))
    A(code_block(
        '// index.html — loadXmlContent (simplificado, linha 2389)\n'
        'async function loadXmlContent(xmlText, filename) {\n'
        '  let result;\n'
        '  try { result = JSON.parse(process_event(xmlText)); }\n'
        '  catch(err) { showToast(t(\'parseError\')+\': \'+err.message, true); return false; }\n'
        '  if (!result.ok) { showToast(t(\'invalidXml\'), true); return false; }\n'
        '\n'
        '  eMin_mev = result.e_min;  eMax_mev = result.e_max;\n'
        '\n'
        '  instGroups.forEach(g => { scene.remove(g.im); g.im.dispose(); });\n'
        '  instGroups = [];  allHits = [];\n'
        '\n'
        '  // Agrupa hits por geometria (UUID do BufferGeometry)\n'
        '  const geoGroups = new Map();\n'
        '  for (const h of result.hits) {\n'
        '    const mesh = meshIndex[h.path];\n'
        '    if (!mesh) { _miss++; continue; }\n'
        '    const uid = mesh.geometry.uuid;\n'
        '    if (!geoGroups.has(uid)) geoGroups.set(uid, []);\n'
        '    geoGroups.get(uid).push({mesh, h});\n'
        '  }\n'
        '\n'
        '  // Cria InstancedMesh para cada grupo de geometria\n'
        '  for (const [, group] of geoGroups) {\n'
        '    const geo = group[0].mesh.geometry;\n'
        '    const mat = new THREE.MeshPhongMaterial({side: THREE.DoubleSide, shininess: 80});\n'
        '    const im  = new THREE.InstancedMesh(geo, mat, group.length);\n'
        '    im.frustumCulled = false;\n'
        '    for (let i = 0; i < group.length; i++) {\n'
        '      const {mesh, h} = group[i];\n'
        '      im.setMatrixAt(i, mesh.matrixWorld.clone());\n'
        '      const col = colormapColor(h.energy);\n'
        '      im.setColorAt(i, new THREE.Color(col.r, col.g, col.b));\n'
        '    }\n'
        '    scene.add(im);\n'
        '    instGroups.push({im, hits, mat});\n'
        '  }\n'
        '  const jetCollections = parseJetsFromXml(xmlText);\n'
        '  buildJetCones(jetCollections, geoScale, geoCenter);\n'
        '  return true;\n'
        '}'
    ))
    A(pp(f'{b("Conceito de InstancedMesh:")} Em vez de criar um {ic("THREE.Mesh")} separado para '
         'cada hit (milhares de draw calls), hits que compartilham a mesma geometria são agrupados '
         f'em um único {ic("THREE.InstancedMesh")}. Cada instância tem sua própria matriz de '
         'transformação e cor, mas compartilha a geometria na GPU.'))

    A(pp('5.4 Sistema de Colormaps', SH3))
    A(pp('O sistema suporta 5 mapas de cores, cada um definido como lista de stops:'))
    A(code_block(
        '// index.html (linha 1428)\n'
        'const COLORMAPS = {\n'
        '  thermal: [\n'
        '    {t:0,   r:.13, g:.40, b:.87},  // Azul escuro\n'
        '    {t:.25, r:.13, g:.80, b:.87},  // Ciano\n'
        '    {t:.5,  r:.27, g:.87, b:.27},  // Verde\n'
        '    {t:.75, r:.87, g:.87, b:.13},  // Amarelo\n'
        '    {t:1,   r:.87, g:.17, b:.13},  // Vermelho\n'
        '  ],\n'
        '  cool: [...], hot: [...], viridis: [...], plasma: [...],\n'
        '};\n'
        '\n'
        'function colormapColor(e_mev) {\n'
        '  const range = cMax - cMin;\n'
        '  const t2 = Math.max(0, Math.min(1, (e_mev - cMin) / range));\n'
        '  const a = stops[i], b = stops[i+1];\n'
        '  const s = (t2 - a.t) / (b.t - a.t);\n'
        '  return { r: a.r + s*(b.r - a.r), g: a.g + s*(b.g - a.g), b: a.b + s*(b.b - a.b) };\n'
        '}'
    ))
    A(pp(f'O colormap é aplicado durante a criação dos {ic("InstancedMesh")} e pode ser atualizado '
         f'em tempo real via {ic("recolorAll()")}. O usuário pode definir valores E min/max '
         'customizados ou usar auto (min/max do evento).'))

    A(pp('5.5 Interação e Seleção de Células', SH3))
    E(blist([
        f'{b("Hover:")} Raycast a cada 3 frames ({ic("updateHover()")}), cria clone com material amarelo semi-transparente',
        f'{b("Seleção:")} Clique esquerdo seleciona célula, mostra overlay vermelho',
        f'{b("Exclusão:")} Tecla Del remove célula selecionada (esconde via matriz zero: {ic("makeScale(0,0,0)")})',
        f'{b("Undo/Redo:")} Ctrl+Z / Ctrl+Shift+Z com pilha de histórico',
        f'{b("Restauração:")} Botão "Restore all" restaura todas as células excluídas',
        f'{b("Threshold:")} Slider que oculta células abaixo de um limiar de energia',
    ]))

    A(pp('5.6 Ghost Atlas e Elementos Auxiliares', SH3))
    A(pp(f'A função {ic("buildGhostAtlas()")} (linha 1544) cria uma representação wireframe dos '
         'sub-detectores internos, fornecendo contexto espacial ao usuário:'))
    A(code_block(
        '// index.html — buildGhostAtlas (simplificado, linha 1544)\n'
        'function buildGhostAtlas(scale, center) {\n'
        '  cyl(1100,  -3100, 3100, 32, wI);     // Inner Detector\n'
        '  cyl(1275,  -2650, 2650, 32, wI);     // Solenoid\n'
        '  cyl(1422,  -3200, 3200, 32, wLAr);   // LAr EM Barrel (inner)\n'
        '  cyl(1985,  -3200, 3200, 32, wLAr);   // LAr EM Barrel (outer)\n'
        '  cyl(2300,  -2820, 2820, 64, wTc);    // TileCal Barrel (inner)\n'
        '  cyl(3820,  -2820, 2820, 64, wTc);    // TileCal Barrel (outer)\n'
        '  // ... Extended Barrel, MBTS, Endcap, HEC, FCal\n'
        '}'
    ))
    A(pp('Cada sub-detector usa um material de cor distinta com baixa opacidade (4–25%) '
         'para não obstruir a visualização dos hits.'))

    A(pp('5.7 Jets (Cones 3D)', SH3))
    A(pp(f'Jets são parseados do JiveXML via {ic("DOMParser")} e renderizados como cones 3D '
         'orientados na direção (η, φ):'))
    A(code_block(
        '// index.html — buildJetCones (simplificado, linha 1777)\n'
        'for (const jet of coll.jets) {\n'
        '  const theta = 2 * Math.atan(Math.exp(-jet.eta));\n'
        '  const dx = Math.sin(theta) * Math.cos(jet.phi);\n'
        '  const dy = Math.sin(theta) * Math.sin(jet.phi);\n'
        '  const dz = Math.cos(theta);\n'
        '\n'
        '  // Comprimento proporcional ao ET (escala logarítmica)\n'
        '  const coneLen = Math.max(200, Math.min(3000,\n'
        '    200 + 400 * Math.log10(1 + etGeV))) * scale;\n'
        '  const coneRadius = coneLen * Math.tan(jetR) * 0.5;\n'
        '\n'
        '  const dir  = new THREE.Vector3(dx, dy, dz).normalize();\n'
        '  const quat = new THREE.Quaternion().setFromUnitVectors(\n'
        '    new THREE.Vector3(0, 1, 0), dir);\n'
        '}'
    ))
    A(pgbrk())

    # ── Section 6 ───────────────────────────────────────────────────────────────
    A(pp('6. Sistema de Eventos ao Vivo', SH2))

    A(pp('6.1 LivePoller', SH3))
    A(pp(f'A classe {ic("LivePoller")} ({fr("xml_test/live_cern/live_poller.js")}) é uma máquina '
         'de estados que busca eventos do servidor ATLAS a cada 5 segundos:'))
    A(sp(6))
    A(diag_poller())
    A(sp(4))
    A(pp('Ciclo de polling:', SH4))
    E(nlist([
        f'{b("Fetch /latest:")} Baixa a página HTML de {ic("atlas-live.cern.ch/latest")} via proxy CORS',
        f'{b("Parse HTML:")} Extrai a referência JiveXML via regex: '
        f'{ic("src=\"([^\"]*)JiveXML_(\\d+)_(\\d+)\\.png\"")}',
        'Comparação: se o eventId é novo (diferente do último), baixa o XML correspondente',
        f'Armazenamento: adiciona à lista interna e salva no Cache API do browser',
        f'Eventos: emite {ic("newxml")} para o viewer carregar o novo evento',
    ]))

    A(pp('6.2 CORS Proxy', SH3))
    A(pp('Como o servidor ATLAS não habilita CORS, o sistema utiliza uma cadeia de proxies:'))
    A(dtable(
        ['Prioridade', 'Proxy', 'Tipo', 'Descrição'],
        [
            ['1', 'Cloudflare Worker', 'qs (?url=)', 'Próprio, mais confiável'],
            ['2', 'Direct',            'raw',        'Funciona na rede CERN'],
            ['3', 'AllOrigins',        'json',       'Proxy público (resposta JSON)'],
            ['4', 'CodeTabs',          'raw',        'Proxy público alternativo'],
            ['5', 'HTMLDriven',        'raw',        'Último recurso'],
        ],
        col_widths=[2.2*cm, 4.0*cm, 2.0*cm, CW - 2.2*cm - 4.0*cm - 2.0*cm],
    ))
    A(pp(f'O Cloudflare Worker ({fr("xml_test/live_cern/cors-proxy.js")}) é restrito a '
         f'{ic("atlas-live.cern.ch")}:'))
    A(code_block(
        '// cors-proxy.js (linha 41)\n'
        'if (targetUrl.hostname !== ALLOWED_ORIGIN_HOST) {\n'
        '  return jsonError(403, `Forbidden: only ${ALLOWED_ORIGIN_HOST} is allowed`);\n'
        '}'
    ))
    A(pp(f'Quando um proxy funciona, ele é "travado" ({ic("_proxyIdx")}) para evitar re-probing '
         'em cada ciclo.'))

    A(pp('6.3 Cache de Eventos', SH3))
    A(pp(f'O {ic("LivePoller")} utiliza a {b("Cache API")} do browser para persistir eventos '
         'entre sessões:'))
    E(blist([
        f'Cache name: {ic("atlas-live-xml-v2")}',
        f'Limite: {b("10 eventos mais recentes")}',
        f'Metadata (id, timestamp, url) armazenado no header {ic("X-Atlas-Meta")}',
        'Na inicialização, eventos são restaurados do cache e ordenados por timestamp',
        'Ao exceder o limite, os eventos mais antigos são removidos',
    ]))

    A(pp('6.4 Modo Offline', SH3))
    A(pp('O modo offline permite carregar arquivos XML locais de duas formas:'))
    E(nlist([
        f'{b("showDirectoryPicker API:")} Seleciona um diretório inteiro e lista todos os {ic(".xml")}',
        f'{b("File input fallback:")} Seleciona arquivos individuais',
    ]))
    A(pp('O carousel de navegação permite navegar entre eventos com setas ← →, '
         'e o auto-play avança automaticamente a cada 8 segundos.'))
    A(pgbrk())

    # ── Section 7 ───────────────────────────────────────────────────────────────
    A(pp('7. Delivery dos Arquivos', SH2))

    A(pp('7.1 Estratégia de Cache', SH3))
    A(pp(f'O sistema implementa {b("duas camadas de cache")} independentes:'))
    A(pp('Cache de Geometria (permanente):', SH4))
    A(dtable(
        ['Recurso', 'Cache Key', 'Estratégia'],
        [
            [ic('CaloGeometry.glb'), ic('cgv-geo-v1'),
             f'Cache-first com versionamento. Bump {ic("GEO_CACHE_VER")} para invalidar.'],
            [ic('CaloGeometry.cgv'), ic('cgv-geo-v1'),
             'Mesmo versionamento do GLB'],
        ],
        col_widths=[4.0*cm, 3.0*cm, CW - 4.0*cm - 3.0*cm],
    ))
    A(code_block(
        '// Purga automática de versões antigas\n'
        "if ('caches' in window) {\n"
        '  caches.keys().then(ks => ks.forEach(k => {\n'
        "    if (k.startsWith('cgv-geo-') && k !== GEO_CACHE_VER) caches.delete(k);\n"
        '  }));\n'
        '}'
    ))
    A(pp('Cache de Eventos (rotativo):', SH4))
    A(dtable(
        ['Cache', 'Limite', 'Estratégia'],
        [[ic('atlas-live-xml-v2'), '10 eventos', 'FIFO — remove o mais antigo quando excede']],
        col_widths=[4.5*cm, 2.5*cm, CW - 4.5*cm - 2.5*cm],
    ))

    A(pp('7.2 Hosting e CDN', SH3))
    A(pp(f'O projeto é hospedado via {b("GitHub Pages")} com a seguinte estratégia de delivery:'))
    A(dtable(
        ['Arquivo', 'Origem', 'Razão'],
        [
            ['index.html, JS, CSS', 'GitHub Pages', 'Texto leve, CORS automático'],
            [ic('CaloGeometry.cgv'), 'GitHub Pages', 'Texto leve (~600 KB)'],
            [ic('CaloGeometry.glb'), 'media.githubusercontent.com (Git LFS)',
             'Binário pesado (~50 MB), CORS habilitado'],
            ['WASM (.wasm, .js)', 'GitHub Pages (relativo)', 'Carregado via import local'],
            ['Three.js, fontes, ícones', 'CDN (jsdelivr.net, googleapis)',
             'Cache CDN global'],
        ],
        col_widths=[4.0*cm, 5.5*cm, CW - 4.0*cm - 5.5*cm],
    ))

    A(pp('7.3 Validação de Integridade', SH3))
    A(pp('Antes de usar o GLB, o sistema verifica os magic bytes do formato GLTF 2.0:'))
    A(code_block(
        '// index.html (linha 2823)\n'
        'const h  = new Uint8Array(buf, 0, 12);\n'
        'const ok = h[0]===0x67 && h[1]===0x6C &&\n'
        "           h[2]===0x54 && h[3]===0x46;   // 'glTF'\n"
        "if (!ok) throw new Error('Not a valid GLB binary');"
    ))
    A(pp(f'Para o CGV, a validação é feita pelo WASM que conta linhas terminando em {ic("cell_*")}:'))
    A(code_block(
        '// wasm/src/lib.rs — load_cgv (linha 434)\n'
        'pub fn load_cgv(cgv_text: &str) -> usize {\n'
        '    cgv_text.lines()\n'
        '        .filter(|l| {\n'
        '            let t = l.trim();\n'
        "            !t.is_empty() && !t.starts_with('#') && {\n"
        '                let last = t.split(\'\\t\')\n'
        "                    .filter(|s| !s.trim().is_empty() && *s != \"->\").last();\n"
        '                last.map(|s| s.starts_with("cell")).unwrap_or(false)\n'
        '            }\n'
        '        })\n'
        '        .count()\n'
        '}'
    ))
    A(pgbrk())

    # ── Section 8 ───────────────────────────────────────────────────────────────
    A(pp('8. Restrições, Validações e Tolerâncias', SH2))

    A(pp('8.1 Restrições na Conversão (root2scene.mjs)', SH3))
    A(dtable(
        ['Restrição', 'Implementação', 'Efeito'],
        [
            ['Visibilidade',      f'{ic("geoAtt & 0x08")} (bit kVisThis)', 'Nós invisíveis são pulados'],
            ['Profundidade',      f'{ic("--depth <n>")}',                  'Limita profundidade da árvore'],
            ['Faces por shape',   f'{ic("--max-faces <n>")}',              'Limita tesselação de cada geometria'],
            ['Subtree',           f'{ic("--subtree <prefix>")}',           'Filtra filhos diretos da raiz por prefixo'],
            ['Identidade',        f'{ic("TGeoIdentity → null")}',          'Matrizes identidade não geram transformação'],
            ['Shape desconhecida', 'Key única com random',                 'Sem compartilhamento de geometria'],
        ],
        col_widths=[3.0*cm, 5.0*cm, CW - 3.0*cm - 5.0*cm],
    ))

    A(pp('8.2 Tolerâncias no Matching de Hits (WASM)', SH3))
    A(dtable(
        ['Sub-detector', 'Tolerância η', 'Detalhes'],
        [
            ['TileCal',    'min_dist + 0.0005',         'Tolerância estrita baseada na distância mínima encontrada'],
            ['LAr Barrel', 'half_deta(layer) + 0.002',  'Variável por camada: 0.0016 (S1) a 0.025 (S3)'],
            ['LAr Endcap', 'half_deta(layer, i) + 0.003','Variável por camada E índice (segmentação não-uniforme)'],
            ['HEC',        '0.08',                      'Threshold fixo para η'],
            ['Seleção pós', 'best_dist + 0.001 a 0.005','Filtragem pós-seleção do melhor candidato'],
        ],
        col_widths=[3.0*cm, 4.5*cm, CW - 3.0*cm - 4.5*cm],
    ))

    A(pp('8.3 Validações no Viewer (index.html)', SH3))
    E(blist([
        f'{b("GLB:")} Verificação de magic bytes antes do parse',
        f'{b("XML:")} Resultado do WASM verificado via {ic("result.ok")}',
        f'{b("Meshes:")} Hits sem mesh correspondente são contados como {ic("_miss")} e logados',
        f'{b("Energia:")} Interpolação de colormap clampada a [0, 1]',
        f'{b("Cache:")} Versões antigas purgadas automaticamente',
        f'{b("Proxy:")} Timeout de 15 segundos por tentativa, fallback sequencial',
    ]))

    A(pp('8.4 Restrições no XML (WASM)', SH3))
    E(blist([
        f'{b("Arrays desiguais:")} Truncados ao menor comprimento',
        f'{b("Tokens inválidos:")} {ic("parse::<f32>()")} com {ic("filter_map")} — silenciosamente ignorados',
        f'{b("Tags ausentes:")} Bloco inteiro é pulado ({ic("Option::None")})',
        f'{b("Hit sem match:")} Incrementa {ic("unmapped")}, não gera erro',
        f'{b("Channel MBTS inválido:")} {ic("_ => continue")} — pula o hit',
        f'{b("η fora da cobertura:")} LAr Barrel rejeita |η| &gt; 1.55, Endcap rejeita fora de [1.35, 3.25], '
        'HEC rejeita fora de [1.4, 3.3]',
    ]))

    # ── Section 9 ───────────────────────────────────────────────────────────────
    A(pp('9. Setup e Utilitários', SH2))

    A(pp('9.1 Instalação e Configuração', SH3))
    A(pp(f'O script {fr("setup.mjs")} prepara as dependências JSROOT patcheando os imports '
         'internos:'))
    A(code_block(
        '// setup.mjs\n'
        '// Copia geobase.mjs e csg.mjs de node_modules/jsroot/modules/geom para lib/\n'
        '// e substitui imports internos pelos exports públicos do JSROOT:\n'
        '\n'
        "patch('geobase.mjs', [\n"
        "  [\"from '../core.mjs'\",        \"from 'jsroot/core'\"],\n"
        "  [\"from '../base/colors.mjs'\", \"from 'jsroot/colors'\"],\n"
        "  [\"from '../base/base3d.mjs'\", \"from 'jsroot/base3d'\"],\n"
        ']);\n'
        '\n'
        "patch('csg.mjs', [\n"
        "  [\"from '../base/base3d.mjs'\", \"from 'jsroot/base3d'\"],\n"
        ']);'
    ))
    A(pp('Passos de setup:', SH4))
    A(code_block(
        '# 1. Instalar dependências\n'
        'npm install jsroot --ignore-scripts\n'
        '\n'
        '# 2. Patchear imports\n'
        'node setup.mjs\n'
        '\n'
        '# 3. Converter arquivo .root\n'
        'node root2scene.mjs CaloGeometry.root --out ./root_file --visible-only\n'
        '\n'
        '# 4. (Opcional) Otimizar GLB\n'
        'node optimize_glb.mjs --quantize\n'
        '\n'
        '# 5. Compilar WASM (requer wasm-pack)\n'
        'cd wasm && wasm-pack build --target web'
    ))

    A(pp('9.2 Scripts npm', SH3))
    A(pp(f'O {fr("package.json")} define o projeto como módulo ESM:'))
    A(code_block(
        '{\n'
        '  "name": "root2scene",\n'
        '  "version": "1.0.0",\n'
        '  "type": "module",\n'
        '  "main": "root2scene.mjs",\n'
        '  "bin": { "root2scene": "./root2scene.mjs" },\n'
        '  "dependencies": { "jsroot": "^7.10.3" },\n'
        '  "devDependencies": {\n'
        '    "@gltf-transform/core": "^4.3.0",\n'
        '    "@gltf-transform/functions": "^4.3.0"\n'
        '  }\n'
        '}'
    ))

    # ── Section 10 ──────────────────────────────────────────────────────────────
    A(pp('10. Internacionalização', SH2))
    A(pp('O viewer suporta 4 idiomas com detecção automática do browser:'))
    A(dtable(
        ['Código', 'Idioma', 'Detecção'],
        [
            [ic('en'), 'English',    'Padrão'],
            [ic('fr'), 'Français',   f'{ic("navigator.language")} começando com "fr"'],
            [ic('no'), 'Norsk',      '"no", "nb" ou "nn"'],
            [ic('pt'), 'Português',  '"pt"'],
        ],
        col_widths=[1.8*cm, 3.0*cm, CW - 1.8*cm - 3.0*cm],
    ))
    A(pp(f'As traduções são armazenadas em um objeto {ic("i18n")} (linha 1135 de '
         f'{fr("index.html")}) e aplicadas via {ic("data-i18n")} attributes nos elementos HTML. '
         f'A preferência é persistida em {ic("localStorage(\'cgv-lang\')")}.'))
    A(code_block(
        '// index.html (linha 1348)\n'
        'function applyLang(code) {\n'
        '  currentLang = code;\n'
        "  localStorage.setItem('cgv-lang', code);\n"
        "  document.querySelectorAll('[data-i18n]').forEach(el => {\n"
        '    const key = el.getAttribute(\'data-i18n\');\n'
        '    el.textContent = t(key);\n'
        '  });\n'
        '}'
    ))

    # ── Footer ───────────────────────────────────────────────────────────────────
    A(hr())
    A(pp('CGV WEB — Calorimeter Geometry Viewer', SFOOT))
    A(pp('UFJF / NIPSCERN · CERN ATLAS TileCal', SFOOT))
    A(pp('Março 2026', SFOOT))

    return story


# ── Main ─────────────────────────────────────────────────────────────────────────

def main():
    out = os.path.join(os.path.dirname(__file__), 'CGV_WEB_Documentation.pdf')
    doc = SimpleDocTemplate(
        out,
        pagesize=A4,
        leftMargin=ML, rightMargin=MR,
        topMargin=MT,  bottomMargin=MB,
        title='CGV WEB — Documentação Técnica Completa',
        author='UFJF / NIPSCERN',
        subject='CGV WEB Technical Documentation',
    )
    story = build_story()
    doc.build(story, onFirstPage=_page_decor, onLaterPages=_page_decor)
    print(f'PDF gerado: {out}')


if __name__ == '__main__':
    main()
