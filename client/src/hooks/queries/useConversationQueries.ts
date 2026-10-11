import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteConversation,
  fetchConversations,
  renameConversation,
  type Conversation,
} from "../../api/conversations";
import { errorMessage } from "../../api/http";
import { queryKeys } from "../../lib/queryClient";
import { useServer } from "../server/useServer";
import { useToast } from "../toast/useToast";

export function useConversationsQuery(enabled: boolean) {
  const server = useServer();
  return useQuery({
    queryKey: queryKeys.conversations(server.id),
    queryFn: () => fetchConversations(server),
    enabled,
  });
}

export function useRenameConversationMutation() {
  const server = useServer();
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({
      conversationId,
      title,
    }: {
      conversationId: string;
      title: string;
    }) => renameConversation(server, conversationId, title),
    onSuccess: (updated) => {
      queryClient.setQueryData<Conversation[]>(
        queryKeys.conversations(server.id),
        (current) =>
          current?.map((conversation) =>
            conversation.id === updated.id ? updated : conversation,
          ),
      );
    },
    onError: (error) => {
      toast.show({
        kind: "error",
        message: errorMessage(error, "Couldn't rename that chat."),
      });
    },
  });
}

export function useDeleteConversationMutation() {
  const server = useServer();
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ conversationId }: { conversationId: string }) =>
      deleteConversation(server, conversationId),
    onSuccess: (_result, { conversationId }) => {
      queryClient.setQueryData<Conversation[]>(
        queryKeys.conversations(server.id),
        (current) =>
          current?.filter((conversation) => conversation.id !== conversationId),
      );
      queryClient.removeQueries({
        queryKey: queryKeys.messages(server.id, conversationId),
      });
    },
    onError: (error) => {
      toast.show({
        kind: "error",
        message: errorMessage(error, "Couldn't delete that chat."),
      });
    },
  });
}
