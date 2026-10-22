import { z } from "zod";
// Shared with the audio confirm, so both reject a bad id or name alike.
import { fileNameField, uploadIdField } from "./upload.schema";

/**
 * POST /upload/image/confirm — the image is in the bucket; record it. Size and
 * type are not in the body: the controller reads both back from storage.
 */
export const imageConfirmSchema = z.object({
  uploadId: uploadIdField,
  fileName: fileNameField,
});

/** Identifies an uploaded image for read or deletion. */
export const imageReqParamSchema = z.object({
  imageUploadId: z.string().uuid(),
});
