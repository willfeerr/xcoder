import type { AgentConfig, ToolDefinition, ToolRisk } from "./types.js";

const AUTO_APPROVED_RISKS = new Set<ToolRisk>(["read"]);
const SHELL_META = /[;&|><`$()\n\r]/;

export function isAutomaticallyAllowed(config: AgentConfig, tool: ToolDefinition, input: unknown): boolean {
  if (config.permission === "full-control") return true;
  if (config.permission === "ask") return false;
  if (AUTO_APPROVED_RISKS.has(tool.risk)) return true;
  return tool.name === "exec" && isRecord(input) && typeof input.command === "string"
    ? isSafeDiagnosticCommand(input.command)
    : false;
}

function isSafeDiagnosticCommand(command: string): boolean {
  const normalized = command.trim().replace(/\s+/g, " ");
  if (!normalized || SHELL_META.test(normalized)) return false;
  const tokens = normalized.split(" ");
  const executable = tokens[0]?.toLowerCase();
  const firstArg = tokens[1]?.toLowerCase();
  if (executable === "git") return firstArg === "status" || firstArg === "diff" || firstArg === "log";
  if (executable === "npm") return firstArg === "test" || (firstArg === "run" && ["test", "lint", "typecheck", "check"].includes(tokens[2]?.toLowerCase() ?? ""));
  if (executable === "pnpm" || executable === "yarn" || executable === "bun") return ["test", "lint", "typecheck", "check"].includes(firstArg ?? "");
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
