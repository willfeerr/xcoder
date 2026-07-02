import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
export function asObject(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new Error("Input deve ser um objeto.");
    return value;
}
export function requiredString(input, key) {
    const value = input[key];
    if (typeof value !== "string" || !value.trim())
        throw new Error(`${key} é obrigatório.`);
    return value;
}
export function optionalString(input, key, fallback) {
    const value = input[key];
    if (value === undefined)
        return fallback;
    if (typeof value !== "string")
        throw new Error(`${key} deve ser string.`);
    return value;
}
export function optionalNumber(input, key, fallback) {
    const value = input[key];
    if (value === undefined)
        return fallback;
    if (typeof value !== "number" || !Number.isFinite(value))
        throw new Error(`${key} deve ser número.`);
    return value;
}
export function optionalBoolean(input, key, fallback = false) {
    const value = input[key];
    if (value === undefined)
        return fallback;
    if (typeof value !== "boolean")
        throw new Error(`${key} deve ser boolean.`);
    return value;
}
export function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
export function allowedEnv(config, extra) {
    const env = Object.fromEntries(config.envAllowList.flatMap((key) => process.env[key] === undefined ? [] : [[key, process.env[key]]]));
    return { ...env, ...extra };
}
export function runProgram(command, args, options) {
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const child = spawn(command, args, { cwd: options.cwd, env: options.env, shell: options.shell ?? false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        let bytes = 0;
        let truncated = false;
        const append = (target, chunk) => {
            const text = chunk.toString();
            const remaining = Math.max(0, options.maxOutputBytes - bytes);
            const acceptedBuffer = Buffer.from(text).subarray(0, remaining);
            const accepted = acceptedBuffer.toString();
            bytes += acceptedBuffer.byteLength;
            if (accepted.length < text.length)
                truncated = true;
            if (target === "stdout")
                stdout += accepted;
            else
                stderr += accepted;
        };
        const timer = setTimeout(() => child.kill("SIGTERM"), options.timeoutMs);
        child.stdout.on("data", (chunk) => append("stdout", chunk));
        child.stderr.on("data", (chunk) => append("stderr", chunk));
        child.on("error", reject);
        child.on("close", (exitCode, signal) => { clearTimeout(timer); resolve({ exitCode, signal, stdout, stderr, truncated, durationMs: Date.now() - startedAt }); });
    });
}
//# sourceMappingURL=runtime.js.map