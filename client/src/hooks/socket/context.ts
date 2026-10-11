import { createContext } from "react";
import type { Socket } from "socket.io-client";
import type { ServerToClientEvents } from "@summarizer/contract";

/** The socket, typed by what the servers emit; the client emits nothing. */
export type AppSocket = Socket<ServerToClientEvents, Record<string, never>>;

export const SocketContext = createContext<AppSocket | null>(null);
