/**
 * Browsers always send Origin on unsafe methods, and csrf() in app.ts rejects
 * form-style requests that arrive without one, or from another site. This is
 * the Vite dev client's. Tests have to model that, or
 * every POST and DELETE comes back 403 for reasons unrelated to what they
 * are asserting.
 */
export function originHeaders(): Record<string, string> {
  return { Origin: "http://localhost:5173" };
}
