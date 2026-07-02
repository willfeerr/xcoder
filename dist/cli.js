#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { SkrbeDevAgent } from "./agent.js";
import { initNext } from "./init-next.js";
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
}
if (args[0] === "init" && args[1] === "next") {
    try {
        const result = await initNext();
        if (result.created) {
            console.log(`[xcoder] criado ${result.target}`);
            console.log("[xcoder] reinicie o servidor Next.js para conectar ao SkrbeCom Bridge.");
        }
        else {
            console.warn(`[xcoder] ${result.target} já existe; adicione ao register():`);
            console.log("\n" + result.content);
        }
        process.exit(0);
    }
    catch (error) {
        console.error("[xcoder] falha ao configurar Next.js:", error instanceof Error ? error.message : error);
        process.exit(1);
    }
}
try {
    const config = loadConfig();
    const agent = new SkrbeDevAgent(config);
    const shutdown = () => {
        agent.stop();
        process.exit(0);
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    agent.start();
}
catch (error) {
    console.error("[xcoder] falha ao iniciar:", error instanceof Error ? error.message : error);
    process.exit(1);
}
function printHelp() {
    console.log(`xcoder

Uso:
  xcoder                 Inicia o agente como processo separado
  xcoder init next       Integra o agente ao startup do Next.js

Variáveis obrigatórias:
  SKRBE_BRIDGE_TOKEN

Variáveis principais:
  SKRBE_BRIDGE_URL
  SKRBE_AGENT_ID
  SKRBE_WORKSPACE
  SKRBE_PERMISSION=ask|auto-approve|full-control
  SKRBE_ROOTS
`);
}
//# sourceMappingURL=cli.js.map