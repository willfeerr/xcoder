import fs from "node:fs";
import path from "node:path";
import type { AgentConfig } from "./types.js";

export function createPathResolver(config: AgentConfig): (inputPath: string) => string {
  if (config.roots.includes("*")) return (inputPath) => path.resolve(config.workspace, inputPath);
  const roots = config.roots.map(canonicalExistingPath);

  return (inputPath) => {
    const resolved = path.resolve(config.workspace, inputPath);
    const canonicalTarget = canonicalWithNearestParent(resolved);
    const allowed = roots.some((root) => isInside(root, canonicalTarget));
    if (!allowed) throw new Error(`Acesso negado fora dos roots permitidos: ${resolved}`);
    return resolved;
  };
}

function canonicalExistingPath(value: string): string {
  if (!fs.existsSync(value)) throw new Error(`Root configurado não existe: ${value}`);
  return fs.realpathSync.native(value);
}

function canonicalWithNearestParent(value: string): string {
  let cursor = value;
  const missing: string[] = [];
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    missing.unshift(path.basename(cursor));
    cursor = parent;
  }
  return path.join(fs.realpathSync.native(cursor), ...missing);
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
