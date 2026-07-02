import type { AgentConfig } from "./types.js";
export declare function asObject(value: unknown): Record<string, unknown>;
export declare function requiredString(input: Record<string, unknown>, key: string): string;
export declare function optionalString(input: Record<string, unknown>, key: string, fallback?: string): string | undefined;
export declare function optionalNumber(input: Record<string, unknown>, key: string, fallback: number): number;
export declare function optionalBoolean(input: Record<string, unknown>, key: string, fallback?: boolean): boolean;
export declare function sha256(value: string | Buffer): string;
export interface ProgramResult {
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
    truncated: boolean;
    durationMs: number;
}
export declare function allowedEnv(config: AgentConfig, extra?: Record<string, string>): NodeJS.ProcessEnv;
export declare function runProgram(command: string, args: string[], options: {
    cwd: string;
    timeoutMs: number;
    maxOutputBytes: number;
    env?: NodeJS.ProcessEnv;
    shell?: boolean;
}): Promise<ProgramResult>;
//# sourceMappingURL=runtime.d.ts.map