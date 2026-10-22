/**
 * Object storage. `bucket` changes what's stored; `sign` only mints read URLs,
 * which is why it's the one a data module may use.
 */
export { bucket } from "./bucket";
export { sign } from "./sign";
export {
  AUDIO_BUCKET,
  BUCKET_SETTINGS,
  IMAGE_URL_TTL_SECONDS,
  MAX_AUDIO_BYTES,
  matchesBucketSettings,
} from "./schema";
export type { StoredObject, UploadableObject } from "./schema";
