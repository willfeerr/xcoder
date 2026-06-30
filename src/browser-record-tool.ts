import { fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import {
  asObject,
  optionalBoolean,
  optionalNumber,
  optionalString,
  requiredString,
} from "./runtime.js";
import type { ToolDefinition } from "./types.js";

interface WorkerResponse {
  id: string;
  result?: unknown;
  error?: string;
}

function resolveWorkerPath(): string {
  const projectRequire = createRequire(path.join(process.cwd(), "package.json"));
  return projectRequire.resolve(["@skrbe", "xcoder", "browser-worker"].join("/"));
}

async function record(params: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
  const id = randomUUID();
  const child = fork(resolveWorkerPath(), [], {
    env: process.env,
    execArgv: [],
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer | string) => {
    stderr = (stderr + chunk.toString()).slice(-64_000);
  });

  return new Promise((resolve, reject) => {
    const finish = () => {
      if (child.connected) child.disconnect();
      child.kill("SIGTERM");
    };
    const timer = setTimeout(() => {
      finish();
      reject(new Error(`Timeout de ${timeoutMs}ms durante a gravação do navegador.`));
    }, timeoutMs);

    child.on("message", (message: WorkerResponse) => {
      if (!message || message.id !== id) return;
      clearTimeout(timer);
      finish();
      if (message.error) reject(new Error(message.error));
      else resolve(message.result);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      finish();
      reject(error);
    });
    child.once("exit", (code, signal) => {
      if (code === 0 || signal === "SIGTERM") return;
      clearTimeout(timer);
      reject(
        new Error(
          `Worker de vídeo encerrou com code=${String(code)} signal=${String(signal)}${
            stderr.trim() ? `: ${stderr.trim()}` : ""
          }`,
        ),
      );
    });

    child.send({ id, method: "record", params });
  });
}

export const browserRecordTool: ToolDefinition = {
  name: "browser_record",
  description:
    "Grava vídeo WebM e trace de uma página animada, com rolagem automática e diagnóstico de console/rede.",
  risk: "execute",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string" },
      path: { type: "string" },
      tracePath: { type: "string" },
      browser: { type: "string", enum: ["chromium", "firefox", "webkit"] },
      headless: { type: "boolean" },
      width: { type: "number" },
      height: { type: "number" },
      durationMs: { type: "number" },
      timeoutMs: { type: "number" },
      autoScroll: { type: "boolean" },
      scrollStep: { type: "number" },
      scrollIntervalMs: { type: "number" },
    },
    required: ["url", "path"],
    additionalProperties: false,
  },
  async execute(input, context) {
    const values = asObject(input);
    const timeoutMs = optionalNumber(values, "timeoutMs", 30_000);
    const durationMs = optionalNumber(values, "durationMs", 15_000);
    const tracePath = optionalString(values, "tracePath");
    return record(
      {
        url: requiredString(values, "url"),
        path: context.resolvePath(requiredString(values, "path")),
        tracePath: tracePath ? context.resolvePath(tracePath) : undefined,
        browser: optionalString(values, "browser", "chromium"),
        headless: optionalBoolean(values, "headless", true),
        width: optionalNumber(values, "width", 1440),
        height: optionalNumber(values, "height", 900),
        durationMs,
        timeoutMs,
        autoScroll: optionalBoolean(values, "autoScroll", true),
        scrollStep: optionalNumber(values, "scrollStep", 420),
        scrollIntervalMs: optionalNumber(values, "scrollIntervalMs", 700),
      },
      timeoutMs + durationMs + 30_000,
    );
  },
};
