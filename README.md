# Your Checklist AI — V1

Aplicação Next.js com uma prévia funcional antes de conectar Vercel, Neon e provedores de IA. Repositório: [`pedromarquetto/your-checklist`](https://github.com/pedromarquetto/your-checklist).

## Executar

Node.js 20.9 ou superior. Instale com `npm ci`, execute `npm run dev` e abra http://localhost:3000. Para produção: `npm run build` e `npm start`. Verificação de regras: `npm test`.

## Testar na Vercel

1. Importe o repositório `pedromarquetto/your-checklist` como um novo projeto.
2. Framework: **Next.js**. Root Directory: raiz do repositório (`.`).
3. Install Command: `npm ci`. Build Command: `npm run build`. Output Directory: padrão do Next.js.
4. Para esta v1, não é necessário configurar variáveis de ambiente. Faça o deploy.

A versão hospedada inclui checklist, kanban, orçamento, importação de itens/opções e histórico das consultas. Os dados são salvos no navegador de cada usuário; Neon, contas e sincronização ainda não estão conectados. A busca ao vivo permanece desativada e as pesquisas podem ser importadas por CSV/Excel.

## O que funciona

- Vários projetos com limite de orçamento independente, ambientes e categorias.
- Criação, edição e exclusão de itens; subitens; quantidades, prioridades, observações e links.
- Checklist, pesquisa, filtro de status e kanban com drag and drop ou seletor acessível.
- Registro de compra com valor total, data, loja, pagamento e parcelas. Ao reabrir uma compra, há confirmação antes de limpar seu registro.
- Total previsto = quantidade × valor unitário. Itens com subitens consolidam os valores dos filhos, sem duplicar o orçamento.
- Importação CSV (vírgula ou ponto e vírgula), XLSX e XLS, com revisão, mapeamento de colunas, validação e deduplicação. Limite de 5 MB e 2.000 linhas; somente primeira aba.
- Importação por CSV colado, com exemplo de um item e dois subitens, revisão e confirmação. A revisão é invalidada ao editar o texto.
- Template configurável e exportação de CSV ou template Excel.
- Importação/exportação de opções por item, com nome/modelo, loja, preço, frete, link, data/hora da consulta, nota, quantidade de avaliações, fonte, prazo, observações e foto do produto (`imagem_url`). Template CSV/Excel e pedido de pesquisa pronto para copiar. Duplicados idênticos são ignorados; consultas em novas datas ou com valores diferentes são preservadas.
- Botão Buscar opções em cada item e no kanban. Comparação com preço mínimo/máximo, nota mínima, quantidade de avaliações, frete grátis, limite de orçamento e ordenação. Exemplos, importadas e busca ao vivo ficam separados. Notas e contagens ausentes nunca são inventadas. O histórico lista as consultas importadas, sem inventar preços anteriores. A comparação mantém uma única opção atual por produto, reconhecido pelo mesmo link (ignorando parâmetros de campanha) ou mesmo nome + loja. As versões anteriores ficam no histórico. A data mais recente prevalece e, em empate, vence a última linha importada. Lojas e modelos diferentes continuam sendo opções separadas. A revisão informa opções novas, atualizações e versões destinadas ao histórico.
- Persistência local no navegador, quando permitida. A prévia não exige contas ou serviços externos.

## Limites desta etapa

Não há login, sincronização entre dispositivos, conexão com Neon, API de IA ou coleta de histórico real. Há um endpoint de pesquisa de ofertas preparado, mas desativado por padrão e ainda não validado com uma credencial real. A importação de pesquisas feitas fora do app funciona sem credencial. Preços e respostas da IA de exemplo são rotulados como demonstração. A busca na web abre uma busca externa em nova aba. O valor de compra parcelada entra integralmente no orçamento; a v1 não gera calendário de faturas.

O esquema SQL em `database/schema.sql` é uma proposta para a próxima fase; ainda não foi executado ou integrado. Antes de expor dados multiusuário, a próxima fase deve implementar autenticação e verificação de participação no projeto em todas as operações no servidor. Credenciais de Neon e IA ficam apenas no servidor.

## Template

Obrigatórios: `ambiente`, `categoria`, `item`. Opcionais: `id`, `item_pai`, `quantidade`, `valor_previsto_unitario`, `status`, `prioridade`, `valor_pago_total`, `forma_pagamento`, `parcelas`, `data_compra`, `loja`, `link`, `observacoes`.

Datas em AAAA-MM-DD. Status: Planejado, Pesquisando, Comprado, Recebido. Prioridade: Alta, Média, Baixa. Subitens apontam ao ID da linha pai e devem compartilhar seu ambiente e categoria. Compras importadas exigem valor total, data e pagamento. Duplicados são identificados pelo nome, ambiente e categoria. Links aceitam somente HTTP e HTTPS. Valores aceitam notação brasileira ou decimal com ponto.

## Validação realizada

Build Next.js de produção e 32 testes de importação, moeda, hierarquia, cálculos, exportação, filtros de ofertas, metadados ausentes, normalização da fonte e bloqueio do endpoint sem configuração. No navegador: registro de compra com parcelas, persistência após recarregar, movimentação no kanban e importação CSV completa (colar/usar exemplo → revisar → confirmar → itens/subitens e orçamento). Também foram confirmados o bloqueio de quantidade inválida, a rejeição de duplicados e a persistência dos itens importados após recarregar. O exemplo adiciona R$ 379,50 sem duplicar o pai. A leitura de um XLSX real foi validada diretamente; a seleção de arquivo no navegador não pôde ser concluída por timeout do ambiente de testes.

## Próxima fase

1. Importar este repositório na Vercel e testar a experiência hospedada.
2. Implementar autenticação e armazenamento Neon com importação transacional e autorização por projeto.
3. Conectar IA e busca com fontes, data de coleta, moeda, frete e modelo exato; persistir snapshots para construir histórico real.
4. Adicionar cotas, monitoramento, compartilhamento e colaboração, conforme o uso esperado.

## Pesquisa de ofertas por item

O endpoint `POST /api/shopping/search` recebe `query` e `itemId`. O adaptador foi preparado para Google Shopping via SerpApi, com pesquisa brasileira e uma consulta nova a cada solicitação. A chave fica somente no servidor. Configuração para revisão local/privada: `SERPAPI_API_KEY` e `SHOPPING_SEARCH_ENABLED=true`. O endpoint responde 503 enquanto não estiver configurado. Não foi executada uma busca com credencial real; somente parsing, filtros e o estado não configurado foram testados.

A busca só acontece ao pressionar Buscar ofertas; mudar os filtros trabalha nos resultados já recebidos. Falhas não são substituídas por ofertas fictícias. A prévia inline não faz chamadas de API e usa um adaptador próprio; a aba Busca ao vivo explica essa limitação e permite abrir pesquisa externa. O botão Buscar opções foi verificado em um iframe isolado, incluindo preço máximo, nota mínima, frete grátis, quantidade de avaliações e estado vazio.

Antes de ativar em produção, implementar autenticação e cotas duráveis por usuário. A autorização por origem não substitui autenticação. Histórico real exige persistir as consultas no banco. A v1 mostra nota agregada e número de reviews, sem os textos individuais. Preços mensais/parcelas e valores explicitamente em moedas estrangeiras não entram no comparador em BRL.

Documentação da fonte usada na implementação: https://serpapi.com/google-shopping-api e https://serpapi.com/shopping-results.

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

## Galeria de referências por categoria

Use **Referências** no cabeçalho de uma categoria ou **Galerias** no topo do projeto. Cada categoria possui sua própria galeria, isolada por checklist. É possível criar uma categoria com referências antes de cadastrar seus itens. O botão **Adicionar item nesta categoria** abre o cadastro com a categoria preenchida.

Aceita vários arquivos JPG/PNG/WebP por seleção ou arraste, até 10 MB por arquivo e 24 imagens por categoria. O navegador prepara as fotos com até 2048 pixels no lado maior e as salva localmente no IndexedDB, sem ocupar a pequena cota do localStorage usada pelo checklist. Fotos por link HTTPS também são aceitas. Imagens repetidas são ignoradas.

As referências têm legenda editável, ampliação, navegação por anterior/próxima ou setas e remoção com confirmação. Quando existem imagens, miniaturas aparecem acima dos itens da categoria. Fechar a janela ou recarregar mantém as referências neste navegador. As imagens ainda não são sincronizadas com Neon ou entre dispositivos e não são incluídas na exportação CSV dos itens.

Validação da galeria: 32 testes passaram. No navegador, foram conferidos inclusão por link, carregamento das imagens, legenda persistente, ampliação e navegação, troca de categoria, isolamento entre projetos e categoria criada antes de itens com cadastro já preenchido. Um teste de execução no navegador validou a preparação de um arquivo PNG de 4000 × 2500 para JPEG de 2048 × 1280 e o salvamento/leitura no IndexedDB. A caixa nativa de seleção de arquivos não fez parte desse teste automatizado.
