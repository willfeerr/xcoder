import { EventEmitter } from "node:events";
import WebSocket from "ws";
import type { AgentConfig, BridgeMessage } from "./types.js";

export class SkrbeComBridge extends EventEmitter {
  #socket?: WebSocket;
  #stopped = false;
  #heartbeat?: NodeJS.Timeout;
  #reconnectTimer?: NodeJS.Timeout;
  #attempt = 0;
  #pongReceived = true;

  constructor(private readonly config: AgentConfig) { super(); }

  connect(): void { this.#stopped = false; this.#open(); }

  stop(): void {
    this.#stopped = true;
    if (this.#heartbeat) clearInterval(this.#heartbeat);
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
    this.#socket?.close(1000, "agent stopped");
  }

  send(message: BridgeMessage): void {
    if (this.#socket?.readyState !== WebSocket.OPEN) throw new Error("SkrbeCom Bridge não está conectado.");
    this.#socket.send(JSON.stringify(message));
  }

  #open(): void {
    const socket = new WebSocket(this.config.bridgeUrl, {
      headers: {
        authorization: `Bearer ${this.config.token}`,
        "x-skrbe-agent-id": this.config.agentId,
      },
    });
    this.#socket = socket;

    socket.on("open", () => {
      this.#attempt = 0;
      this.#pongReceived = true;
      this.send({
        type: "event",
        event: "agent.register",
        data: {
          agentId: this.config.agentId,
          workspace: this.config.workspace,
          permission: this.config.permission,
          protocolVersion: 1,
        },
      });
      this.#heartbeat = setInterval(() => {
        if (socket.readyState !== WebSocket.OPEN) return;
        if (!this.#pongReceived) return socket.terminate();
        this.#pongReceived = false;
        socket.ping();
      }, this.config.heartbeatMs);
      this.emit("connected");
    });

    socket.on("pong", () => { this.#pongReceived = true; });
    socket.on("message", (data) => {
      try { this.emit("message", JSON.parse(data.toString()) as BridgeMessage); }
      catch (error) { this.emit("error", error); }
    });
    socket.on("close", () => {
      if (this.#heartbeat) clearInterval(this.#heartbeat);
      this.emit("disconnected");
      if (!this.#stopped) this.#scheduleReconnect();
    });
    socket.on("error", (error) => this.emit("error", error));
  }

  #scheduleReconnect(): void {
    this.#attempt += 1;
    const exponential = Math.min(
      this.config.reconnectMaxMs,
      this.config.reconnectMinMs * 2 ** Math.min(this.#attempt - 1, 8),
    );
    const jitter = Math.floor(Math.random() * Math.max(100, exponential * 0.2));
    this.#reconnectTimer = setTimeout(() => this.#open(), exponential + jitter);
  }
}
