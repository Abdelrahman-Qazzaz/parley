import { useContext } from "react";
import { ServerContext } from "./context";

export function useServer() {
  return useContext(ServerContext);
}
