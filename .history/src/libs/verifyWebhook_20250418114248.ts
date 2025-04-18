import type { NextRequest } from 'next/server';
import { keywordHook, blogHook } from './utils/schema';

export const verify = async (
  req: NextRequest,
  type: 'keyword' | 'blog',
) => {
  const body = await req.json();
  const schema = type === 'keyword' ? keywordHook : blogHook;

  // シグネチャ共通チェック
  if (body.secret !== process.env.WEBHOOK_SECRET) {
    throw new Error('Invalid secret');
  }

  // zod バリデーション
  const parsed = schema.parse(body);
  return parsed; // { recordId, customId, secret }
}; 