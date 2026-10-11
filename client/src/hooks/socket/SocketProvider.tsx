import { useEffect, useState, type ReactNode } from "react";
import { io } from "socket.io-client";
import { refreshSession } from "../../api/session";
import { useServer } from "../server/useServer";
import { SocketContext, type AppSocket } from "./context";

export function SocketProvider({ children }: { children: ReactNode }) {
  const server = useServer();
  // Create the socket once via a lazy state initializer; only tear it down on
  // unmount. Socket.IO lives on the server's own origin, attached to its HTTP
  // server, so there is no second URL to configure.
  const [socket] = useState<AppSocket>(() =>
    // Socket.IO reads an empty string as a host; undefined means this page's.
    io(server.baseUrl || undefined, {
      transports: ["websocket"],
      autoConnect: true,
      withCredentials: true,
    }),
  );

  useEffect(() => {
    // Reconnect on (re)mount — covers StrictMode's mount→unmount→remount in dev.
    socket.connect();
    return () => {
      socket.disconnect();
    };
  }, [socket]);

  // The handshake is authenticated by the session cookie, whose access token
  // may have expired by the time the socket reconnects. Socket.IO doesn't
  // retry a handshake the server refused, so this refreshes and reconnects.
  // It does so once until the socket next connects, so a session the server
  // keeps refusing can't loop.
  useEffect(() => {
    let retried = false;
    const onConnect = () => {
      retried = false;
    };
    const onConnectError = (error: Error) => {
      // Still active means a network failure Socket.IO retries by itself.
      if (socket.active || error.message !== "Unauthorized" || retried) return;
      retried = true;
      refreshSession()
        .then((session) => {
          if (session) socket.connect();
        })
        .catch(() => undefined);
    };
    socket.on("connect", onConnect);
    socket.on("connect_error", onConnectError);
    return () => {
      socket.off("connect", onConnect);
      socket.off("connect_error", onConnectError);
    };
  }, [server, socket]);

  return (
    <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
  );
}
