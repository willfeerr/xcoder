# @skrbe/xcoder

Agente local Node.js que conecta o Skrbe MCP Gateway à máquina onde o pacote está instalado, permitindo leitura e edição de arquivos, execução de comandos, Git, processos persistentes e automação de navegador com Playwright.

```text
ChatGPT/agente → MCP Gateway → SkrbeCom Bridge → @skrbe/xcoder → máquina local
```

> O XCoder executa com as permissões do usuário que iniciou o processo Node.js. Configure `SKRBE_ROOTS` e `SKRBE_PERMISSION` com cuidado.

## Requisitos

- Node.js `>= 20.11`
- pnpm recomendado
- Um token válido do SkrbeCom Bridge
- Next.js com runtime Node.js, para a integração automática via `instrumentation.ts`

## Getting started com pnpm

### 1. Instale no novo projeto

Na raiz do projeto:

```bash
pnpm add -D github:willfeerr/xcoder#main
```

Se o diretório atual for a raiz de um workspace pnpm e o XCoder deve ser instalado no pacote raiz, use `-w`:

```bash
pnpm add -Dw github:willfeerr/xcoder#main
```

No pnpm 11, pacotes Git que executam `prepare` precisam ser aprovados explicitamente. Instale o XCoder na raiz do workspace com:

```bash
pnpm add -Dw --allow-build=@skrbe/xcoder github:willfeerr/xcoder#main
```

Esse comando registra a aprovação em `pnpm-workspace.yaml`:

```yaml
allowBuilds:
  '@skrbe/xcoder': true
```

Se o XCoder pertence somente a um app do monorepo, execute o comando dentro desse pacote ou use um filtro:

```bash
pnpm --filter <nome-do-pacote> add -D github:willfeerr/xcoder#main
```

Para instalações reproduzíveis, fixe um commit específico:

```bash
pnpm add -D github:willfeerr/xcoder#<commit-sha>
```

### 2. Configure a integração com Next.js

```bash
pnpm exec xcoder init next
```

O comando cria `instrumentation.ts` na raiz do projeto, ou `src/instrumentation.ts` quando o projeto usa `src/`:

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startXCoder } = await import("@skrbe/xcoder/next");
    startXCoder();
  }
}
```

Caso o arquivo já exista, o comando não o substitui. Adicione a chamada ao `register()` existente.

### 3. Configure o ambiente

Crie ou atualize `.env.local`:

```env
SKRBE_BRIDGE_URL=wss://bridge.example.com/agents
SKRBE_BRIDGE_TOKEN=replace-me
SKRBE_AGENT_ID=my-workstation

SKRBE_WORKSPACE=.
SKRBE_PERMISSION=ask
SKRBE_ROOTS=.
```

Configuração recomendada para começar:

```env
SKRBE_PERMISSION=ask
SKRBE_ROOTS=.
```

Ela mantém o agente limitado ao projeto atual e exige aprovação para operações.

### 4. Instale o navegador do Playwright

O pacote inclui Playwright, mas o binário do navegador precisa ser instalado na máquina:

```bash
pnpm dlx playwright@1.61.1 install chromium
```

### 5. Inicie o projeto

```bash
pnpm dev
```

O XCoder conecta automaticamente quando o Next.js carrega `instrumentation.ts` no runtime Node.js.

Durante HMR, um singleton global evita conexões duplicadas.

## Instalação rápida

```bash
pnpm add -D github:willfeerr/xcoder#main
pnpm exec xcoder init next
pnpm dlx playwright@1.61.1 install chromium
```

Depois configure `.env.local` e execute:

```bash
pnpm dev
```

## Configuração de permissões

### `ask`

Todas as operações dependem de aprovação pelo Bridge.

```env
SKRBE_PERMISSION=ask
```

### `auto-approve`

Leituras e comandos reconhecidos de diagnóstico e teste podem ser aprovados automaticamente. Operações mais sensíveis continuam protegidas.

```env
SKRBE_PERMISSION=auto-approve
```

O alias legado `auto-aprove` também é aceito.

### `full-control`

As tools são executadas automaticamente, mas continuam limitadas por `SKRBE_ROOTS`.

```env
SKRBE_PERMISSION=full-control
SKRBE_ROOTS=.
```

### Acesso irrestrito à conta do usuário

A configuração abaixo libera caminhos fora do projeto:

```env
SKRBE_PERMISSION=full-control
SKRBE_ROOTS=*
```

Use somente quando acesso amplo à máquina for realmente necessário. O agente poderá operar qualquer caminho permitido ao usuário do sistema que iniciou o processo.

## Workspace e roots

`SKRBE_WORKSPACE` define o diretório inicial das operações relativas:

```env
SKRBE_WORKSPACE=.
```

`SKRBE_ROOTS` define os limites autorizados do filesystem:

```env
# Somente o projeto atual
SKRBE_ROOTS=.

