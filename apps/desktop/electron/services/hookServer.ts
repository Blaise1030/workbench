// apps/desktop/electron/services/hookServer.ts
import http from "node:http";
import net from "node:net";
import { URL } from "node:url";

export type HookEventBody = Record<string, unknown>;
export type HookHandler = (event: HookEventBody, threadId: string) => void;

export class HookServer {
  private server: http.Server | null = null;
  private handler: HookHandler | null = null;
  private port = 0;
  private sockets = new Set<net.Socket>();

  setHandler(handler: HookHandler): void {
    this.handler = handler;
  }

  getUrl(): string {
    if (this.port === 0) throw new Error("HookServer not started");
    return `http://127.0.0.1:${this.port}`;
  }

  start(): Promise<void> {
    if (this.server) throw new Error("HookServer already started");
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        if (req.method !== "POST" || !req.url?.startsWith("/hook")) {
          res.writeHead(404).end();
          return;
        }

        const parsedUrl = new URL(req.url, `http://127.0.0.1`);
        const threadId = parsedUrl.searchParams.get("thread") ?? "";

        const chunks: Buffer[] = [];
        req.on("error", () => { res.writeHead(400).end(); });
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          res.writeHead(200).end();
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString()) as HookEventBody;
            this.handler?.(body, threadId);
          } catch {
            // malformed JSON — ignore
          }
        });
      });

      this.server.on("connection", (socket: net.Socket) => {
        this.sockets.add(socket);
        socket.once("close", () => this.sockets.delete(socket));
      });

      this.server.once("error", reject);
      this.server.listen(0, "127.0.0.1", () => {
        const addr = this.server!.address();
        this.port = typeof addr === "object" && addr ? addr.port : 0;
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) return resolve();
      for (const socket of this.sockets) socket.destroy();
      this.sockets.clear();
      this.server.close(() => resolve());
    });
  }
}
