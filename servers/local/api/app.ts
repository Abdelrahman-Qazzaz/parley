import { existsSync } from "node:fs";
import path from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { compress } from "hono/compress";
import { cors } from "hono/cors";
import { csrf } from "hono/csrf";
import { getApiEnv } from "../shared/env";
import { jobsRouter } from "./src/routes/jobs.router";
import { uploadRouter } from "./src/routes/upload.router";
import { modelsRouter } from "./src/routes/models.router";
import { conversationsRouter } from "./src/routes/conversations.router";
import { isAllowedHostname, isAllowedOrigin } from "./src/allowedHosts";

import { verifyApiServices } from "./startup";

export async function createApp() {
  const env = getApiEnv();
  const app = new Hono();
  // A site can reach the API through DNS rebinding: its own name, pointed at
  // 127.0.0.1. The request still carries that name as its Host, so anything
  // not addressed to this machine is refused.
  app.use("*", async (c, next) => {
    if (!isAllowedHostname(new URL(c.req.url).hostname)) {
      return c.json({ message: "Forbidden" }, 403);
    }
    await next();
  });
  // Chrome asks before a public page reaches this machine, with a preflight
  // that must say so explicitly; the user then allows it once. Ahead of
  // cors(), which answers the preflight itself.
  app.use("*", async (c, next) => {
    await next();
    if (
      c.req.method === "OPTIONS" &&
      c.req.header("Access-Control-Request-Private-Network") === "true" &&
      isAllowedOrigin(c.req.header("Origin"))
    ) {
      c.res.headers.set("Access-Control-Allow-Private-Network", "true");
    }
  });
  // A page from another origin may call the API only if it's one the app
  // trusts: this machine's (Vite in development) or the hosted client's, in
  // ALLOWED_ORIGINS. Any other site's JSON or DELETE is refused at the
  // preflight. There are no cookies, so nothing is sent with credentials.
  app.use(
    "*",
    cors({ origin: (origin) => (isAllowedOrigin(origin) ? origin : null) }),
  );
  // A form post goes without a preflight, so any site open in the browser
  // could forge an upload: those are refused unless they come from a page
  // the app trusts.
  app.use("*", csrf({ origin: isAllowedOrigin }));
  // The chat model catalog is ~50KB of JSON and every client downloads it;
  // gzip takes that to ~7KB. Streamed chat replies are left alone: hono skips
  // text/event-stream by content type, and streamSSE sets Transfer-Encoding,
  // which this middleware also treats as already-encoded. Both guarantees are
  // covered by tests, because buffering the reply stream would be invisible
  // here and obvious to every user.
  app.use("*", compress());

  await verifyApiServices();

  app.get("/health", (c) => c.json({ ok: true }));
  app.route("/upload", uploadRouter);
  app.route("/jobs", jobsRouter);
  app.route("/models", modelsRouter);
  app.route("/conversations", conversationsRouter);

  // The built client, on the API's own origin. Under `npm run dev` it isn't
  // built and Vite serves it instead, proxying the API's paths here.
  const clientDir = path.resolve(env.CLIENT_DIR);
  if (existsSync(path.join(clientDir, "index.html"))) {
    app.use("*", serveStatic({ root: clientDir }));
    // The client's own routes are pages rather than files. Only those: any
    // other path is the API's, and one it doesn't have is a 404.
    const page = serveStatic({ root: clientDir, path: "index.html" });
    app.get("/", page);
    app.get("/chat", page);
    app.get("/chat/*", page);
    // This computer's section, which is the only one a page served from here
    // can use.
    app.get("/local", page);
    app.get("/local/*", page);
  }
  return app;
}
