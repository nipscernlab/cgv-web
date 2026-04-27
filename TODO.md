# Tarefas — NIPSCERN / CGV

Documento vivo com tudo que está planejado para o CGV, o site NIPSCERN e os projetos relacionados.
Atualizado manualmente à medida que o trabalho evolui.

---

## Legenda

| Símbolo | Prioridade |
|---------|------------|
| 🔴 | Crítica |
| 🟠 | Alta |
| 🟡 | Média |
| 🟢 | Baixa |
| 💡 | Ideia em avaliação |

---

## CGV Web — Correções

- [ ] 🔴 Corrigir captura de tela em resolução 10k — a imagem está deslocada em relação à cena renderizada
- [ ] 🔴 Corrigir vetores de elétrons que ultrapassam os limites das células do detector
- [ ] 🟠 Barra de progresso da tela inicial deve refletir o carregamento real — cada etapa (geometria, WASM, evento) precisa ter peso correspondente

---

## CGV Web — Interface e Visualização

- [ ] 🔴 Refazer toda a interface do CGV: mais compacta, responsiva e funcional em celulares, tablets e desktops
- [ ] 🟠 Criar tela de carregamento dinâmica — SVG animado ou vídeo com identidade visual do CGV
- [ ] 🟠 Substituir o rótulo genérico `TRACK` pelo nome correto da partícula (múon, elétron, etc.) conforme o tipo do objeto
- [ ] 🟠 Adicionar highlight na seta ou linha pontilhada ao passar o mouse sobre uma partícula (track ou múon)
- [ ] 🟠 Rever cor, formato, nome e card de informações do detector de múons
- [ ] 🟠 Rever todas as cores de células e partículas — elétron, pósitron, múon, fóton e demais
- [ ] 🟡 Adicionar histograma das energias das células no painel lateral
- [ ] 🟡 Adicionar legenda visual das partículas, explicando cada símbolo: γ (gama), e⁻, e⁺, μ, etc.
- [ ] 🟡 Definir se o feixe (*beam*) deve ser exibido por padrão — documentar a decisão
- [ ] 🟡 Adicionar separador de data/tempo entre eventos nas listas de XMLs (modos Web, Server e Samples)
- [x] 🟡 Gerar novo bake da geometria do detector com rótulos para elétrons, fótons, múons e pósitrons
- [ ] 🟡 Adicionar geometria do detector de múons (espectrômetro) ao bake do nipscern
- [ ] 🟡 Revisar a representação de partículas no diagrama de Feynman
- [ ] 🟡 Substituir a biblioteca de ícones atual — avaliar alternativas mais leves e mantidas
- [ ] 🟢 Melhorar a animação de entrada em telas pequenas (mobile)
- [ ] 💡 Modo para daltônicos — paleta de cores alternativa acessível

---

## CGV Web — Repositório e Documentação

- [ ] 🟠 Auditar os arquivos da release: verificar dependências realmente necessárias no `package.json` e revisar todos os comandos do ambiente de desenvolvimento
- [ ] 🟠 Atualizar o README com uma imagem da geometria do detector (ou de um evento real), com bordas arredondadas
- [ ] 🟡 Revisar toda a TWIKI — atualizar conteúdo, incluir imagem do evento especial na página inicial e publicar no site NIPSCERN
- [ ] 🟡 Reescrever o `CODE_OF_CONDUCT.md` e o `CONTRIBUTING.md`

---

## Site NIPSCERN

- [ ] 🟠 Reativar o VLibras em todas as páginas do site
- [ ] 🟠 Configurar o GoatCounter em todas as páginas do site e do CGV (exceto Point One)
- [ ] 🟡 Expandir a tradução do site para todas as páginas — identificar e traduzir textos ainda em um só idioma
- [ ] 🟡 Adicionar o projeto CGV Web na página de projetos do GitHub ao perfil da organização NIPSCERN

---

## Blog NIPSCERN

- [ ] 🟠 Definir um nome e identidade visual para o blog
- [ ] 🟡 Publicar notícia no blog sobre o CGV: história, estado atual, perspectivas para o Run 4 e 2030, conquistas e vídeo na sala de controle do ATLAS

---

## AURORA

- [ ] 🟠 Finalizar os modos **PROCESSOR**, **PROJECT** e **VERILOG** da interface AURORA (incluindo modo sem processador)

---

## Design e Repositórios

- [ ] 🟡 Revisar o design visual de todos os softwares e produtos NIPSCERN — identidade unificada
- [ ] 🟢 Profissionalizar todos os repositórios dos projetos: descrições, topics, READMEs, badges e licenças

---

> Para contribuir com qualquer item, veja [CONTRIBUTING.md](CONTRIBUTING.md).
> Dúvidas ou sugestões: abra uma [issue](https://github.com/nipscernlab/cgv-web/issues).
