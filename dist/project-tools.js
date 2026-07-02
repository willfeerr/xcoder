import { allowedEnv, asObject, optionalNumber, optionalString, runProgram } from "./runtime.js";
export const projectTools = [
    { name: "project_validate", description: "Executa uma sequência de comandos de validação e interrompe no primeiro erro.", risk: "execute", inputSchema: { type: "object", properties: { cwd: { type: "string" }, commands: { type: "array", items: { type: "string" } }, timeoutMs: { type: "number" } }, required: ["commands"], additionalProperties: false }, async execute(input, context) { const values = asObject(input); const commands = values.commands; if (!Array.isArray(commands) || commands.length === 0 || commands.some((item) => typeof item !== "string" || !item.trim()))
            throw new Error("commands deve ser uma lista de comandos."); const cwd = context.resolvePath(optionalString(values, "cwd", ".")); const results = []; for (const command of commands) {
            const result = await runProgram(command, [], { cwd, timeoutMs: optionalNumber(values, "timeoutMs", 120_000), maxOutputBytes: context.config.maxOutputBytes, env: allowedEnv(context.config), shell: true });
            results.push({ command, ...result });
            if (result.exitCode !== 0)
                return { ok: false, failedCommand: command, results };
        } return { ok: true, results }; } }
];
//# sourceMappingURL=project-tools.js.map