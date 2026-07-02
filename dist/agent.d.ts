import type { AgentConfig, ToolDefinition } from "./types.js";
import { SkrbeComBridge } from "./bridge.js";
export declare class SkrbeDevAgent {
    private readonly config;
    private readonly bridge;
    private readonly toolMap;
    private readonly approvals;
    private readonly rememberedApprovals;
    private readonly resolvePath;
    constructor(config: AgentConfig, bridge?: SkrbeComBridge, tools?: ToolDefinition[]);
    start(): void;
    stop(): void;
    private handleMessage;
    private describe;
    private callTool;
    private requestApproval;
}
//# sourceMappingURL=agent.d.ts.map