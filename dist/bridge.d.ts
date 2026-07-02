import { EventEmitter } from "node:events";
import type { AgentConfig, BridgeRegistration } from "./types.js";
export declare class SkrbeComBridge extends EventEmitter {
    #private;
    private readonly config;
    constructor(config: AgentConfig);
    connect(): void;
    register(registration: Omit<BridgeRegistration, "type">): void;
    stop(): void;
    send(message: unknown): void;
}
//# sourceMappingURL=bridge.d.ts.map