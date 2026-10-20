import { z } from "zod";
import { jobStatusEnum } from "../../../shared/db";

export const jobReqParamSchema = z.object({
  audioUploadId: z.string().uuid(),
});

/** Query params for the paginated history list (GET /jobs). */
export const jobsListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).optional(),
  status: z.enum(jobStatusEnum.enumValues).optional(),
  q: z.string().trim().min(1).optional(),
});

export const jobCursorSchema = z.object({
  createdAt: z.string(),
  audioUploadId: z.string(),
});
