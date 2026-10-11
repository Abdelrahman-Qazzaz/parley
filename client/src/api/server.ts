/**
 * A server the client talks to: the cloud one, which signs in with WorkOS
 * session cookies, or the local one on the user's own machine, which has no
 * sign-in. Everything the client asks of a server goes through one of these.
 */
export type Server = {
  id: "cloud" | "local";
  /** Where its API answers, without a trailing slash. */
  baseUrl: string;
  signIn: "session" | "none";
};
