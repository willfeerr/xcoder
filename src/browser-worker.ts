import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Browser, BrowserContext, Page } from "playwright";

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

type PlaywrightModule = typeof import("playwright");

const sessions = new Map<string, BrowserSession>();
let playwrightModule: Promise<PlaywrightModule> | undefined;

async function getPlaywright(): Promise<PlaywrightModule> {
  playwrightModule ??= import("playwright").catch((error: unknown) => {
    playwrightModule = undefined;
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      "As tools de navegador são opcionais. Instale-as com " +
        "`pnpm add -D playwright@1.61.1 && pnpm exec playwright install chromium`. " +
        `Detalhe: ${detail}`,
    );
  });
  return playwrightModule;
}

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
      const { chromium, firefox, webkit } = await getPlaywright();
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
      const { chromium, firefox, webkit } = await getPlaywright();
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

      if (tracePath) {
        await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
      }

      const page = await context.newPage();
      try {
        const response = await page.goto(requiredString(params, "url"), {
          waitUntil: "domcontentloaded",
          timeout: timeoutMs,
        });

        const startedAt = Date.now();
        while (Date.now() - startedAt < durationMs) {
          if (autoScroll) {
            await page.evaluate((step) => window.scrollBy(0, step), scrollStep);
          }
          await page.waitForTimeout(scrollIntervalMs);
        }

        if (tracePath) await context.tracing.stop({ path: tracePath });
        const video = page.video();
        await context.close();
        const generatedPath = video ? await video.path() : undefined;
        if (!generatedPath) throw new Error("O Playwright não gerou o vídeo esperado.");
        await fs.copyFile(generatedPath, videoPath);
        const stat = await fs.stat(videoPath);
        return {
          path: videoPath,
          tracePath,
          bytes: stat.size,
          browser: name,
          status: response?.status() ?? null,
          durationMs,
        };
      } finally {
        await context.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
        await fs.rm(temporaryVideoDir, { recursive: true, force: true }).catch(() => undefined);
      }
    }

    case "close": {
      const id = requiredString(params, "sessionId");
      const session = getSession(id);
      sessions.delete(id);
      await session.context.close();
      await session.browser.close();
      return { sessionId: id, closed: true };
    }

    default:
      throw new Error(`Método de navegador não suportado: ${method}`);
  }
}

process.on("message", async (request: WorkerRequest) => {
  const response: WorkerResponse = { id: request.id };
  try {
    response.result = await execute(request.method, request.params);
  } catch (error) {
    response.error = error instanceof Error ? error.message : String(error);
  }
  if (process.send) process.send(response);
});
