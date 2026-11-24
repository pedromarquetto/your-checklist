# Checklists, pagamentos e pontos

Na criação ou em **Gerenciar**, escolha checklist simples ou compras. No simples, concluir um item não exige orçamento, valor, data ou pagamento. No modo compras, o orçamento também é opcional; a compra registra o total efetivamente pago. Projetos anteriores continuam no modo compras. Mudar o tipo preserva os registros.

## Comparação

Cadastre uma oferta manualmente ou importe CSV/Excel. Cada combinação de produto, loja, pagamento, parcelas, cartão e programa/clube é uma alternativa. Versões anteriores da mesma condição permanecem no Histórico. Use **Cadastrar outra condição** para comparar Pix com cartão no mesmo produto. **Pagamento e pontos** edita as condições pessoais de uma opção.

Todos os preços, frete, taxas e bases são **por unidade**. Em compras com várias unidades, divida o frete total pela quantidade antes de cadastrar/importar. O preço é o total unitário já com desconto ou juros da forma de pagamento: nunca a parcela mensal. Taxas são apenas custos adicionais que não estejam no preço. O custo extra de clube também deve ser alocado por unidade; informe somente a despesa incremental atribuída à compra. Não conte uma assinatura novamente em várias compras.

- Total cobrado pela loja = preço + frete + taxas.
- Desembolso comparado = total da loja + custo adicional alocado do clube.
- Pontos do cartão = piso(base elegível × taxa), dividindo pela cotação quando a taxa for por dólar.
- Pontos do parceiro = piso(base elegível do produto × pontos por real). Frete e taxas ficam fora da base padrão.
- Benefício estimado = pontos × avaliação pessoal em reais por 1.000 pontos / 1.000.
- Custo após benefício estimado = desembolso − benefícios confirmados e valorados.

A quantidade do item é aplicada antes do arredondamento dos pontos no cálculo total. O total pago no registro da compra usa o valor da loja e nunca subtrai pontos nem inclui assinatura paga fora da loja. Confirme esse valor no checkout. Pontos são estimativas, não desconto ou dinheiro disponível; o emissor pode usar outro arredondamento. Não há cálculo de rendimento do dinheiro, inflação, vencimentos de fatura ou bônus futuro de transferência.

Sem frete conhecido, não há total comparável. Sem fonte, data, elegibilidade, câmbio necessário ou avaliação pessoal, o custo com pontos fica pendente e não lidera a ordenação. Campanhas encerradas e taxas de clube sem assinatura não geram benefício. Sem prazo final, uma campanha de parceiro só conta no dia de sua verificação. Com cartão e parceiro elegíveis, somente some se o acúmulo conjunto estiver confirmado; se forem excludentes, use a maior alternativa valorada.

## Pesquisa na web

**Busca ao vivo** usa SerpApi para preços; não verifica parcerias. **Pesquisar preços e pontos com IA** usa OpenAI com a ferramenta web_search. Ela consulta produtos e regras de parceiros, descarta produtos cujos links não foram recuperados pela ferramenta e mantém taxas sem fonte pendentes. Não presume cartão, assinatura, cotação ou valor dos seus pontos. A IA não acessa suas contas nem realiza compras. As regras e os dados extraídos ainda precisam ser conferidos na fonte, inclusive categoria, vendedor, cupom, canal de entrada, prazo e crédito dos pontos.

O assistente geral analisa as ofertas atuais salvas e seus cálculos. A pesquisa web usa `OPENAI_API_KEY`, `OPENAI_RESEARCH_MODEL` (padrão `gpt-6-luna`), `RESEARCH_DAILY_LIMIT` (padrão 5 por conta/dia) e `RESEARCH_WEB_CALL_LIMIT` (padrão 1 por pesquisa). O custo estimado da consulta aparece nas ofertas e no menu **Uso da IA**. Sem credencial, importação, cadastro e cálculos seguem funcionando. O AI Gateway sozinho habilita o assistente.

## CSV de ofertas

CSV UTF-8 com BOM e ponto e vírgula, uma linha por condição. Datas de consulta aceitam AAAA-MM-DD, DD/MM/AAAA ou ISO com fuso; datas de regras usam AAAA-MM-DD. Campos numéricos aceitam vírgula decimal ou ponto. Vazio significa desconhecido para taxa/base/avaliação. Zero é um valor explícito. Frete vazio permanece desconhecido; 0 representa grátis confirmado.

Campos mínimos no item selecionado: nome, preco, link, data_consulta. Em lote, inclua item_id, ou item e ambiente/categoria. Os templates do aplicativo usam os IDs reais do checklist, sem produtos ou preços fictícios. Arquivos antigos sem colunas de pontos continuam válidos. As colunas adicionais são opcionais e podem ser mapeadas na revisão.

