// apps/desktop/electron/services/__tests__/hookServer.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { HookServer } from "../hookServer";

describe("HookServer", () => {
  let server: HookServer;

  afterEach(async () => {
    await server.stop();
  });

  it("starts on a random port and returns a URL", async () => {
    server = new HookServer();
    await server.start();
    expect(server.getUrl()).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  it("delivers POST /hook body to registered handler with thread ID from query", async () => {
    server = new HookServer();
    await server.start();

    const received: unknown[] = [];
    let resolveReceived!: () => void;
    const receivedPromise = new Promise<void>((r) => { resolveReceived = r; });

    server.setHandler((event, threadId) => {
      received.push({ event, threadId });
      resolveReceived();
    });

    const url = `${server.getUrl()}/hook?thread=thread-abc`;
    const body = { hook_event_name: "SessionStart", session_id: "sid-123" };
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    await receivedPromise;
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({
      event: { hook_event_name: "SessionStart", session_id: "sid-123" },
      threadId: "thread-abc",
    });
  });

  it("responds 200 to valid POST and ignores non-POST requests", async () => {
    server = new HookServer();
    await server.start();
    server.setHandler(() => {});

    const postRes = await fetch(`${server.getUrl()}/hook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(postRes.status).toBe(200);

    const getRes = await fetch(`${server.getUrl()}/hook`);
    expect(getRes.status).toBe(404);
  });
});
