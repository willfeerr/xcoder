# @skrbe/xcoder

Agente local Node.js para dar ao Skrbe MCP Gateway capacidades de programação na máquina onde o pacote está instalado, usando o SkrbeCom Bridge como transporte.

```text
ChatGPT/agente -> MCP Gateway -> SkrbeCom Bridge -> @skrbe/xcoder -> máquina local
```

## Instalação

```bash
npm install -D github:willfeerr/xcoder#main
```

## Next.js: conectar automaticamente com o app

Depois de instalar, execute uma vez:

```bash
npx xcoder init next
```

O comando cria `instrumentation.ts` na raiz ou em `src/instrumentation.ts`:

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startXCoder } = await import("@skrbe/xcoder/next");
    startXCoder();
  }
}
```

Configure `.env.local`:

```env
SKRBE_BRIDGE_URL=wss://bridge.example.com/agents
SKRBE_BRIDGE_TOKEN=replace-me
SKRBE_AGENT_ID=my-workstation
SKRBE_WORKSPACE=.
SKRBE_PERMISSION=ask
SKRBE_ROOTS=.
```

Reinicie o servidor:

```bash
npm run dev
```

O XCoder passa a conectar junto com o processo Node do Next.js. Há um singleton global para evitar conexões duplicadas durante HMR.

Caso já exista um `instrumentation.ts`, adicione a importação dinâmica ao `register()` existente em vez de substituí-lo.

## Processo separado

Também é possível executar sem integração com Next.js:

```bash
npx xcoder
```

Ou:

```json
{
  "scripts": {
    "xcoder": "xcoder"
  }
}
```

## Permissões

- `ask`: toda operação pede aprovação pelo Bridge.
- `auto-approve`: leitura e comandos de diagnóstico/teste reconhecidos são automáticos.
- `full-control`: todas as tools são automáticas, ainda respeitando `SKRBE_ROOTS`.

O alias `auto-aprove` também é aceito.

Acesso irrestrito exige configuração explícita:

```env
SKRBE_PERMISSION=full-control
SKRBE_ROOTS=*
```

## Tools iniciais

- `fs.readFile`
- `fs.list`
- `fs.writeFile`
- `fs.remove`
- `process.exec`

O agente não usa MCP por `stdio` e não abre servidor local. Ele mantém uma conexão WebSocket autenticada de saída com o SkrbeCom Bridge.
