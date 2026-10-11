import { useAuth } from "../auth/useAuth";
import { useServer } from "./useServer";

/**
 * Whether this part of the app may ask its server for anything yet: the cloud
 * once the user has signed in, the local server straight away.
 */
export function useServerReady(): boolean {
  const server = useServer();
  const { user } = useAuth();
  return server.signIn === "none" || !!user;
}
