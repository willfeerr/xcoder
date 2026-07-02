import { fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { asObject, optionalBoolean, optionalNumber, optionalString, requiredString, } from "./runtime.js";
let worker;
let workerStderr = "";
const pending = new Map();
function resolveWorkerPath() {
    const projectRequire = createRequire(path.join(process.cwd(), "package.json"));
    const packageSpecifier = ["@skrbe", "xcoder", "browser-worker"].join("/");
    return projectRequire.resolve(packageSpecifier);
}
function ensureWorker() {
    if (worker?.connected)
        return worker;
    const workerPath = resolveWorkerPath();
    const child = fork(workerPath, [], {
        env: process.env,
        execArgv: [],
        stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    workerStderr = "";
    child.stderr?.on("data", (chunk) => {
        workerStderr = (workerStderr + chunk.toString()).slice(-64_000);
    });
    child.on("message", (message) => {
        if (!message || typeof message.id !== "string")
            return;
        const request = pending.get(message.id);
        if (!request)
            return;
        clearTimeout(request.timer);
        pending.delete(message.id);
        if (message.error)
            request.reject(new Error(message.error));
        else
            request.resolve(message.result);
    });
    const rejectAll = (reason) => {
        for (const request of pending.values()) {
            clearTimeout(request.timer);
            request.reject(new Error(reason));
        }
        pending.clear();
    };
    child.on("error", (error) => {
        rejectAll(`Falha no worker Playwright: ${error.message}`);
        worker = undefined;
    });
    child.on("exit", (code, signal) => {
        const details = workerStderr.trim();
        rejectAll(`Worker Playwright encerrou com code=${String(code)} signal=${String(signal)}${details ? `: ${details}` : ""}`);
        worker = undefined;
    });
    worker = child;
    return child;
}
async function callWorker(method, params, timeoutMs = 120_000) {
    const child = ensureWorker();
    const id = randomUUID();
    const request = { id, method, params };
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            pending.delete(id);
            reject(new Error(`Timeout de ${timeoutMs}ms na operação Playwright ${method}.`));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        child.send(request, (error) => {
            if (!error)
                return;
            clearTimeout(timer);
            pending.delete(id);
            reject(error);
        });
    }).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (/executable doesn't exist|browser.*not found|install/i.test(message)) {
            throw new Error(`${message}\nInstale o navegador com: pnpm exec xcoder browser install chromium`);
        }
        throw error;
    });
}
export const browserTools = [
    {
        name: "browser_open",
        description: "Abre URL em Chromium, Firefox ou WebKit em worker isolado.",
        risk: "execute",
        inputSchema: {
            type: "object",
            properties: {
                url: { type: "string" },
                browser: { type: "string", enum: ["chromium", "firefox", "webkit"] },
                headless: { type: "boolean" },
                width: { type: "number" },
                height: { type: "number" },
                timeoutMs: { type: "number" },
            },
            required: ["url"],
            additionalProperties: false,
        },
        async execute(input) {
            const values = asObject(input);
            const timeoutMs = optionalNumber(values, "timeoutMs", 30_000);
            return callWorker("open", {
                url: requiredString(values, "url"),
                browser: optionalString(values, "browser", "chromium"),
                headless: optionalBoolean(values, "headless", true),
                width: optionalNumber(values, "width", 1440),
                height: optionalNumber(values, "height", 900),
                timeoutMs,
            }, timeoutMs + 10_000);
        },
    },
    {
        name: "browser_snapshot",
        description: "Retorna URL, título, texto visível e opcionalmente HTML da página.",
        risk: "read",
        inputSchema: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                includeHtml: { type: "boolean" },
                maxChars: { type: "number" },
            },
            required: ["sessionId"],
            additionalProperties: false,
        },
        async execute(input) {
            const values = asObject(input);
            return callWorker("snapshot", {
                sessionId: requiredString(values, "sessionId"),
                includeHtml: optionalBoolean(values, "includeHtml"),
                maxChars: optionalNumber(values, "maxChars", 100_000),
            });
        },
    },
    {
        name: "browser_screenshot",
        description: "Captura screenshot da página ou de um elemento.",
        risk: "read",
        inputSchema: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                path: { type: "string" },
                fullPage: { type: "boolean" },
                selector: { type: "string" },
            },
            required: ["sessionId"],
            additionalProperties: false,
        },
        async execute(input, context) {
            const values = asObject(input);
            const requestedPath = optionalString(values, "path");
            return callWorker("screenshot", {
                sessionId: requiredString(values, "sessionId"),
                path: requestedPath ? context.resolvePath(requestedPath) : undefined,
                fullPage: optionalBoolean(values, "fullPage", true),
                selector: optionalString(values, "selector"),
            });
        },
    },
    {
        name: "browser_click",
        description: "Clica em um elemento usando locator Playwright.",
        risk: "execute",
        inputSchema: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                selector: { type: "string" },
                timeoutMs: { type: "number" },
            },
            required: ["sessionId", "selector"],
            additionalProperties: false,
        },
        async execute(input) {
            const values = asObject(input);
            return callWorker("click", {
                sessionId: requiredString(values, "sessionId"),
                selector: requiredString(values, "selector"),
                timeoutMs: optionalNumber(values, "timeoutMs", 30_000),
            });
        },
    },
    {
        name: "browser_fill",
        description: "Preenche um campo usando locator Playwright.",
        risk: "execute",
        inputSchema: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                selector: { type: "string" },
                value: { type: "string" },
            },
            required: ["sessionId", "selector", "value"],
            additionalProperties: false,
        },
        async execute(input) {
            const values = asObject(input);
            return callWorker("fill", {
                sessionId: requiredString(values, "sessionId"),
                selector: requiredString(values, "selector"),
                value: requiredString(values, "value"),
            });
        },
    },
    {
        name: "browser_evaluate",
        description: "Executa uma expressão JavaScript serializável na página ativa.",
        risk: "execute",
        inputSchema: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                expression: { type: "string" },
            },
            required: ["sessionId", "expression"],
            additionalProperties: false,
        },
        async execute(input) {
            const values = asObject(input);
            return callWorker("evaluate", {
                sessionId: requiredString(values, "sessionId"),
                expression: requiredString(values, "expression"),
            });
        },
    },
    {
        name: "browser_console",
        description: "Retorna mensagens de console e erros da página.",
        risk: "read",
        inputSchema: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                clear: { type: "boolean" },
            },
            required: ["sessionId"],
            additionalProperties: false,
        },
        async execute(input) {
            const values = asObject(input);
            return callWorker("console", {
                sessionId: requiredString(values, "sessionId"),
                clear: optionalBoolean(values, "clear"),
            });
        },
    },
    {
        name: "browser_network",
        description: "Retorna respostas HTTP com erro e requests falhos observados.",
        risk: "read",
        inputSchema: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                clear: { type: "boolean" },
            },
            required: ["sessionId"],
            additionalProperties: false,
        },
        async execute(input) {
            const values = asObject(input);
            return callWorker("network", {
                sessionId: requiredString(values, "sessionId"),
                clear: optionalBoolean(values, "clear"),
            });
        },
    },
    {
        name: "browser_close",
        description: "Fecha contexto e navegador da sessão.",
        risk: "destructive",
        inputSchema: {
            type: "object",
            properties: { sessionId: { type: "string" } },
            required: ["sessionId"],
            additionalProperties: false,
        },
        async execute(input) {
            return callWorker("close", {
                sessionId: requiredString(asObject(input), "sessionId"),
            });
        },
    },
];
//# sourceMappingURL=browser-tools.js.map