| Coluna | Significado | Formato |
| --- | --- | --- |
| `forma_pagamento` | Forma de pagamento | `(vazio)`, `Pix`, `Cartão de crédito`, `Cartão de débito`, `Boleto`, `Dinheiro` |
| `parcelas` | Número de parcelas | Inteiro de 1 a 120 |
| `taxas` | Taxas adicionais (R$ por unidade) | Número ≥ 0; vazio = 0 |
| `cartao` | Nome do cartão | Texto |
| `programa_cartao` | Programa do cartão | Texto |
| `pontos_cartao_taxa` | Pontos do cartão por real ou dólar | Número; vazio = desconhecido |
| `pontos_cartao_unidade` | Unidade da taxa do cartão | `(vazio)`, `BRL`, `USD` |
| `cotacao_dolar` | Cotação do dólar usada pelo cartão (R$) | Número; vazio = desconhecido |
| `base_cartao` | Base pontuável do cartão (R$ por unidade) | Número; vazio = desconhecido |
| `valor_mil_cartao` | Sua estimativa em R$ por 1.000 pontos do cartão | Número; vazio = desconhecido |
| `fonte_cartao` | Link das regras do cartão | HTTPS |
| `verificado_cartao` | Data da verificação do cartão | AAAA-MM-DD |
| `validade_cartao` | Validade das regras do cartão | AAAA-MM-DD |
| `programa_parceiro` | Programa parceiro da loja | Texto |
| `pontos_parceiro_taxa` | Pontos do parceiro por R$ 1 | Número; vazio = desconhecido |
| `base_parceiro` | Base pontuável do parceiro (R$ por unidade) | Número; vazio = desconhecido |
| `valor_mil_parceiro` | Sua estimativa em R$ por 1.000 pontos do parceiro | Número; vazio = desconhecido |
| `fonte_parceiro` | Link oficial da campanha / regulamento | HTTPS |
| `verificado_parceiro` | Data da verificação da parceria | AAAA-MM-DD |
| `validade_parceiro` | Último dia da campanha | AAAA-MM-DD |
| `elegibilidade_parceiro` | Elegibilidade na campanha | `unknown`, `eligible`, `ineligible` |
| `exige_clube` | Esta taxa exige clube | sim / nao |
| `assinante_clube` | Tenho o clube exigido | sim / nao |
| `custo_clube` | Custo extra do clube alocado por unidade (R$) | Número ≥ 0; vazio = 0 |
| `acumulo_conjunto` | Acúmulo conjunto de cartão e parceiro | `unknown`, `yes`, `no` |
| `condicoes_pontos` | Regras: canal, vendedor, cupom, exclusões e crédito dos pontos | Texto |

Cabeçalho completo:

```csv
item_id;item;ambiente;categoria;nome;loja;preco;frete;moeda;data_consulta;link;nota;avaliacoes;prazo_entrega;fonte;observacoes;imagem_url;forma_pagamento;parcelas;taxas;cartao;programa_cartao;pontos_cartao_taxa;pontos_cartao_unidade;cotacao_dolar;base_cartao;valor_mil_cartao;fonte_cartao;verificado_cartao;validade_cartao;programa_parceiro;pontos_parceiro_taxa;base_parceiro;valor_mil_parceiro;fonte_parceiro;verificado_parceiro;validade_parceiro;elegibilidade_parceiro;exige_clube;assinante_clube;custo_clube;acumulo_conjunto;condicoes_pontos
```

Para a lista da arquiteta, use primeiro o CSV de itens (ambiente, categoria, item, quantidade e observacoes para medidas, acabamento, voltagem e restrições). Preços e pontos entram depois no CSV de ofertas, vinculados ao ID de cada item. Nenhum dado do PDF é preenchido antes da leitura.

## Fontes para conferência

- [Regras de Mercado Livre na Livelo](https://www.livelo.com.br/juntar-pontos/parceiros/mercado-livre/MCL): categoria, período, canal de entrada e exclusões podem alterar a pontuação.
- [Parceiros Livelo](https://www.livelo.com.br/juntar-pontos/todos-os-parceiros): consulte o regulamento da loja para o perfil do comprador.
- [Como acumular pontos no BB](https://www.bb.com.br/site/pra-voce/cartoes-de-credito/quem-tem-ourocard-tem-tudo/como-acumular-pontos/): confirme a variante do cartão e a regra do emissor.

Nenhuma taxa bancária, campanha ou avaliação do milheiro foi predefinida a partir desses links.
