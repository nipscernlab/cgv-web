# Lista de Tarefas — CGV Web

Documento vivo com melhorias planejadas, bugs conhecidos e ideias futuras.
Atualizado manualmente conforme o projeto evolui.

---

## Legenda de Prioridade

| Símbolo | Significado |
|---------|-------------|
| 🔴 | Crítico — bloqueia uso ou correto funcionamento |
| 🟠 | Alta — impacta experiência significativamente |
| 🟡 | Média — melhoria importante, mas não urgente |
| 🟢 | Baixa — desejável, fácil de adiar |
| 💡 | Ideia — ainda em avaliação, sem compromisso |

---

## Em Progresso

- [ ] 🟠 Refatoração de `js/main.js` — extrair módulos de bootstrap em andamento (`sceneInit`, `modeWiring`, `layersPanel`, `topToolbar` já extraídos; ainda restam partes do loop de eventos e inicialização de UI)

---

## Alta Prioridade

- [ ] 🔴 Cobrir `parser/` (Rust/WASM) com testes de regressão para eventos XML malformados ou truncados
- [ ] 🟠 Adicionar tratamento de erro visível ao usuário quando o fetch de evento ao vivo falha (atualmente silencia no console)
- [ ] 🟠 Validar layout mobile em viewport < 360 px — botões da toolbar se sobrepõem em telas muito estreitas
- [ ] 🟠 Documentar API pública de `js/minimap.js` e `js/slicer.js` no `twiki/`

---

## Média Prioridade

- [ ] 🟡 Adicionar suporte a teclas de atalho configuráveis (salvar preferências em `localStorage`)
- [ ] 🟡 Expandir cobertura de testes unitários em `tests/` para os módulos de parsing e renderização
- [ ] 🟡 Internacionalizar mensagens de erro e do pipeline de status (atualmente em inglês fixo)
- [ ] 🟡 Permitir upload de múltiplos arquivos XML de uma vez (batch local)
- [ ] 🟡 Exportar frame atual como imagem PNG com resolução configurável
- [ ] 🟡 Revisar paletas de cor para acessibilidade (modo daltônico foi removido — reavaliar)

---

## Baixa Prioridade

- [ ] 🟢 Adicionar animação de transição entre eventos consecutivos no modo ao vivo
- [ ] 🟢 Implementar histórico de eventos navegável no modo local (botões anterior/próximo)
- [ ] 🟢 Suporte a tema escuro/claro com alternância manual (além do automático via `prefers-color-scheme`)
- [ ] 🟢 Compressão de `CaloGeometry.glb` com Draco para reduzir tamanho do primeiro carregamento
- [ ] 🟢 Adicionar métricas de performance ao HUD de desenvolvimento (ms por frame, objetos visíveis)
- [ ] 🟢 Criar script de CI para validar que todas as chaves de i18n estão sincronizadas entre os 4 idiomas

---

## Ideias em Avaliação

- [ ] 💡 Modo de comparação lado a lado entre dois eventos
- [ ] 💡 Exportar dados do evento visível como JSON simplificado (para análise externa)
- [ ] 💡 Integração com CERN Open Data para carregar eventos públicos diretamente da URL
- [ ] 💡 Visualização de energia depositada por camada do TileCal em painel lateral dedicado
- [ ] 💡 Suporte a WebXR para visualização em realidade virtual

---

## Concluído Recentemente

- [x] Renderizar elétrons como setas vermelhas/verdes com rótulos `e⁻`/`e⁺`
- [x] Slicer: substituir translação Y por rotação em Z; adicionar suporte a long-press em touch
- [x] Extrair inicialização de cena e WASM para `bootstrap/sceneInit.js`
- [x] Atualizar Vitest 2.1.0 → 4.1.5 (corrigir alertas de segurança esbuild/vite)
- [x] Extrair wiring de modo ao vivo/amostra para `bootstrap/modeWiring.js`
- [x] Separar `style.css` em 12 arquivos por componente
- [x] Remover seletores CSS mortos (−289 linhas)
- [x] HUD de colisão: separar info de evento do statusbar do pipeline
- [x] Minimap η×φ com células coloridas por detector e clusters desenhados como círculos
- [x] i18n em 4 idiomas (en/fr/no/pt) com 156 chaves sincronizadas

---

> Para contribuir com qualquer item, veja [CONTRIBUTING.md](CONTRIBUTING.md).
> Dúvidas ou sugestões: abra uma [issue](https://github.com/nipscernlab/cgv-web/issues).
