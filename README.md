# Your Checklist — V1

Planejamento de compras para casa, viagens e eventos. Next.js + React, PostgreSQL/Neon, Better Auth e AI SDK. Repositório: [pedromarquetto/your-checklist](https://github.com/pedromarquetto/your-checklist).

## Executar e ativar

Node.js 24 recomendado (mínimo 22.13). `npm ci`, `npm run dev`. Produção: `npm run build` e `npm start`. Testes: `npm test`.

Veja [docs/SETUP.md](docs/SETUP.md) para configurar Neon, contas, IA, busca e a publicação na Vercel. As contas precisam de `DATABASE_URL`, `BETTER_AUTH_SECRET` e `BETTER_AUTH_URL`, seguidas de `npm run db:migrate`. `npm run config:check` confere a configuração sem exibir segredos. Sem essas variáveis, o modo local continua disponível e informa que os dados ficam neste navegador.

## Funcionalidades

- Conta com e-mail/senha, troca de senha e encerramento de outras sessões.
- Projetos independentes com orçamento, ambientes e categorias; criação, renomeação e exclusão.
- Itens, subitens, quantidades, prioridades, especificações e links.
- Checklist, kanban, filtros, pesquisa e orçamento consolidado, sem duplicar pais/subitens.
- Compras com valor total, data, loja, forma de pagamento e parcelas; confirmação antes de reabrir.
- Importação CSV/XLSX/XLS com revisão e mapeamento, validação e deduplicação. Até 5 MB/2.000 linhas por importação; primeira aba.
- Templates CSV/Excel configuráveis e exportação de itens e ofertas.
- Comparador de ofertas com fotos, preço, frete, nota e quantidade de reviews, mantendo uma opção atual por produto e as revisões no histórico.
- Galerias privadas por categoria com upload múltiplo, links, legendas e ampliação. Podem existir antes dos itens.
- Persistência da conta no Neon, salvamento sequencial com revisão otimista, indicação de erros e proteção contra sobrescrita entre abas/dispositivos.
- Migração dos dados e imagens do modo local para a conta, sem apagar a origem. Backup/importação JSON dos dados; o backup de dados não inclui as galerias.
- Assistente contextual real quando configurado. Pesquisa de ofertas via SerpApi quando configurada, com histórico persistido e cotas por conta.

## Escopo e limites

A V1 é pessoal: o mesmo usuário acessa sua conta em vários dispositivos. Convites/colaboração entre contas não foram implementados. O histórico registra consultas realizadas/importadas, sem recuperar preços antigos inexistentes. As parcelas entram integralmente no orçamento e não geram calendário de faturas. A IA não consulta a web nem altera os itens; a busca de ofertas é uma ação separada. Falhas externas não são substituídas por dados fictícios.

Os exemplos no comparador/importador ficam explicitamente identificados. Contas novas começam vazias. Login não exige confirmação de e-mail nesta etapa; recuperação por e-mail aguarda uma integração de entrega. Há troca de senha autenticada.

Armazenamento V1: documento JSONB por usuário para projetos/itens/compras/ofertas, tabelas separadas para consultas, galerias, imagens e cotas. Toda operação é autenticada e filtrada pelo usuário da sessão. `database/schema.sql` é a proposta antiga; a migração operacional está em `database/migrations/001_workspace.sql`.

Limites de proteção: 50 projetos, 5.000 itens por projeto, 20.000 snapshots no documento e até 3 MB por gravação do workspace. Referências: até 24 fotos/categoria e 100 MB/conta, com JPEG preparado em até 2048 px/1,5 MB por imagem. As referências externas dependem de seus links.

## Validação

`npm test` cobre regras de importação, moeda, hierarquia, cálculos, comparação, migração e persistência. Os testes de integração usam PostgreSQL em WASM e a biblioteca real de autenticação para conferir isolamento, conflitos, imagens, cotas e troca de senha. OpenAI e SerpApi são substituídos por respostas controladas somente nos testes.

A validação com Neon, credenciais reais dos provedores e domínio publicado deve seguir o checklist em [docs/SETUP.md](docs/SETUP.md). O build não roda migrações nem exige credenciais. O CI executa testes, build e o fluxo pelo navegador. Veja `npm run test:browser` no guia de configuração.

## Contrato de importação de itens

Obrigatórios: `ambiente`, `categoria`, `item`. Opcionais: `id`, `item_pai`, `quantidade`, `valor_previsto_unitario`, `status`, `prioridade`, `valor_pago_total`, `forma_pagamento`, `parcelas`, `data_compra`, `loja`, `link`, `observacoes`.

Datas em AAAA-MM-DD. Status: Planejado, Pesquisando, Comprado, Recebido. Prioridade: Alta, Média, Baixa. Subitens apontam ao ID do pai e herdam ambiente/categoria. Compras importadas exigem valor total, data e pagamento. Duplicados usam nome, ambiente e categoria. Links HTTP/HTTPS. Valores em notação brasileira ou decimal com ponto.

## Fluxo de pesquisa e importação de opções

1. Abra Buscar opções no item e copie o pedido de pesquisa pronto (ele inclui o ID do item e o contrato de colunas).
2. Peça ao ChatGPT para pesquisar ofertas reais e devolver CSV no template. Preços e links devem ser verificados, com a data real da consulta; avaliações/frete desconhecidos ficam vazios.
3. Use Importar opções para este item. Aceita CSV colado e arquivos CSV/XLSX/XLS; a aba correta e o item já são selecionados.
4. Revise colunas, nomes, links e datas; confirme a importação. O app volta ao comparador na aba Importadas.
5. Filtre as opções por preço, nota, reviews e frete. Consultas antigas ficam na aba Histórico. Use Exportar opções para guardar/reimportar todos os registros do item.

Colunas oficiais, em ordem: `item_id;item;ambiente;categoria;nome;loja;preco;frete;moeda;data_consulta;link;nota;avaliacoes;prazo_entrega;fonte;observacoes;imagem_url`. Na importação vinculada ao item, um CSV mínimo pode conter `nome;preco;link;data_consulta`; loja e demais informações são opcionais. Em lotes, informe `item_id`, ou nome do item com ambiente/categoria para eliminar ambiguidades. Cabeçalhos legados `modelo`, `data` e `url` continuam aceitos.

Datas: AAAA-MM-DD, DD/MM/AAAA ou ISO com horário e fuso. Não se presume data de consulta ausente. Moeda: BRL. Preço unitário positivo, nota de 0 a 5, quantidade de avaliações inteira não negativa. Frete vazio é desconhecido; somente 0 significa grátis. Datas impossíveis, links inválidos e vínculo com outro item bloqueiam a confirmação.

Exemplo da interface: três registros fictícios de dois produtos em duas datas; o comparador mostra duas opções atuais e o Histórico mantém três registros. Esse fluxo foi conferido no iframe isolado, assim como importação manual dos campos mínimos, filtros de reviews e bloqueio de duplicados.

Reimportação de opções verificada no iframe isolado: produto de R$ 4.000,00 em 23/10/2026 foi atualizado para R$ 3.500,00 em 24/10/2026, mesmo com título e parâmetro de campanha diferentes. O comparador manteve uma opção; o histórico preservou as duas versões com rótulos Atual/No histórico. Valores fictícios usados somente para validação.

## Fotos dos produtos

A coluna opcional `imagem_url` aceita a URL HTTPS direta da foto real do produto. Os templates CSV/Excel, o mapeamento, a revisão, a exportação e o pedido de pesquisa já incluem essa coluna. Arquivos antigos sem foto continuam compatíveis. Também são aceitos os cabeçalhos `imagem`, `image_url`, `foto_url` e `thumbnail`.

As fotos aparecem no comparador, na revisão da importação e no histórico, sem sair do app. URLs inválidas bloqueiam a revisão; links válidos que não carregam mostram “Sem imagem”. Fotos externas são carregadas diretamente do endereço informado, sem proxy no servidor. Na busca ao vivo, o adaptador lê a miniatura fornecida pela fonte quando disponível.

Reimportar o mesmo registro com uma imagem adicionada gera uma versão atualizada da mesma opção e preserva a anterior no histórico, sem duplicar o produto no comparador.

