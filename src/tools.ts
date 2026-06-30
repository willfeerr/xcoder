import { allowedEnv, asObject, optionalNumber, optionalString, requiredString, runProgram } from "./runtime.js";
import type { ToolDefinition } from "./types.js";
import { fsTools } from "./fs-tools.js";
import { gitTools } from "./git-tools.js";
import { processTools } from "./process-tools.js";
import { browserTools } from "./browser-tools.js";
import { projectTools } from "./project-tools.js";
const execTool: ToolDefinition = { name: "exec", description: "Executa um comando no workspace e captura stdout/stderr.", risk: "execute", inputSchema: { type: "object", properties: { command: { type: "string" }, cwd: { type: "string" }, timeoutMs: { type: "number" } }, required: ["command"], additionalProperties: false }, async execute(input, context) { const values = asObject(input); const command = requiredString(values, "command"); const cwd = context.resolvePath(optionalString(values, "cwd", ".")!); return runProgram(command, [], { cwd, timeoutMs: optionalNumber(values, "timeoutMs", 120_000), maxOutputBytes: context.config.maxOutputBytes, env: allowedEnv(context.config), shell: true }); } };
export const tools: ToolDefinition[] = [...fsTools, ...gitTools, ...processTools, ...projectTools, ...browserTools, execTool];