# Acesso irrestrito aos caminhos permitidos pelo usuário do sistema
SKRBE_ROOTS=*
```

A pasta de workspace não funciona como sandbox quando `SKRBE_ROOTS=*`.

Depois de alterar essas variáveis, encerre completamente o servidor Next.js e inicie-o novamente.

## Executar como processo separado

O XCoder também pode funcionar sem integração com Next.js:

```bash
pnpm exec xcoder
```

Ou adicione um script ao `package.json`:

```json
{
  "scripts": {
    "xcoder": "xcoder"
  }
}
```

Depois execute:

```bash
pnpm xcoder
```

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `SKRBE_BRIDGE_TOKEN` | Sim | Token usado para autenticar a conexão com o Bridge. |
| `SKRBE_BRIDGE_URL` | Conforme o ambiente | Endereço WebSocket do SkrbeCom Bridge. |
| `SKRBE_AGENT_ID` | Recomendado | Identificador estável desta máquina ou agente. |
| `SKRBE_WORKSPACE` | Não | Diretório inicial. Normalmente `.`. |
| `SKRBE_PERMISSION` | Não | `ask`, `auto-approve` ou `full-control`. |
| `SKRBE_ROOTS` | Não | Roots permitidos. Use `.` para o projeto ou `*` para acesso amplo. |

Nunca faça commit do token. Garanta que `.env.local` esteja ignorado pelo Git.

## Verificação

Com o projeto em execução, confirme:

1. O terminal não exibe erro de autenticação do XCoder.
2. O agente aparece conectado no Skrbe MCP Gateway.
3. As tools `xcoder__list_files`, `xcoder__read_file` e `xcoder__exec` aparecem no catálogo.
4. `xcoder__list_files` com `path: "."` retorna a raiz do projeto esperado.

Para conferir a CLI:

```bash
pnpm exec xcoder --help
```

## Atualização

Para atualizar usando a branch `main`:

```bash
pnpm add -D github:willfeerr/xcoder#main --force
```

Para instalar uma revisão específica:

```bash
pnpm add -D github:willfeerr/xcoder#<commit-sha> --force
```

Depois reinicie o servidor Next.js. Caso existam artefatos antigos do framework:

```bash
rm -rf .next
pnpm dev
```

## Problemas comuns

### O agente não aparece no Gateway

- Confirme `SKRBE_BRIDGE_TOKEN` e `SKRBE_BRIDGE_URL`.
- Reinicie completamente o processo Next.js.
- Confirme que `instrumentation.ts` está na raiz correta.
- Verifique se o projeto está executando com runtime Node.js.

### `ERR_PNPM_ADDING_TO_ROOT`

Esse erro aparece quando o comando é executado na raiz de um workspace pnpm. Escolha onde o XCoder deve ser instalado.

Na raiz do workspace:

```bash
pnpm add -Dw github:willfeerr/xcoder#main
```

Em um pacote específico:

```bash
pnpm --filter <nome-do-pacote> add -D github:willfeerr/xcoder#main
```

Ou entre no diretório do app e execute o comando sem `-w`.

### `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`

O XCoder é instalado diretamente do GitHub e usa `prepare` para gerar `dist/`. No pnpm 11, esse build precisa ser aprovado explicitamente:

```bash
pnpm add -Dw --allow-build=@skrbe/xcoder github:willfeerr/xcoder#main
```

Também é possível editar `pnpm-workspace.yaml` manualmente:

```yaml
allowBuilds:
  '@skrbe/xcoder': true
```

Depois execute novamente:

```bash
pnpm install
```

Ou aprove builds pendentes de forma interativa:

```bash
pnpm approve-builds @skrbe/xcoder
```

### O comando `xcoder` não é encontrado

Use o binário local pelo pnpm:

```bash
pnpm exec xcoder --help
```

### O navegador não inicia

Instale o Chromium compatível:

```bash
pnpm dlx playwright@1.61.1 install chromium
```

### O agente acessa arquivos fora do projeto

Confirme se existe:

```env
SKRBE_ROOTS=*
```

Para restringir novamente:

```env
SKRBE_ROOTS=.
SKRBE_PERMISSION=ask
```

Reinicie o processo depois da alteração.

### `instrumentation.ts` já existe

Mantenha o código existente e adicione apenas a inicialização do XCoder:

```ts
export async function register() {
  // Inicializações existentes...

  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startXCoder } = await import("@skrbe/xcoder/next");
    startXCoder();
  }
}
```

## Capacidades

O catálogo pode incluir, conforme a versão instalada:

- leitura, listagem, criação, patch e remoção de arquivos;
- execução de comandos no workspace;
- processos persistentes e leitura de logs;
- Git, branches, commits e worktrees;
- validação de projetos;
- automação Playwright;
- screenshots, vídeo, traces, console e diagnóstico de rede.

## Arquitetura

O agente não usa MCP por `stdio` e não precisa abrir um servidor local. Ele mantém uma conexão WebSocket autenticada de saída com o SkrbeCom Bridge.

```text
┌────────────────────┐
│ ChatGPT / agente   │
└─────────┬──────────┘
          │ MCP
┌─────────▼──────────┐
│ Skrbe MCP Gateway  │
└─────────┬──────────┘
          │ Bridge
┌─────────▼──────────┐
│ @skrbe/xcoder      │
└─────────┬──────────┘
          │
┌─────────▼──────────┐
│ Máquina local      │
└────────────────────┘
```

Consulte também [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Licença

MIT
