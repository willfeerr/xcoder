export type PermissionMode = "ask" | "auto-approve" | "full-control";
export type ToolRisk = "read" | "write" | "execute" | "destructive";

export interface AgentConfig {
  bridgeUrl: string;
  token: string;
  agentId: string;
  workspace: string;
  permission: PermissionMode;
  roots: string[];
  reconnectMinMs: number;
  reconnectMaxMs: number;
  approvalTimeoutMs: number;
  heartbeatMs: number;
  maxReadBytes: number;
  maxOutputBytes: number;
  envAllowList: string[];
}

export interface RpcRequest { type: "request"; id: string; method: string; params?: unknown; }
export interface RpcResponse { type: "response"; id: string; result?: unknown; error?: { code: string; message: string; data?: unknown }; }
export interface BridgeEvent { type: "event"; event: string; data?: unknown; }
export type BridgeMessage = RpcRequest | RpcResponse | BridgeEvent;

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  risk: ToolRisk;
  execute(input: TInput, context: ToolContext): Promise<TOutput>;
}

export interface ToolContext {
  config: AgentConfig;
  resolvePath(inputPath: string): string;
}

export interface ApprovalDecision {
  requestId: string;
  approved: boolean;
  remember?: boolean;
}
