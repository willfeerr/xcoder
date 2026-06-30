import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";

interface BrowserSession {
  id: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  console: Array<Record<string, unknown>>;
  network: Array<Record<string, unknown>>;
}

interface WorkerRequest {
  id: string;
  method: string;
  params: Record<string, unknown>;
}

interface WorkerResponse {
  id: string;
  result?: unknown;
  error?: string;
}

const sessions = new Map<string, BrowserSession>();

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} é obrigatório.`);
  return value;
}

function optionalString(
  input: Record<string, unknown>,
  key: string,
  fallback?: string,
): string | undefined {
  const value = input[key];
  if (value === undefined) return fallback;
  if (typeof value !== "string") throw new Error(`${key} deve ser string.`);
  return value;
}

function optionalNumber(input: Record<string, unknown>, key: string, fallback: number): number {
  const value = input[key];
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${key} deve ser número.`);
  }
  return value;
}

function optionalBoolean(
  input: Record<string, unknown>,
  key: string,
  fallback = false,
): boolean {
  const value = input[key];
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new Error(`${key} deve ser boolean.`);
  return value;
}

function getSession(id: string): BrowserSession {
  const session = sessions.get(id);
  if (!session) throw new Error(`Sessão de navegador não encontrada: ${id}`);
  return session;
}

