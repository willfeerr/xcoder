import path from "node:path";
import type { AgentConfig, PermissionMode } from "./types.js";

const MODE_ALIASES: Record<string, PermissionMode> = {
  ask: "ask",
  "auto-approve": "auto-approve",
  "auto-aprove": "auto-approve",
  full: "full-control",
  "full-control": "full-control",
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  const workspace = path.resolve(env.SKRBE_WORKSPACE ?? process.cwd());
  const rawPermission = (env.SKRBE_PERMISSION ?? "ask").trim().toLowerCase();
  const permission = MODE_ALIASES[rawPermission];
  if (!permission) throw new Error(`SKRBE_PERMISSION inválida: ${rawPermission}.`);

  const token = env.SKRBE_BRIDGE_TOKEN?.trim();
  if (!token) throw new Error("SKRBE_BRIDGE_TOKEN é obrigatório.");

  const roots = (env.SKRBE_ROOTS ?? workspace)
    .split(path.delimiter)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => (value === "*" ? value : path.resolve(workspace, value)));

  return {
    bridgeUrl: env.SKRBE_BRIDGE_URL ?? "ws://127.0.0.1:7331/agents",
    token,
    agentId: env.SKRBE_AGENT_ID ?? `xcoder-${process.pid}`,
    workspace,
    permission,
    roots,
    reconnectMinMs: positiveNumber(env.SKRBE_RECONNECT_MIN_MS, 1_000),
    reconnectMaxMs: positiveNumber(env.SKRBE_RECONNECT_MAX_MS, 30_000),
    approvalTimeoutMs: positiveNumber(env.SKRBE_APPROVAL_TIMEOUT_MS, 120_000),
    heartbeatMs: positiveNumber(env.SKRBE_HEARTBEAT_MS, 20_000),
    maxReadBytes: positiveNumber(env.SKRBE_MAX_READ_BYTES, 5 * 1024 * 1024),
    maxOutputBytes: positiveNumber(env.SKRBE_MAX_OUTPUT_BYTES, 2 * 1024 * 1024),
    envAllowList: (env.SKRBE_ENV_ALLOWLIST ?? "PATH,HOME,USERPROFILE,TEMP,TMP,NODE_ENV,CI")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  };
}

function positiveNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Valor numérico inválido: ${value}`);
  return parsed;
}
