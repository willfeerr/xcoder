# @skrbe/xcoder

Agente local Node.js para dar ao Skrbe MCP Gateway capacidades de programação na máquina onde o pacote está instalado, usando o SkrbeCom Bridge como transporte.

```text
ChatGPT/agente -> MCP Gateway -> SkrbeCom Bridge -> @skrbe/xcoder -> máquina local
```

## Instalação no worker

```bash
npm install -D github:willfeerr/xcoder#main
```

Para um build reproduzível, fixe um commit funcional:

```bash
npm install -D github:willfeerr/xcoder#c000c52cf0439e081f13966009c1a06ec0237606
```

O script `prepare` compila o TypeScript durante a instalação Git.

## Execução

```json
{
  "scripts": {
    "xcoder": "xcoder"
  }
}
```

```bash
npm run xcoder
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

## Variáveis principais

```env
SKRBE_BRIDGE_URL=wss://bridge.example.com/agents
SKRBE_BRIDGE_TOKEN=replace-me
SKRBE_AGENT_ID=my-workstation
SKRBE_WORKSPACE=.
SKRBE_PERMISSION=ask
SKRBE_ROOTS=.
```

## Tools iniciais

- `fs.readFile`
- `fs.list`
- `fs.writeFile`
- `fs.remove`
- `process.exec`

O agente não usa MCP por `stdio` e não abre servidor local. Ele mantém uma conexão WebSocket autenticada de saída com o SkrbeCom Bridge.
