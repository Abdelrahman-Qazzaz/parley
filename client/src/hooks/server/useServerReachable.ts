import { useQuery } from "@tanstack/react-query";
import { apiJson } from "../../api/http";
import { useServer } from "./useServer";

/** How often an unreachable server is tried again. */
const RETRY_MS = 5_000;

/**
 * Whether the current server answers, for the local one, which only runs
 * while the user has it running. Checked again every few seconds while it
 * doesn't, so starting it is enough. The cloud is assumed up: its failures
 * surface on the requests themselves.
 */
export function useServerReachable(): boolean {
  const server = useServer();
  const health = useQuery({
    queryKey: [server.id, "health"],
    queryFn: () => apiJson<{ ok: boolean }>(server, "/health"),
    enabled: server.id === "local",
    retry: false,
    refetchInterval: (query) =>
      query.state.status === "error" ? RETRY_MS : false,
  });
  return server.id !== "local" || !health.isError;
}
