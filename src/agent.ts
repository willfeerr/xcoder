import { randomUUID } from "node:crypto";
import { createPathResolver } from "./path-policy.js";
import { isAutomaticallyAllowed } from "./policy.js";
import { tools as defaultTools } from "./tools.js";
import type { AgentConfig, ApprovalDecision, BridgeMessage, NativeToolCall, RpcRequest, RpcResponse, ToolDefinition } from "./types.js";
import { SkrbeComBridge } from "./bridge.js";

export class SkrbeDevAgent {
  private readonly toolMap: Map<string, ToolDefinition>;
  private readonly approvals = new Map<string, (decision: ApprovalDecision) => void>();
  private readonly rememberedApprovals = new Set<string>();
  private readonly resolvePath: (inputPath: string) => string;

  constructor(private readonly config: AgentConfig, private readonly bridge = new SkrbeComBridge(config), tools: ToolDefinition[] = defaultTools) {
    this.toolMap = new Map(tools.map((tool) => [tool.name, tool]));
    this.resolvePath = createPathResolver(config);
  }

  start(): void {
    this.bridge.on("message", (message: BridgeMessage) => void this.handleMessage(message));
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

  stop(): void { this.bridge.stop(); }

  private async handleMessage(message: BridgeMessage): Promise<void> {
    if (isBridgeEvent(message, "approval.decision")) {
      const decision = message.data as ApprovalDecision;
      this.approvals.get(decision.requestId)?.(decision);
      return;
    }
    if (isNativeToolCall(message)) {
      try {
        this.bridge.send({ id: message.id, result: await this.callTool(message.id, message.method, message.params) });
      } catch (error) {
        this.bridge.send({ id: message.id, error: error instanceof Error ? error.message : String(error) });
      }
      return;
    }
    if (!isLegacyRpcRequest(message)) return;

    const response: RpcResponse = { type: "response", id: message.id };
    try {
      if (message.method === "agent.describe") response.result = this.describe();
      else if (message.method === "tools.call") {
        const params = asObject(message.params);
        if (typeof params.name !== "string") throw new Error("tools.call requer name.");
        response.result = await this.callTool(message.id, params.name, params.input);
      } else throw new Error(`Método não suportado: ${message.method}`);
    } catch (error) {
      response.error = { code: "AGENT_ERROR", message: error instanceof Error ? error.message : String(error) };
    }
    this.bridge.send(response);
  }

  private describe(): unknown {
    return {
      agentId: this.config.agentId,
      serverId: this.config.serverId,
      prefix: this.config.prefix,
      workspace: this.config.workspace,
      permission: this.config.permission,
      tools: [...this.toolMap.values()].map(({ name, description, risk, inputSchema }) => ({ name, description, risk, inputSchema })),
    };
  }

  private async callTool(requestId: string, method: string, input: unknown): Promise<unknown> {
    const prefix = `${this.config.prefix}__`.toLowerCase();
    const incomingMethod = method.trim().toLowerCase();
    const normalizedMethod = incomingMethod.startsWith(prefix)
      ? incomingMethod.slice(prefix.length)
      : incomingMethod;
    const tool = this.toolMap.get(normalizedMethod);
    if (!tool) throw new Error(`Tool desconhecida: ${method}`);
    const approved = this.rememberedApprovals.has(tool.name) || isAutomaticallyAllowed(this.config, tool, input);
    if (!approved) await this.requestApproval(requestId, tool, input);
    return tool.execute(input ?? {}, { config: this.config, resolvePath: this.resolvePath });
  }

  private requestApproval(rpcRequestId: string, tool: ToolDefinition, input: unknown): Promise<void> {
    const requestId = randomUUID();
    this.bridge.send({ type: "event", event: "approval.requested", data: { requestId, rpcRequestId, agentId: this.config.agentId, tool: tool.name, risk: tool.risk, input } });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { this.approvals.delete(requestId); reject(new Error(`Aprovação expirou para ${tool.name}.`)); }, this.config.approvalTimeoutMs);
      this.approvals.set(requestId, (decision) => {
        clearTimeout(timeout);
        this.approvals.delete(requestId);
        if (!decision.approved) return reject(new Error(`Execução negada: ${tool.name}.`));
        if (decision.remember) this.rememberedApprovals.add(tool.name);
        resolve();
      });
    });
  }
}

function isNativeToolCall(message: BridgeMessage): message is NativeToolCall {
  return typeof message === "object" && message !== null && !("type" in message) && "id" in message && typeof message.id === "string" && "method" in message && typeof message.method === "string";
}

function isLegacyRpcRequest(message: BridgeMessage): message is RpcRequest {
  return typeof message === "object" && message !== null && "type" in message && message.type === "request" && "id" in message && typeof message.id === "string" && "method" in message && typeof message.method === "string";
}

function isBridgeEvent(message: BridgeMessage, event: string): message is { type: "event"; event: string; data?: unknown } {
  return typeof message === "object" && message !== null && "type" in message && message.type === "event" && "event" in message && message.event === event;
}

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
