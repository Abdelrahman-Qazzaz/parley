/**
 * A server the client talks to: the cloud one, which signs in with WorkOS
 * session cookies, or the local one on the user's own machine, which has no
 * sign-in. Everything the client asks of a server goes through one of these,
 * and the ways the two differ are fixed here rather than discovered.
 */
export type Server = {
  id: "cloud" | "local";
  /** Where its API answers, without a trailing slash; empty for this page's own origin. */
  baseUrl: string;
  signIn: "session" | "none";
  /**
   * How a file reaches it. "signed": the API mints a storage URL, the file
   * goes there, and the API confirms it (cloud). "direct": one multipart
   * request carries the file (local).
   */
  uploads: "signed" | "direct";
  /** The models a new chat and a new transcript start on, when offered. */
  defaultChatModelId: string;
  defaultTranscribeModelId: string;
};

/**
 * A URL the server answered with, such as an image's, usable from this page:
 * a path is the server's own, so it's resolved against the server.
 */
export function serverUrl(server: Server, url: string): string {
  return url.startsWith("/") ? `${server.baseUrl}${url}` : url;
}
