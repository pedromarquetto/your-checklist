# Ativar a V1 na Vercel

O código inclui autenticação e persistência. A ativação exige recursos reais; nenhum serviço é simulado quando faltam credenciais. Sem configuração de conta, a página mantém o modo local, com aviso explícito.

## 1. Vincular o projeto

Projeto existente: `your-checklist`, repositório `pedromarquetto/your-checklist`, branch `main`. Use Node.js 24 e as configurações padrão de Next.js. Instalação: `npm ci`. Build: `npm run build`.

Com a CLI autenticada na equipe correta:

```bash
vercel link
vercel integration add neon
vercel env pull .env.local
```

Se já existir um banco para este projeto, conecte-o em vez de criar outro. Use um banco/branch dedicado; `database/schema.sql` é uma proposta antiga, não é a migração da aplicação atual.

## 2. Configurar as contas

Variáveis obrigatórias, sempre no servidor:

| Variável | Valor |
| --- | --- |
| `DATABASE_URL` | Connection string PostgreSQL do Neon, com SSL |
| `BETTER_AUTH_SECRET` | Pelo menos 32 caracteres aleatórios |
| `BETTER_AUTH_URL` | Origem exata do aplicativo, por exemplo `https://your-checklist.vercel.app` |

Gere o segredo localmente e adicione-o como variável sensível na Vercel. Nunca o coloque no GitHub. Configure Production e Development; para Preview, use banco próprio e URL estável da branch de teste. Esta configuração exige uma origem explícita; não copie a URL de produção para uma prévia diferente.

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
vercel env pull .env.local
npm run db:migrate
npm run config:check
```

`db:migrate` aplica o esquema da versão instalada de Better Auth e a migração `database/migrations/001_workspace.sql`. É repetível e verifica o checksum da migração aplicada. Não roda automaticamente durante o build. A conexão do banco precisa ter permissão para criar tabelas e índices.

As contas usam e-mail/senha, sessões persistidas no banco e rate limiting durável. Há troca de senha autenticada, que encerra as outras sessões. Esta V1 não envia e-mails: verificação de endereço e recuperação de senha por e-mail precisam de uma integração de entrega futura. Use uma senha guardada no seu gerenciador de senhas.

## 3. Ativar a IA

Escolha uma configuração:

- OpenAI: `OPENAI_API_KEY`, opcionalmente `OPENAI_MODEL` (padrão `gpt-4.1-mini`).
- AI Gateway: `AI_GATEWAY_API_KEY`, opcionalmente `AI_MODEL` (padrão `openai/gpt-4.1-mini`).

Se ambas forem definidas, a chave OpenAI tem preferência. `AI_DAILY_LIMIT` controla o limite por conta (padrão 30 chamadas/dia). As contas dos provedores precisam ter acesso ao modelo e saldo/créditos adequados. As chaves ficam no servidor.

O assistente usa o contexto salvo do projeto, limitado aos primeiros 200 itens e notas resumidas. Não consulta a web, não altera itens automaticamente e não apresenta preços inventados. Para ofertas atuais, use a pesquisa do item.

## 4. Ativar a pesquisa de ofertas

Defina `SERPAPI_API_KEY` e `SHOPPING_SEARCH_ENABLED=true`. Limite padrão: 20 consultas por conta/dia; ajuste `SHOPPING_DAILY_LIMIT` se necessário. As cotas diárias usam a data do PostgreSQL, normalmente UTC.

As consultas usam Google Shopping via SerpApi. Cada execução salva até 50 resultados como snapshots no banco. Preços, notas, reviews e frete desconhecidos permanecem desconhecidos; o app não inventa histórico anterior à primeira consulta. O preço final e a disponibilidade devem ser conferidos na loja. Não há coleta agendada ou monitoramento automático nesta V1.

## 5. Imagens e dados existentes

As referências enviadas são preparadas no navegador, com até 2048 px e 1,5 MB após compressão. Os bytes ficam privados no Neon e são servidos por uma rota autenticada; não é necessário configurar Blob. Limite: 24 imagens por categoria e 100 MB de referências por conta. Fotos externas por HTTPS continuam dependentes do endereço de origem.

Após entrar, o botão **Importar para minha conta** lê o checklist local e as galerias IndexedDB deste navegador. Cria projetos novos e preserva a cópia local. Repetir uma migração interrompida não duplica os projetos nem as imagens já importadas. Use o mesmo navegador e a mesma origem onde os dados foram cadastrados. Um domínio ou subdomínio diferente não consegue ler o armazenamento da origem antiga.

**Backup dos dados** exporta JSON de projetos, itens, compras, ofertas e templates, sem as imagens das galerias. **Importar backup** restaura esses dados como projetos adicionais, sem substituir os atuais. A versão original continua guardada na conta/local de origem.

## 6. Publicar e conferir

Depois da migração e das variáveis, faça um novo deploy. Verifique:

1. Criar conta, sair e entrar novamente; trocar senha.
2. Criar projeto vazio e importar um CSV e um XLSX reais.
3. Adicionar subitens, mover no kanban e registrar compra parcelada.
4. Enviar fotos, alterar legendas e abrir a conta em outro dispositivo.
5. Pesquisar ofertas; recarregar e conferir o histórico.
6. Fazer uma pergunta real ao assistente.
7. Alterar o mesmo projeto em duas abas e conferir o aviso de conflito. A versão antiga não pode sobrescrever silenciosamente a nova.
8. Renomear e excluir ambientes/categorias; confirmar que os itens e galerias correspondem.

O app informa quando está salvando, quando há erro e quando há conflito. Em conflito, baixe suas alterações antes de carregar a versão da nuvem. A conta mantém uma cópia local de alterações pendentes quando o armazenamento do navegador permite.

## Verificação disponível

```bash
npm ci
npm test
npm run build
```

Os testes incluem PostgreSQL real em WASM (PGlite), autenticação real da biblioteca, persistência, isolamento por usuário, conflitos, imagens privadas e cotas. As respostas de SerpApi/OpenAI são simuladas apenas nos testes; validar provedores reais e o deploy exige as credenciais acima. A integração contínua executa testes e build em cada push/PR.

## Teste completo pelo navegador sem credenciais externas

Depois do build:

```bash
npx playwright install chromium
npm run test:browser
```

O teste sobe PostgreSQL WASM em uma porta TCP temporária e o servidor Next.js de produção, cria uma conta de teste e exercita cadastro, projeto vazio, item, upload real de XLSX, compra, imagem privada, legenda, renomeação, recarga, segunda sessão, layout móvel e conflitos. Tudo é descartado ao terminar. Não usa o Neon nem as chaves de produção. Pode-se indicar um Chromium já instalado com `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. O CI executa esse teste após o build.

A validação local de 26/10/2026 passou com 44 testes automatizados, build de produção, prévia estática e o fluxo completo no Chromium. OpenAI/SerpApi foram validados com respostas controladas nos testes de integração; a validação com provedores reais e a Vercel continua dependente de acesso/configuração.
