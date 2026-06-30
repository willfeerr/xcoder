#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { SkrbeDevAgent } from "./agent.js";

const args = new Set(process.argv.slice(2));

if (args.has("--help") || args.has("-h")) {
  console.log(`xcoder

Uso:
  xcoder

Variáveis obrigatórias:
  SKRBE_BRIDGE_TOKEN

Variáveis principais:
  SKRBE_BRIDGE_URL
  SKRBE_AGENT_ID
  SKRBE_WORKSPACE
  SKRBE_PERMISSION=ask|auto-approve|full-control
  SKRBE_ROOTS
`);
  process.exit(0);
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
} catch (error) {
  console.error(
    "[xcoder] falha ao iniciar:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
}
