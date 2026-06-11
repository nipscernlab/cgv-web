# Deploy do CGVWeb no site nipscern.com — como funciona hoje

> Estudo consolidado em 2026-06-11. O antigo `npm run deploy` (deploy.mjs, que copiava
> o build para o checkout vizinho do nipscernweb) foi **aposentado** no commit
> `a3fd39b` — não existe mais cópia de arquivos entre repositórios. O fluxo atual é
> 100% automático a partir de um `git push`.

## 1. Arquitetura (3 peças)

```
┌──────────────────────────┐   push main    ┌─────────────────────────────────┐
│ repo nipscernlab/cgv-web │ ─────────────▶ │ GitHub Actions: static.yml      │
│ (este repositório)       │                │  1. fetch-geometry (release     │
└──────────────────────────┘                │     geometry-v4 → public/…)     │
                                            │  2. fetch-samples (samples-v1)  │
                                            │  3. publica public/ no          │
                                            │     GitHub Pages                │
                                            └────────────────┬────────────────┘
                                                             ▼
                              https://nipscernlab.github.io/cgv-web/   (upstream)
                                                             ▲
┌─────────────────────────────┐  rota /projects/cgvweb*     │ proxy reverso
│ Cloudflare (DNS de          │  rota /library/cgvweb/twiki*│
│ nipscern.com) + **Worker**  │ ────────────────────────────┘
│ cgvweb-proxy                │
└─────────────┬───────────────┘
              │ demais rotas passam direto
              ▼
   www.nipscern.com → GitHub Pages do repo nipscernlab/nipscernweb
   (site institucional; CNAME www.nipscern.com, branch main, build legacy)
```

1. **Este repo (cgv-web)** publica o app: o workflow [.github/workflows/static.yml](../.github/workflows/static.yml)
   roda **a cada push na `main`**, baixa os assets pesados que NÃO ficam no git
   (geometria da release `geometry-v4`, XMLs de exemplo da release `samples-v1` — tags
   fixadas em `tools/scripts/fetch-geometry.mjs:16` e `fetch-samples.mjs:16`) e faz o
   upload da pasta `public/` inteira para o **GitHub Pages** deste repositório:
   `https://nipscernlab.github.io/cgv-web/`.

2. **O site (nipscernweb)** é outro GitHub Pages (custom domain `www.nipscern.com`,
   DNS atrás da Cloudflare). A página do projeto
   (`projects/cgv.html`) tem um `<iframe>` do preview (`cgvweb/nipscern/index.html`)
   e botões para `cgvweb/` — caminhos relativos que caem nas rotas do Worker.

3. **O Worker da Cloudflare** (`cgvweb-proxy`, fonte versionada em
   `nipscernweb/workers/cgvweb-proxy.js`) intercepta as rotas
   `nipscern.com/projects/cgvweb*` e `nipscern.com/library/cgvweb/twiki*`
   (e variantes `www.`) e serve o conteúdo do upstream
   `https://nipscernlab.github.io/cgv-web` — mantendo a URL canônica
   `nipscern.com/projects/cgvweb` que está consolidada no CERN. Ele também normaliza
   `/projects/cgvweb` → `/projects/cgvweb/` (301) para os caminhos relativos do app
   resolverem dentro do prefixo.

## 2. Então, como "enviar tudo para o site"?

```bash
git push origin main
```

Só isso. Em ~1–2 minutos o workflow `Deploy to GitHub Pages` termina e o conteúdo novo
está em `nipscernlab.github.io/cgv-web` → e portanto em
`nipscern.com/projects/cgvweb` via Worker. Acompanhe em:
<https://github.com/nipscernlab/cgv-web/actions> (workflow "Deploy to GitHub Pages").

Checklist pós-push:

1. Action verde (Deploy to GitHub Pages **e** CI — atenção: são independentes; o
   Pages publica MESMO se o CI de lint/testes falhar. Não fazer push com CI quebrado).
2. Abrir `https://nipscernlab.github.io/cgv-web/?perf=1` (upstream direto).
3. Abrir `https://nipscern.com/projects/cgvweb/` (via Worker).
4. `npm run smoke` local antes do push é a melhor proteção.

## 3. Quando cada peça precisa de atenção

| Mudança | O que fazer |
|---|---|
| Código/CSS/HTML do app (`public/…`) | Nada além do push — fluxo automático |
| **Geometria** (`CaloGeometry.glb`) | Os GLBs NÃO vão no git. Publicar uma nova release de assets (`geometry-v5`: `gh release create geometry-v5 CaloGeometry.glb.gz atlas.glb.gz …`), atualizar `TAG` em `tools/scripts/fetch-geometry.mjs` e dar push. O app detecta a versão nova via ETag e renova o cache OPFS dos usuários sozinho |
| **Samples** (XMLs de exemplo) | Mesmo esquema com `samples-vN` + `TAG` em `fetch-samples.mjs` |
| **Worker** (`cgvweb-proxy.js`) | A fonte vive no repo nipscernweb (`workers/`), mas o deploy é **manual no painel da Cloudflare** (Workers & Pages → cgvweb-proxy → editar/colar → Deploy). Não há wrangler.toml/CI para ele. As rotas (`/projects/cgvweb*`, `/library/cgvweb/twiki*`, + `www.`) são registradas no painel |
| Página do projeto no site (texto, preview, botões) | Editar `nipscernweb/projects/cgv.html` e dar push na main do **nipscernweb** |
| TWiki (documentação) | Vive em `public/twiki/` DESTE repo; sai no mesmo push (servida em `/library/cgvweb/twiki` pelo Worker) |

## 4. Cache — por que às vezes "não atualizou"

- O GitHub Pages serve com `Cache-Control: max-age=600` (10 min) — o Worker repassa.
  Mudanças podem demorar ~10 min para todos verem; Ctrl+F5 resolve na hora.
- A **geometria** tem cache próprio no navegador (OPFS) com validação por
  ETag/Last-Modified a cada visita — atualiza sozinha quando a release muda.
- A Cloudflare pode adicionar cache de borda conforme as regras da zona; se um arquivo
  ficar teimoso, "Purge Cache" no painel da zona nipscern.com.

## 5. Histórico (para entender referências antigas)

- `deploy.bat` → `deploy.mjs` (`npm run deploy`): copiava `public/` para
  `../nipscernweb/projects/cgvweb` e o twiki para `../nipscernweb/library/cgvweb/twiki`,
  e o site publicava tudo junto. Problemas: build do app commitado no repo do site,
  história inflada, dois pushes por mudança.
- Aposentado em 2026-06-10 (`a3fd39b`): o app passou a ser publicado pelo próprio repo
  (GitHub Pages + workflow) e o site só faz proxy. O caminho público não mudou —
  `nipscern.com/projects/cgvweb` — então nenhum link do CERN quebrou.

## 6. Releases deste repositório — dois tipos, não confundir

- **Releases de assets** (`geometry-vN`, `samples-vN`): existem para DISTRIBUIR
  arquivos grandes que o git não versiona. O workflow de deploy e o `npm run dev`
  dependem delas. Criar uma nova NÃO publica nada por si só — é preciso atualizar a
  `TAG` nos scripts de fetch.
- **Releases de versão do app** (`vX.Y.Z`, ex.: v1.1.0): marcos de código para
  changelog/citação. Não participam do deploy (o site sempre serve a `main`).
