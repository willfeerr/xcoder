const AUTO_APPROVED_RISKS = new Set(["read"]);
const SHELL_META = /[;&|><`$()\n\r]/;
const SAFE_EXEC_TOOLS = new Set(["project_validate"]);
export function isAutomaticallyAllowed(config, tool, input) { if (config.permission === "full-control")
    return true; if (config.permission === "ask")
    return false; if (AUTO_APPROVED_RISKS.has(tool.risk))
    return true; if (SAFE_EXEC_TOOLS.has(tool.name))
    return true; return tool.name === "exec" && isRecord(input) && typeof input.command === "string" ? isSafeDiagnosticCommand(input.command) : false; }
function isSafeDiagnosticCommand(command) { const normalized = command.trim().replace(/\s+/g, " "); if (!normalized || SHELL_META.test(normalized))
    return false; const tokens = normalized.split(" "); const executable = tokens[0]?.toLowerCase(); const firstArg = tokens[1]?.toLowerCase(); if (executable === "git")
    return ["status", "diff", "log", "branch", "worktree"].includes(firstArg ?? ""); if (executable === "npm")
    return firstArg === "test" || (firstArg === "run" && ["test", "lint", "typecheck", "check", "build"].includes(tokens[2]?.toLowerCase() ?? "")); if (["pnpm", "yarn", "bun"].includes(executable ?? ""))
    return ["test", "lint", "typecheck", "check", "build"].includes(firstArg ?? ""); return false; }
function isRecord(value) { return typeof value === "object" && value !== null; }
//# sourceMappingURL=policy.js.map