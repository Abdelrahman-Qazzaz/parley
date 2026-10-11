import type { ServerType } from "@hono/node-server";
import { Server } from "socket.io";
import type { ServerToClientEvents } from "@summarizer/contract";
import { logger } from "../../../shared/logger";
import { isAllowedHostname, isAllowedOrigin } from "../allowedHosts";

const log = logger.child({ component: "socket" });

/**
 * Uses the API's own HTTP server rather than listening on a port of its
 * own. Socket.IO claims the /socket.io/ path and the upgrade handshake; Hono
 * keeps everything else.
 *
 * One port puts the socket on the same origin as the API, so the browser
 * needs no second URL.
 *
 * CORS doesn't cover websockets, so the HTTP API's checks are repeated here:
 * a connection is addressed to this machine, and a browser's comes from a
 * page served from it. A connection with no Origin isn't a browser's.
 */
export function startSocketServer(server: ServerType) {
  // Typed by what it emits, so an event the client doesn't expect fails here.
  const io = new Server<Record<string, never>, ServerToClientEvents>(server, {
    allowRequest: ({ headers }, callback) => {
      const hostname = new URL(`http://${headers.host ?? ""}`).hostname;
      callback(
        null,
        isAllowedHostname(hostname) &&
          (headers.origin === undefined || isAllowedOrigin(headers.origin)),
      );
    },
  });
  io.on("connection", (socket) => {
    log.info("Client connected", { socketId: socket.id });
    socket.on("disconnect", (reason) => {
      log.info("Client disconnected", { socketId: socket.id, reason });
    });
  });

  return io;
}