async function execute(method: string, params: Record<string, unknown>): Promise<unknown> {
  switch (method) {
    case "open": {
      const name = optionalString(params, "browser", "chromium")!;
      const browserType = name === "firefox" ? firefox : name === "webkit" ? webkit : chromium;
      const browser = await browserType.launch({
        headless: optionalBoolean(params, "headless", true),
      });
      const context = await browser.newContext({
        viewport: {
          width: optionalNumber(params, "width", 1440),
          height: optionalNumber(params, "height", 900),
        },
      });
      const page = await context.newPage();
      const id = randomUUID();
      const session: BrowserSession = {
        id,
        browser,
        context,
        page,
        console: [],
        network: [],
      };

      page.on("console", (message) => {
        session.console.push({
          type: message.type(),
          text: message.text(),
          at: new Date().toISOString(),
        });
      });
      page.on("pageerror", (error) => {
        session.console.push({
          type: "pageerror",
          text: error.message,
          at: new Date().toISOString(),
        });
      });
      page.on("response", (response) => {
        if (response.status() >= 400) {
          session.network.push({
            url: response.url(),
            status: response.status(),
            method: response.request().method(),
          });
        }
      });
      page.on("requestfailed", (request) => {
        session.network.push({
          url: request.url(),
          method: request.method(),
          error: request.failure()?.errorText,
        });
      });

      sessions.set(id, session);
      try {
        const response = await page.goto(requiredString(params, "url"), {
          waitUntil: "domcontentloaded",
          timeout: optionalNumber(params, "timeoutMs", 30_000),
        });
        return {
          sessionId: id,
          browser: name,
          url: page.url(),
          title: await page.title(),
          status: response?.status() ?? null,
        };
      } catch (error) {
        sessions.delete(id);
        await context.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
        throw error;
      }
    }

    case "snapshot": {
      const session = getSession(requiredString(params, "sessionId"));
      const maxChars = Math.max(1, optionalNumber(params, "maxChars", 100_000));
      const text = (await session.page.locator("body").innerText()).slice(0, maxChars);
      const html = optionalBoolean(params, "includeHtml")
        ? (await session.page.content()).slice(0, maxChars)
        : undefined;
      return {
        sessionId: session.id,
        url: session.page.url(),
        title: await session.page.title(),
        text,
        html,
      };
    }

    case "screenshot": {
      const session = getSession(requiredString(params, "sessionId"));
      const target = optionalString(params, "path");
      if (target) await fs.mkdir(path.dirname(target), { recursive: true });
      const selector = optionalString(params, "selector");
      const buffer = selector
        ? await session.page.locator(selector).screenshot({ path: target })
        : await session.page.screenshot({
            path: target,
            fullPage: optionalBoolean(params, "fullPage", true),
          });
      return {
        content: [
          {
            type: "image",
            data: buffer.toString("base64"),
            mimeType: "image/png",
          },
        ],
        sessionId: session.id,
        path: target,
        bytes: buffer.byteLength,
      };
    }

    case "click": {
      const session = getSession(requiredString(params, "sessionId"));
      await session.page.locator(requiredString(params, "selector")).click({
        timeout: optionalNumber(params, "timeoutMs", 30_000),
      });
      return { sessionId: session.id, url: session.page.url() };
    }

    case "fill": {
      const session = getSession(requiredString(params, "sessionId"));
      await session.page
        .locator(requiredString(params, "selector"))
        .fill(requiredString(params, "value"));
      return { sessionId: session.id };
    }

    case "evaluate": {
      const session = getSession(requiredString(params, "sessionId"));
      const expression = requiredString(params, "expression");
      const evaluateExpression = session.page.evaluate as unknown as (
        source: string,
      ) => Promise<unknown>;
      return { sessionId: session.id, value: await evaluateExpression(expression) };
    }

    case "console": {
      const session = getSession(requiredString(params, "sessionId"));
      const messages = [...session.console];
      if (optionalBoolean(params, "clear")) session.console.length = 0;
      return { sessionId: session.id, messages };
    }

    case "network": {
      const session = getSession(requiredString(params, "sessionId"));
      const events = [...session.network];
      if (optionalBoolean(params, "clear")) session.network.length = 0;
      return { sessionId: session.id, events };
    }

    case "record": {
      const name = optionalString(params, "browser", "chromium")!;
      const browserType = name === "firefox" ? firefox : name === "webkit" ? webkit : chromium;
      const videoPath = requiredString(params, "path");
      const tracePath = optionalString(params, "tracePath");
      const width = Math.max(320, optionalNumber(params, "width", 1440));
      const height = Math.max(240, optionalNumber(params, "height", 900));
      const durationMs = Math.min(120_000, Math.max(1_000, optionalNumber(params, "durationMs", 15_000)));
      const timeoutMs = Math.max(1_000, optionalNumber(params, "timeoutMs", 30_000));
      const autoScroll = optionalBoolean(params, "autoScroll", true);
      const scrollStep = Math.max(1, optionalNumber(params, "scrollStep", 420));
      const scrollIntervalMs = Math.max(50, optionalNumber(params, "scrollIntervalMs", 700));
      const artifactDir = path.dirname(videoPath);
      const temporaryVideoDir = path.join(
        artifactDir,
        `.xcoder-video-${randomUUID()}`,
      );

      await fs.mkdir(artifactDir, { recursive: true });
      if (tracePath) await fs.mkdir(path.dirname(tracePath), { recursive: true });
      await fs.mkdir(temporaryVideoDir, { recursive: true });

      const browser = await browserType.launch({
        headless: optionalBoolean(params, "headless", true),
      });
      const context = await browser.newContext({
        viewport: { width, height },
        recordVideo: {
          dir: temporaryVideoDir,
          size: { width, height },
        },
      });

      const consoleMessages: Array<Record<string, unknown>> = [];
      const networkEvents: Array<Record<string, unknown>> = [];
      const page = await context.newPage();
      const video = page.video();
      const startedAt = Date.now();
      let status: number | null = null;
      let title = "";
      let finalUrl = "";
      let animationSummary: unknown = null;

      page.on("console", (message) => {
        consoleMessages.push({
          type: message.type(),
          text: message.text(),
          at: new Date().toISOString(),
        });
      });
      page.on("pageerror", (error) => {
        consoleMessages.push({
          type: "pageerror",
          text: error.message,
          at: new Date().toISOString(),
        });
      });
      page.on("response", (response) => {
        if (response.status() >= 400) {
          networkEvents.push({
            url: response.url(),
            status: response.status(),
            method: response.request().method(),
          });
        }
      });
      page.on("requestfailed", (request) => {
        networkEvents.push({
          url: request.url(),
          method: request.method(),
          error: request.failure()?.errorText,
        });
      });

      try {
        if (tracePath) {
          await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
        }

        const response = await page.goto(requiredString(params, "url"), {
          waitUntil: "domcontentloaded",
          timeout: timeoutMs,
        });
        status = response?.status() ?? null;
        title = await page.title();
        finalUrl = page.url();

        await page.waitForTimeout(Math.min(1_500, Math.floor(durationMs / 4)));

        if (autoScroll) {
          const remaining = Math.max(0, durationMs - (Date.now() - startedAt));
          await page.evaluate(
            async ({ totalMs, step, intervalMs }) => {
              const pageWindow = globalThis as any;
              const started = pageWindow.performance.now();
              let direction = 1;
              while (pageWindow.performance.now() - started < totalMs) {
                const maxScroll = Math.max(
                  0,
                  pageWindow.document.documentElement.scrollHeight - pageWindow.innerHeight,
                );
                const next = Math.min(
                  maxScroll,
                  Math.max(0, pageWindow.scrollY + step * direction),
                );
                pageWindow.scrollTo({ top: next, behavior: "smooth" });
                if (next >= maxScroll) direction = -1;
                if (next <= 0) direction = 1;
                await new Promise((resolve) => setTimeout(resolve, intervalMs));
              }
            },
            {
              totalMs: remaining,
              step: scrollStep,
              intervalMs: scrollIntervalMs,
            },
          );
        } else {
          const remaining = Math.max(0, durationMs - (Date.now() - startedAt));
          if (remaining > 0) await page.waitForTimeout(remaining);
        }

        animationSummary = await page.evaluate(() => {
          const pageWindow = globalThis as any;
          const animations = pageWindow.document.getAnimations() as Array<{ playState: string }>;
          return {
            total: animations.length,
            running: animations.filter((animation) => animation.playState === "running").length,
            paused: animations.filter((animation) => animation.playState === "paused").length,
            finished: animations.filter((animation) => animation.playState === "finished").length,
            scrollY: pageWindow.scrollY,
            scrollHeight: pageWindow.document.documentElement.scrollHeight,
            viewport: { width: pageWindow.innerWidth, height: pageWindow.innerHeight },
          };
        });

        if (tracePath) await context.tracing.stop({ path: tracePath });
        await context.close();
        if (video) await video.saveAs(videoPath);
        const stats = await fs.stat(videoPath);

        return {
          browser: name,
          url: finalUrl,
          title,
          status,
          path: videoPath,
          tracePath,
          bytes: stats.size,
          durationMs: Date.now() - startedAt,
          animationSummary,
          console: consoleMessages,
          network: networkEvents,
        };
      } catch (error) {
        if (tracePath) {
          await context.tracing.stop({ path: tracePath }).catch(() => undefined);
        }
        await context.close().catch(() => undefined);
        throw error;
      } finally {
        await browser.close().catch(() => undefined);
        await fs.rm(temporaryVideoDir, { recursive: true, force: true }).catch(() => undefined);
      }
    }

    case "close": {
      const id = requiredString(params, "sessionId");
      const session = getSession(id);
      await session.context.close();
      await session.browser.close();
      sessions.delete(id);
      return { sessionId: id, closed: true };
    }

    default:
      throw new Error(`Operação Playwright desconhecida: ${method}`);
  }
}

process.on("message", async (message: WorkerRequest) => {
  if (!message || typeof message.id !== "string" || typeof message.method !== "string") return;
  const response: WorkerResponse = { id: message.id };
  try {
    response.result = await execute(message.method, message.params ?? {});
  } catch (error) {
    response.error = error instanceof Error ? error.stack || error.message : String(error);
  }
  process.send?.(response);
});

async function shutdown(): Promise<void> {
  await Promise.allSettled(
    [...sessions.values()].map(async (session) => {
      await session.context.close().catch(() => undefined);
      await session.browser.close().catch(() => undefined);
    }),
  );
  process.exit(0);
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
