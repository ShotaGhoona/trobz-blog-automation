import type { NextRequest } from 'next/server';

export const verify = async (
  req: NextRequest,
) => {
  const body = await req.json().catch(() => ({}));
  const headerSecret = req.headers.get('x-secret');
  if (headerSecret !== process.env.WEBHOOK_SECRET) {
    throw new Error('Invalid secret');
  }

  const customId = body.ID;
  if (typeof customId !== 'number') {
    throw new Error('ID not found in payload');
  }

  // recordId は DB クエリで取得するので返さない
  return { customId };
}; 