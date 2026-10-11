import type { Server } from "./api/server";

/** Dev host — keep API + WebSocket on the same hostname so session cookies are sent. */
const DEV_HOST = "localhost";

/**
 * The hosted server. Its session cookies are set on this host. A production
 * build is served by the cloud API itself, so by default it calls its own
 * origin: the empty string. In development Vite serves the client, and the
 * API is on its own port.
 */
export const cloudServer: Server = {
  id: "cloud",
  baseUrl: (
    import.meta.env.VITE_API_URL ??
    (import.meta.env.DEV ? `http://${DEV_HOST}:3001` : "")
  ).replace(/\/$/, ""),
  signIn: "session",
  uploads: "signed",
  defaultChatModelId: "openai/gpt-4o-mini",
  defaultTranscribeModelId: "nova-3-general",
};

const LOCAL_PORT = "3002";

/**
 * Whether the local server itself served this page, as it does for someone
 * using only this computer. Its API is then this page's own origin, and the
 * cloud isn't reachable from here.
 */
export const servedByLocalServer =
  ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname) &&
  window.location.port === LOCAL_PORT;

/** The server on the user's own machine, which chats through their Claude Code. */
export const localServer: Server = {
  id: "local",
  baseUrl: servedByLocalServer
    ? ""
    : (
        import.meta.env.VITE_LOCAL_API_URL ?? `http://${DEV_HOST}:${LOCAL_PORT}`
      ).replace(/\/$/, ""),
  signIn: "none",
  uploads: "direct",
  defaultChatModelId: "sonnet",
  defaultTranscribeModelId: "small",
};

export function authLoginUrl(): string {
  return `${cloudServer.baseUrl}/auth/login`;
}

export function authMeEndpoint(): string {
  return `${cloudServer.baseUrl}/auth/me`;
}

export function authRefreshEndpoint(): string {
  return `${cloudServer.baseUrl}/auth/refresh`;
}

export function authLogoutEndpoint(): string {
  return `${cloudServer.baseUrl}/auth/logout`;
}
