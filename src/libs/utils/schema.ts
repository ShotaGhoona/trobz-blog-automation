import { z } from 'zod';

/**
 * Webhookリクエストのバリデーションスキーマ
 */
export const keywordHook = z.object({
  recordId: z.string(),
  customId: z.number(),
  secret: z.string(),
});

export const blogHook = z.object({
  recordId: z.string(),
  customId: z.number(),
  secret: z.string(),
}); 