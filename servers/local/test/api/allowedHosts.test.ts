import { createServer, get } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../shared/db", async () =>
  (await import("../helpers/inMemoryDb")).inMemoryDbModule(),
);

// The Tailscale name a phone would reach the app by. Read when the app is
// first built, which is after this.
process.env.ALLOWED_HOSTS = "macbook.tail1234.ts.net";

import type { ServerType } from "@hono/node-server";
import { createApp } from "../../api/app";
import { startSocketServer } from "../../api/src/sockets/socketManager";

async function request(url: string, init: RequestInit = {}) {
  return (await createApp()).request(url, init);
}

/** A multipart upload, the kind of request a browser sends unasked. */
function formPost(origin: string) {
  return request("http://localhost/upload/image", {
    method: "POST",
    headers: { Origin: origin },
    body: new FormData(),
  });
}

describe("requests from off this machine", () => {
  it("are refused when addressed to another name, as DNS rebinding does", async () => {
    expect((await request("http://evil.test/conversations")).status).toBe(403);
  });

  it.each(["localhost", "127.0.0.1", "[::1]"])(
    "are answered when addressed to %s",
    async (hostname) => {
      expect((await request(`http://${hostname}/conversations`)).status).toBe(
        200,
      );
    },
  );

  it("are answered when addressed to a name in ALLOWED_HOSTS", async () => {
    expect(
      (await request("https://macbook.tail1234.ts.net/conversations")).status,
    ).toBe(200);
  });

  it("go through when a form post comes from a page under a name in ALLOWED_HOSTS", async () => {
    expect((await formPost("https://macbook.tail1234.ts.net")).status).toBe(
      400,
    );
  });

  it("are refused when a form post comes from another site", async () => {
    expect((await formPost("https://evil.test")).status).toBe(403);
  });

  it.each(["http://localhost:3002", "http://127.0.0.1:5173"])(
    "go through when a form post comes from a page at %s",
    async (origin) => {
      // Past the origin check, the empty form fails validation instead.
      expect((await formPost(origin)).status).toBe(400);
    },
  );

  it("get no CORS headers to read a response with", async () => {
    const res = await request("http://localhost/conversations", {
      headers: { Origin: "https://evil.test" },
    });

    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("socket connections", () => {
  let port: number;
  const server = createServer();

  beforeAll(async () => {
    startSocketServer(server as unknown as ServerType);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => {
    server.close();
  });

  /**
   * Opens a Socket.IO session the way the client's first request does, and
   * answers its status. node:http rather than fetch, which won't send a Host.
   */
  function handshake(headers: Record<string, string>) {
    return new Promise<number | undefined>((resolve, reject) => {
      get(
        {
          host: "127.0.0.1",
          port,
          path: "/socket.io/?EIO=4&transport=polling",
          headers,
        },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      ).on("error", reject);
    });
  }

  it("are accepted from a page on this machine", async () => {
    expect(await handshake({ Origin: "http://localhost:5173" })).toBe(200);
  });

  it("are accepted without an Origin, which no browser omits", async () => {
    expect(await handshake({})).toBe(200);
  });

  it("are accepted from a page under a name in ALLOWED_HOSTS", async () => {
    expect(
      await handshake({
        Host: "macbook.tail1234.ts.net",
        Origin: "https://macbook.tail1234.ts.net",
      }),
    ).toBe(200);
  });

  it("are refused from another site", async () => {
    expect(await handshake({ Origin: "https://evil.test" })).toBe(403);
  });

  it("are refused when addressed to another name", async () => {
    expect(await handshake({ Host: `evil.test:${port}` })).toBe(403);
  });
});
