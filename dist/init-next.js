import { promises as fs } from "node:fs";
import path from "node:path";
const INSTRUMENTATION = `export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startXCoder } = await import("@skrbe/xcoder/next");
    startXCoder();
  }
}
`;
export async function initNext(root = process.cwd()) {
    const absoluteRoot = path.resolve(root);
    const srcDirectory = path.join(absoluteRoot, "src");
    const useSrc = await exists(srcDirectory);
    const target = path.join(useSrc ? srcDirectory : absoluteRoot, "instrumentation.ts");
    if (await exists(target)) {
        return { target, created: false, content: INSTRUMENTATION };
    }
    await fs.writeFile(target, INSTRUMENTATION, { encoding: "utf8", flag: "wx" });
    return { target, created: true, content: INSTRUMENTATION };
}
async function exists(target) {
    try {
        await fs.access(target);
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=init-next.js.map