import { randomUUID } from "node:crypto";
import { createPathResolver } from "./path-policy.js";
import { isAutomaticallyAllowed } from "./policy.js";
import { tools as defaultTools } from "./tools.js";
import { SkrbeComBridge } from "./bridge.js";
export class SkrbeDevAgent {
    config;
    bridge;
    toolMap;
    approvals = new Map();
    rememberedApprovals = new Set();
    resolvePath;
    constructor(config, bridge = new SkrbeComBridge(config), tools = defaultTools) {
        this.config = config;
        this.bridge = bridge;
        this.toolMap = new Map(tools.map((tool) => [tool.name, tool]));
        this.resolvePath = createPathResolver(config);
    }
    start() {
        this.bridge.on("message", (message) => void this.handleMessage(message));
        this.bridge.on("socket_open", () => this.bridge.register({
            serverId: this.config.serverId,
            name: this.config.serverName,
            prefix: this.config.prefix,
            tools: [...this.toolMap.values()].map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
        }));
        this.bridge.on("connected", () => {
            const names = [...this.toolMap.keys()].map((name) => `${this.config.prefix}__${name}`).join(", ");
            console.log(`[xcoder] registrado como ${this.config.serverId}; tools: ${names}`);
        });
        this.bridge.on("disconnected", () => console.warn("[xcoder] desconectado; tentando reconectar"));
        this.bridge.on("error", (error) => console.error("[xcoder] bridge error", error));
        this.bridge.connect();
    }
    stop() { this.bridge.stop(); }
    async handleMessage(message) {
        if (isBridgeEvent(message, "approval.decision")) {
            const decision = message.data;
            this.approvals.get(decision.requestId)?.(decision);
            return;
        }
        if (isNativeToolCall(message)) {
            try {
                this.bridge.send({ id: message.id, result: await this.callTool(message.id, message.method, message.params) });
            }
            catch (error) {
                this.bridge.send({ id: message.id, error: error instanceof Error ? error.message : String(error) });
            }
            return;
        }
        if (!isLegacyRpcRequest(message))
            return;
        const response = { type: "response", id: message.id };
        try {
            if (message.method === "agent.describe")
                response.result = this.describe();
            else if (message.method === "tools.call") {
                const params = asObject(message.params);
                if (typeof params.name !== "string")
                    throw new Error("tools.call requer name.");
                response.result = await this.callTool(message.id, params.name, params.input);
            }
            else
                throw new Error(`Método não suportado: ${message.method}`);
        }
        catch (error) {
            response.error = { code: "AGENT_ERROR", message: error instanceof Error ? error.message : String(error) };
        }
        this.bridge.send(response);
    }
    describe() {
        return {
            agentId: this.config.agentId,
            serverId: this.config.serverId,
            prefix: this.config.prefix,
            workspace: this.config.workspace,
            permission: this.config.permission,
            tools: [...this.toolMap.values()].map(({ name, description, risk, inputSchema }) => ({ name, description, risk, inputSchema })),
        };
    }
    async callTool(requestId, method, input) {
        const prefix = `${this.config.prefix}__`.toLowerCase();
        const incomingMethod = method.trim().toLowerCase();
        const normalizedMethod = incomingMethod.startsWith(prefix)
            ? incomingMethod.slice(prefix.length)
            : incomingMethod;
        const tool = this.toolMap.get(normalizedMethod);
        if (!tool)
            throw new Error(`Tool desconhecida: ${method}`);
        const approved = this.rememberedApprovals.has(tool.name) || isAutomaticallyAllowed(this.config, tool, input);
        if (!approved)
            await this.requestApproval(requestId, tool, input);
        return tool.execute(input ?? {}, { config: this.config, resolvePath: this.resolvePath });
    }
    requestApproval(rpcRequestId, tool, input) {
        const requestId = randomUUID();
        this.bridge.send({ type: "event", event: "approval.requested", data: { requestId, rpcRequestId, agentId: this.config.agentId, tool: tool.name, risk: tool.risk, input } });
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => { this.approvals.delete(requestId); reject(new Error(`Aprovação expirou para ${tool.name}.`)); }, this.config.approvalTimeoutMs);
            this.approvals.set(requestId, (decision) => {
                clearTimeout(timeout);
                this.approvals.delete(requestId);
                if (!decision.approved)
                    return reject(new Error(`Execução negada: ${tool.name}.`));
                if (decision.remember)
                    this.rememberedApprovals.add(tool.name);
                resolve();
            });
        });
    }
}
function isNativeToolCall(message) {
    return typeof message === "object" && message !== null && !("type" in message) && "id" in message && typeof message.id === "string" && "method" in message && typeof message.method === "string";
}
function isLegacyRpcRequest(message) {
    return typeof message === "object" && message !== null && "type" in message && message.type === "request" && "id" in message && typeof message.id === "string" && "method" in message && typeof message.method === "string";
}
function isBridgeEvent(message, event) {
    return typeof message === "object" && message !== null && "type" in message && message.type === "event" && "event" in message && message.event === event;
}
function asObject(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        return {};
    return value;
}
//# sourceMappingURL=agent.js.map