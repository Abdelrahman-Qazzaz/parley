import { useQuery } from "@tanstack/react-query";
import { apiJson } from "../../api/http";
import { queryKeys } from "../../lib/queryClient";
import { useServer } from "./useServer";

/** How often an unreachable server is tried again. */
const RETRY_MS = 5_000;

/**
 * Whether the current server answers, for one that isn't always on. Checked
 * again every few seconds while it doesn't, so starting it is enough.
 */
export function useServerReachable(): boolean {
  const server = useServer();
  const health = useQuery({
    queryKey: queryKeys.health(server.id),
    queryFn: () => apiJson<{ ok: boolean }>(server, "/health"),
    enabled: !server.alwaysOn,
    retry: false,
    refetchInterval: (query) =>
      query.state.status === "error" ? RETRY_MS : false,
  });
  return server.alwaysOn || !health.isError;
}
