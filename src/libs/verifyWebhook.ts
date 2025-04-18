import { NextRequest } from 'next/server';

export async function verify(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (!secret) throw new Error('Secret missing');

  if (secret !== process.env.NOTION_WEBHOOK_SECRET) {
    throw new Error('Invalid secret');
  }

  const body = await req.json();
  const customId = body.data?.properties?.ID?.unique_id?.number;
  if (!customId) throw new Error('ID missing');

  return { customId };
}
