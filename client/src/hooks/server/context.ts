import { createContext } from "react";
import type { Server } from "../../api/server";
import { cloudServer } from "../../config";

/** The server this part of the app talks to. */
export const ServerContext = createContext<Server>(cloudServer);
