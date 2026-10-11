import { useQuery } from "@tanstack/react-query";
import { fetchMessages } from "../../api/messages";
import { queryKeys } from "../../lib/queryClient";
import { useServer } from "../server/useServer";

export function useMessagesQuery(conversationId: string | undefined) {
  const server = useServer();
  return useQuery({
    queryKey: queryKeys.messages(server.id, conversationId ?? ""),
    queryFn: () => fetchMessages(server, conversationId as string),
    enabled: !!conversationId,
  });
}
