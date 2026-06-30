import { EventEmitter } from "node:events";
import WebSocket from "ws";
import type { AgentConfig, BridgeMessage, BridgeRegistration } from "./types.js";

export class SkrbeComBridge extends EventEmitter {
  #socket?: WebSocket;
  #stopped = false;
  #authenticated = false;
  #heartbeat?: NodeJS.Timeout;
  #reconnectTimer?: NodeJS.Timeout;
  #attempt = 0;
  #pongReceived = true;
  #registration?: BridgeRegistration;

  constructor(private readonly config: AgentConfig) { super(); }

  connect(): void { this.#stopped = false; this.#open(); }

  register(registration: Omit<BridgeRegistration, "type">): void {
    this.#registration = { type: "register", ...registration };
    if (this.#authenticated && this.#socket?.readyState === WebSocket.OPEN) this.send(this.#registration);
  }

  stop(): void {
    this.#stopped = true;
    this.#authenticated = false;
    if (this.#heartbeat) clearInterval(this.#heartbeat);
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
    this.#socket?.close(1000, "agent stopped");
  }

  send(message: unknown): void {
    if (this.#socket?.readyState !== WebSocket.OPEN) throw new Error("SkrbeCom Bridge não está conectado.");
    this.#socket.send(JSON.stringify(message));
  }

  #open(): void {
    this.#authenticated = false;
    const socket = new WebSocket(this.config.bridgeUrl);
    this.#socket = socket;

    socket.on("open", () => {
      this.#attempt = 0;
      this.#pongReceived = true;
      this.send({ type: "auth", token: this.config.token });
      this.#heartbeat = setInterval(() => {
        if (socket.readyState !== WebSocket.OPEN) return;
        if (!this.#pongReceived) return socket.terminate();
        this.#pongReceived = false;
        socket.ping();
      }, this.config.heartbeatMs);
      this.emit("socket_open");
    });

    socket.on("pong", () => { this.#pongReceived = true; });
    socket.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString()) as BridgeMessage;
        if (isType(message, "authenticated")) {
          this.#authenticated = true;
          this.emit("authenticated", message);
          if (this.#registration) this.send(this.#registration);
          return;
        }
        if (isType(message, "registered")) {
          this.emit("registered", message);
          this.emit("connected");
          return;
        }
        if (isType(message, "auth_failed")) {
          this.emit("error", new Error(String(message.error ?? "Autenticação recusada pelo SkrbeCom Bridge.")));
          socket.close(4001, "auth failed");
          return;
        }
        this.emit("message", message);
      } catch (error) {
        this.emit("error", error);
      }
    });

    socket.on("close", () => {
      this.#authenticated = false;
      if (this.#heartbeat) clearInterval(this.#heartbeat);
      this.emit("disconnected");
      if (!this.#stopped) this.#scheduleReconnect();
    });
    socket.on("error", (error) => this.emit("error", error));
  }

  #scheduleReconnect(): void {
    this.#attempt += 1;
    const exponential = Math.min(this.config.reconnectMaxMs, this.config.reconnectMinMs * 2 ** Math.min(this.#attempt - 1, 8));
    const jitter = Math.floor(Math.random() * Math.max(100, exponential * 0.2));
    this.#reconnectTimer = setTimeout(() => this.#open(), exponential + jitter);
  }
}

function isType(message: BridgeMessage, type: string): message is Record<string, unknown> {
  return typeof message === "object" && message !== null && "type" in message && message.type === type;
}
