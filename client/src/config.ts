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
