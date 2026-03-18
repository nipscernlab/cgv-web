# cgv-web
Calorimeter Geometry Viewer

Converte arquivos CERN `.root` em cenas 3-D interativas no navegador.

## Estrutura

```
cgv-web/
├── index.html   # Visualizador principal (abrir no navegador)
├── root2scene.mjs      # CLI: converte .root → .cgv + .gltf
├── setup.mjs           # Pós-instalação: corrige imports do jsroot
├── wasm/               # Módulo Rust/WASM (tile_viz)
└── wasm-pkg/           # Saída do wasm-pack (gerada pelo build)
```

## Pré-requisitos (Windows)

| Ferramenta | Instalação |
|---|---|
| [Node.js](https://nodejs.org/) ≥ 18 | Instalador oficial ou `winget install OpenJS.NodeJS` |
| [Rust](https://www.rust-lang.org/tools/install) | `winget install Rustlang.Rustup` |
| wasm-pack | `cargo install wasm-pack` |

Após instalar o Rust, reinicie o terminal para que `cargo` fique no PATH.

---

## 1. Compilar o módulo WASM (Rust)

```bat
cd wasm
wasm-pack build --target web --out-dir ..\wasm-pkg
cd ..
```

O diretório `wasm-pkg/` será gerado com `tile_viz.js`, `tile_viz_bg.wasm` e os arquivos de tipagem.

---

## 2. Instalar dependências Node.js

```bat
npm install jsroot --ignore-scripts
```

Em seguida, execute o script de setup uma única vez para corrigir os imports internos do jsroot:

```bat
node setup.mjs
```

---

## 3. Converter um arquivo .root

```bat
node root2scene.mjs <arquivo.root> [opções]
```

### Opções

| Opção | Descrição |
|---|---|
| `--out <dir>` | Diretório de saída (padrão: mesmo diretório do `.root`) |
| `--max-faces <n>` | Limite de faces por shape (padrão: `0` = ilimitado) |
| `--depth <n>` | Profundidade máxima da árvore (padrão: `0` = toda) |
| `--visible-only` | Ignorar volumes invisíveis (`kVisThis = 0x08`) |
| `--no-gltf` | Gerar apenas o `.cgv` |
| `--no-cgv` | Gerar apenas o `.gltf` |
| `--verbose` | Log detalhado |
| `--help` | Exibe ajuda |

### Exemplo

```bat
node root2scene.mjs atlas.root --out output --visible-only
```

Gera `output\atlas.cgv` e `output\atlas.gltf`.

---

## 4. Visualizar no navegador

Abra `index.html` em um servidor HTTP local (necessário por restrições de CORS ao carregar WASM e GLTF):

```bat
npx serve .
```

Acesse `http://localhost:3000/index.html` e carregue os arquivos gerados.

---

## Compilação completa (resumo)

```bat
cd wasm && wasm-pack build --target web --out-dir ..\wasm-pkg && cd ..
npm install jsroot --ignore-scripts
node setup.mjs
node root2scene.mjs <arquivo.root>
npx serve .
```
