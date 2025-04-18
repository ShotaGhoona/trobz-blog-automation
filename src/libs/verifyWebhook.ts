import { NextRequest } from 'next/server';

const WEBHOOK_SECRET = '791a9a8a9736431a9a144b94b9d177fe18fdd50af25faa33e6f320efc9de9afd';

export async function verify(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  console.log('Received secret:', secret);
  console.log('Expected secret:', WEBHOOK_SECRET);

  if (!secret) throw new Error('Secret missing');

  if (secret !== WEBHOOK_SECRET) {
    console.error('Secret mismatch');
    throw new Error('Invalid secret');
  }

  const body = await req.json();
  console.log('Received body:', JSON.stringify(body, null, 2));

  const customId = body.data?.properties?.ID?.unique_id?.number;
  if (!customId) {
    console.error('ID not found in body');
    throw new Error('ID missing');
  }

  console.log('Extracted customId:', customId);
  return { customId };
}
