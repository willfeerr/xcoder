import { randomUUID } from "node:crypto";
import { createPathResolver } from "./path-policy.js";
import { isAutomaticallyAllowed } from "./policy.js";
import { tools as defaultTools } from "./tools.js";
import type {
  AgentConfig,
  ApprovalDecision,
  BridgeMessage,
  RpcRequest,
  RpcResponse,
  ToolDefinition,
} from "./types.js";
import { SkrbeComBridge } from "./bridge.js";

export class SkrbeDevAgent {
  private readonly toolMap: Map<string, ToolDefinition>;
  private readonly approvals = new Map<string, (decision: ApprovalDecision) => void>();
  private readonly rememberedApprovals = new Set<string>();
  private readonly resolvePath: (inputPath: string) => string;

  constructor(
    private readonly config: AgentConfig,
    private readonly bridge = new SkrbeComBridge(config),
    tools: ToolDefinition[] = defaultTools,
  ) {
    this.toolMap = new Map(tools.map((tool) => [tool.name, tool]));
    this.resolvePath = createPathResolver(config);
  }

  start(): void {
    this.bridge.on("message", (message: BridgeMessage) => { void this.handleMessage(message); });
    this.bridge.on("connected", () => console.log(`[xcoder] conectado como ${this.config.agentId}`));
    this.bridge.on("disconnected", () => console.warn("[xcoder] desconectado; tentando reconectar"));
    this.bridge.on("error", (error) => console.error("[xcoder] bridge error", error));
    this.bridge.connect();
  }

  stop(): void { this.bridge.stop(); }

  private async handleMessage(message: BridgeMessage): Promise<void> {
    if (message.type === "event" && message.event === "approval.decision") {
      const decision = message.data as ApprovalDecision;
      this.approvals.get(decision.requestId)?.(decision);
      return;
    }
    if (message.type !== "request") return;

    const response: RpcResponse = { type: "response", id: message.id };
    try { response.result = await this.handleRequest(message); }
    catch (error) {
      response.error = {
        code: "AGENT_ERROR",
        message: error instanceof Error ? error.message : String(error),
      };
    }
    this.bridge.send(response);
  }

  private async handleRequest(request: RpcRequest): Promise<unknown> {
    if (request.method === "agent.describe") {
      return {
        agentId: this.config.agentId,
        workspace: this.config.workspace,
        permission: this.config.permission,
        tools: [...this.toolMap.values()].map(({ name, description, risk }) => ({ name, description, risk })),
      };
    }
    if (request.method !== "tools.call") throw new Error(`Método não suportado: ${request.method}`);

    const params = asObject(request.params);
    const name = params.name;
    const input = params.input;
    if (typeof name !== "string") throw new Error("tools.call requer name.");

    const tool = this.toolMap.get(name);
    if (!tool) throw new Error(`Tool desconhecida: ${name}`);

    const approved = this.rememberedApprovals.has(name) || isAutomaticallyAllowed(this.config, tool, input);
    if (!approved) await this.requestApproval(request.id, tool, input);

    return tool.execute(input, {
      config: this.config,
      resolvePath: this.resolvePath,
    });
  }

  private requestApproval(rpcRequestId: string, tool: ToolDefinition, input: unknown): Promise<void> {
    const requestId = randomUUID();
    this.bridge.send({
      type: "event",
      event: "approval.requested",
      data: {
        requestId,
        rpcRequestId,
        agentId: this.config.agentId,
        tool: tool.name,
        risk: tool.risk,
        input,
      },
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.approvals.delete(requestId);
        reject(new Error(`Aprovação expirou para ${tool.name}.`));
      }, this.config.approvalTimeoutMs);

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

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
