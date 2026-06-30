import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import type { AgentConfig } from "./types.js";

export function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Input deve ser um objeto.");
  return value as Record<string, unknown>;
}
export function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} é obrigatório.`);
  return value;
}
export function optionalString(input: Record<string, unknown>, key: string, fallback?: string): string | undefined {
  const value = input[key];
  if (value === undefined) return fallback;
  if (typeof value !== "string") throw new Error(`${key} deve ser string.`);
  return value;
}
export function optionalNumber(input: Record<string, unknown>, key: string, fallback: number): number {
  const value = input[key];
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${key} deve ser número.`);
  return value;
}
export function optionalBoolean(input: Record<string, unknown>, key: string, fallback = false): boolean {
  const value = input[key];
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new Error(`${key} deve ser boolean.`);
  return value;
}
export function sha256(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }
export interface ProgramResult { exitCode: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; truncated: boolean; durationMs: number; }
export function allowedEnv(config: AgentConfig, extra?: Record<string, string>): NodeJS.ProcessEnv {
  const env = Object.fromEntries(config.envAllowList.flatMap((key) => process.env[key] === undefined ? [] : [[key, process.env[key]]])) as NodeJS.ProcessEnv;
  return { ...env, ...extra };
}
export function runProgram(command: string, args: string[], options: { cwd: string; timeoutMs: number; maxOutputBytes: number; env?: NodeJS.ProcessEnv; shell?: boolean; }): Promise<ProgramResult> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const child = spawn(command, args, { cwd: options.cwd, env: options.env, shell: options.shell ?? false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = ""; let bytes = 0; let truncated = false;
    const append = (target: "stdout" | "stderr", chunk: Buffer | string) => {
      const text = chunk.toString(); const remaining = Math.max(0, options.maxOutputBytes - bytes); const acceptedBuffer = Buffer.from(text).subarray(0, remaining); const accepted = acceptedBuffer.toString();
      bytes += acceptedBuffer.byteLength; if (accepted.length < text.length) truncated = true; if (target === "stdout") stdout += accepted; else stderr += accepted;
    };
    const timer = setTimeout(() => child.kill("SIGTERM"), options.timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => append("stdout", chunk)); child.stderr.on("data", (chunk: Buffer) => append("stderr", chunk)); child.on("error", reject);
    child.on("close", (exitCode, signal) => { clearTimeout(timer); resolve({ exitCode, signal, stdout, stderr, truncated, durationMs: Date.now() - startedAt }); });
  });
}
