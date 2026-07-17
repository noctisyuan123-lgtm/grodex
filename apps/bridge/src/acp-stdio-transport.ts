/**
 * ACP JSON-RPC over child process stdio (NDJSON lines).
 */
import type { ChildProcess } from "node:child_process";
import * as readline from "node:readline";
import type {
  AcpHandlers,
  AcpTransport,
  JsonRpcMsg,
} from "./acp-transport.js";

export class AcpStdioTransport implements AcpTransport {
  private proc: ChildProcess | null = null;
  private rl: readline.Interface | null = null;
  private nextId = 1;
  private pending = new Map<
    number | string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private closed = false;
  private handlers: AcpHandlers | null = null;

  attach(proc: ChildProcess, handlers: AcpHandlers): void {
    this.detach();
    this.closed = false;
    this.proc = proc;
    this.handlers = handlers;
    this.rl = readline.createInterface({ input: proc.stdout! });
    this.rl.on("line", (line) => this.handleLine(line));
  }

  setHandlers(handlers: AcpHandlers): void {
    this.handlers = handlers;
  }

  isAlive(): boolean {
    return Boolean(
      this.proc &&
        !this.closed &&
        this.proc.exitCode === null &&
        this.proc.killed !== true &&
        this.proc.stdin &&
        !this.proc.stdin.destroyed
    );
  }

  write(obj: unknown): void {
    if (!this.proc?.stdin) return;
    this.proc.stdin.write(JSON.stringify(obj) + "\n");
  }

  send(
    method: string,
    params?: unknown,
    timeoutMs = 120_000
  ): Promise<unknown> {
    if (!this.proc?.stdin || this.closed) {
      return Promise.reject(new Error("Agent not started"));
    }
    const id = this.nextId++;
    this.write({ jsonrpc: "2.0", id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
    });
  }

  notify(method: string, params?: unknown): void {
    this.write({ jsonrpc: "2.0", method, params });
  }

  reply(id: number | string, result: unknown): void {
    this.write({ jsonrpc: "2.0", id, result });
  }

  replyError(id: number | string, message: string, code = -32000): void {
    this.write({
      jsonrpc: "2.0",
      id,
      error: { code, message },
    });
  }

  private handleLine(line: string): void {
    let msg: JsonRpcMsg;
    try {
      msg = JSON.parse(line) as JsonRpcMsg;
    } catch {
      return;
    }

    if (msg.id != null && msg.method == null) {
      const p = this.pending.get(msg.id);
      if (p) {
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
        else p.resolve(msg.result);
      }
      return;
    }

    if (msg.method) {
      if (msg.id != null) {
        void this.handlers?.onRequest(msg.id, msg.method, msg.params);
      } else {
        this.handlers?.onNotification(msg.method, msg.params);
      }
    }
  }

  close(): void {
    this.detach();
  }

  detach(): void {
    this.closed = true;
    try {
      this.rl?.close();
    } catch {
      /* ignore */
    }
    this.rl = null;
    for (const [, p] of this.pending) {
      p.reject(new Error("Agent transport closed"));
    }
    this.pending.clear();
    this.proc = null;
    this.handlers = null;
  }

  dispose(): void {
    try {
      this.proc?.kill();
    } catch {
      /* ignore */
    }
    this.detach();
  }
}
