import { SkrbeDevAgent } from "./agent.js";
import type { AgentConfig, ToolDefinition } from "./types.js";
export interface StartXCoderOptions {
    config?: AgentConfig;
    env?: NodeJS.ProcessEnv;
    optional?: boolean;
    tools?: ToolDefinition[];
}
/**
 * Starts one XCoder agent per Node.js process.
 * Safe to call repeatedly during Next.js development/HMR.
 */
export declare function startXCoder(options?: StartXCoderOptions): SkrbeDevAgent | undefined;
export declare function getXCoderAgent(): SkrbeDevAgent | undefined;
export declare function stopXCoder(): void;
//# sourceMappingURL=next.d.ts.map