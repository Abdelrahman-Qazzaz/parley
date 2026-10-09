import { bodyLimit } from "hono/body-limit";

/**
 * Room for the multipart framing and the form's other fields on top of the
 * file itself. The schemas hold the file to its exact limit; this only stops
 * a far bigger body from being read at all.
 */
const FORM_OVERHEAD_BYTES = 64 * 1024;

/**
 * Turns away an upload form too big to hold a file of at most `maxFileBytes`,
 * before reading it, with the message the schema gives a large file.
 */
export function uploadLimit(maxFileBytes: number, message: string) {
  return bodyLimit({
    maxSize: maxFileBytes + FORM_OVERHEAD_BYTES,
    onError: (c) => c.json({ message }, 413),
  });
}
