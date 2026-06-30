import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import type { ToolDefinition } from "./types.js";

export const tools: ToolDefinition[] = [
  {
    name: "read_file",
    description: "Lê um arquivo UTF-8 dentro dos roots autorizados.",
    risk: "read",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Caminho do arquivo relativo ao workspace." },
      },
      required: ["path"],
      additionalProperties: false,
    },
    async execute(input: unknown, context) {
      const values = asObject(input);
      const inputPath = values.path;
      if (typeof inputPath !== "string") throw new Error("path é obrigatório.");
      const target = context.resolvePath(inputPath);
      const stats = await fs.stat(target);
      if (!stats.isFile()) throw new Error(`Não é um arquivo: ${target}`);
      if (stats.size > context.config.maxReadBytes) throw new Error("Arquivo excede SKRBE_MAX_READ_BYTES.");
      return { path: target, size: stats.size, content: await fs.readFile(target, "utf8") };
    },
  },
  {
    name: "list_files",
    description: "Lista arquivos e diretórios dentro dos roots autorizados.",
    risk: "read",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Diretório relativo ao workspace. Padrão: raiz." },
      },
      additionalProperties: false,
    },
    async execute(input: unknown, context) {
      const values = asObject(input);
      const inputPath = values.path ?? ".";
      if (typeof inputPath !== "string") throw new Error("path inválido.");
      const target = context.resolvePath(inputPath);
      const entries = await fs.readdir(target, { withFileTypes: true });
      return entries.map((entry) => ({
        name: entry.name,
        path: path.relative(context.config.workspace, path.join(target, entry.name)),
        type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
      }));
    },
  },
  {
    name: "write_file",
    description: "Cria ou substitui um arquivo UTF-8.",
    risk: "write",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Caminho do arquivo relativo ao workspace." },
        content: { type: "string", description: "Conteúdo completo do arquivo." },
        createDirectories: { type: "boolean", description: "Cria diretórios-pai. Padrão: true." },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
    async execute(input: unknown, context) {
      const values = asObject(input);
      const inputPath = values.path;
      const content = values.content;
      const createDirectories = values.createDirectories ?? true;
      if (typeof inputPath !== "string" || typeof content !== "string") throw new Error("path e content são obrigatórios.");
      const target = context.resolvePath(inputPath);
      if (createDirectories) await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, content, "utf8");
      return { path: target, bytes: Buffer.byteLength(content) };
    },
  },
  {
    name: "remove_path",
    description: "Remove um arquivo ou diretório.",
    risk: "destructive",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Caminho relativo ao workspace." },
        recursive: { type: "boolean", description: "Remove diretórios recursivamente." },
      },
      required: ["path"],
      additionalProperties: false,
    },
    async execute(input: unknown, context) {
      const values = asObject(input);
      const inputPath = values.path;
      if (typeof inputPath !== "string") throw new Error("path é obrigatório.");
      const target = context.resolvePath(inputPath);
      if (path.resolve(target) === path.resolve(context.config.workspace)) throw new Error("Não é permitido remover o workspace raiz.");
      await fs.rm(target, { recursive: Boolean(values.recursive ?? false), force: false });
      return { removed: target };
    },
  },
  {
    name: "exec",
    description: "Executa um comando no workspace e captura stdout/stderr.",
    risk: "execute",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Comando a executar." },
        cwd: { type: "string", description: "Diretório relativo ao workspace. Padrão: raiz." },
        timeoutMs: { type: "number", description: "Timeout em milissegundos. Padrão: 120000." },
      },
      required: ["command"],
      additionalProperties: false,
    },
    async execute(input: unknown, context) {
      const values = asObject(input);
      const command = values.command;
      const cwd = values.cwd ?? ".";
      const timeoutMs = values.timeoutMs ?? 120_000;
      if (typeof command !== "string" || !command.trim()) throw new Error("command é obrigatório.");
      if (typeof cwd !== "string" || typeof timeoutMs !== "number" || timeoutMs <= 0) throw new Error("Parâmetros de execução inválidos.");
      return executeCommand(command, context.resolvePath(cwd), timeoutMs, context.config.envAllowList, context.config.maxOutputBytes);
    },
  },
];

function executeCommand(command: string, cwd: string, timeoutMs: number, envAllowList: string[], maxOutputBytes: number): Promise<{ exitCode: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    const env = Object.fromEntries(envAllowList.flatMap((key) => process.env[key] === undefined ? [] : [[key, process.env[key]]])) as NodeJS.ProcessEnv;
    const child = spawn(command, { cwd, env, shell: true, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let bytes = 0;
    let truncated = false;
    const append = (target: "stdout" | "stderr", chunk: Buffer | string) => {
      const text = chunk.toString();
      const remaining = Math.max(0, maxOutputBytes - bytes);
      const accepted = Buffer.from(text).subarray(0, remaining).toString();
      bytes += Buffer.byteLength(accepted);
      if (accepted.length < text.length) truncated = true;
      if (target === "stdout") stdout += accepted;
      else stderr += accepted;
    };
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => append("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => append("stderr", chunk));
    child.on("error", reject);
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      resolve({ exitCode, signal, stdout, stderr, truncated });
    });
  });
}

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Input deve ser um objeto.");
  return value as Record<string, unknown>;
}
