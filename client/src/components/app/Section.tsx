import type { Server } from "../../api/server";
import { ServerContext } from "../../hooks/server/context";
import { SocketProvider } from "../../hooks/socket/SocketProvider";
import { AppShell } from "./AppShell";

/**
 * One server's part of the app: the cloud's or this computer's. Everything
 * inside asks that server, over its own socket, and keeps its own drafts, so
 * the two sections never share a conversation or a source.
 */
export function Section({ server }: { server: Server }) {
  return (
    <ServerContext.Provider value={server}>
      <SocketProvider key={server.id}>
        <AppShell />
      </SocketProvider>
    </ServerContext.Provider>
  );
}
