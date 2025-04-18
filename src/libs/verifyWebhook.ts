import type { NextRequest } from 'next/server';

export const verify = async (req: NextRequest) => {
  const body = await req.json().catch(() => ({}));

  // secret は URL クエリに載せる
  if (req.nextUrl.searchParams.get('secret') !== process.env.WEBHOOK_SECRET) {
    throw new Error('Invalid secret');
  }

  // Notion 自動化は { "ID": { "number": 2 } } か { "№ ID": 2 } など
  const idField = body.ID ?? body['ID'];
  const customId: number =
    typeof idField === 'object' ? idField.number : idField;

  if (typeof customId !== 'number') throw new Error('ID missing');

  return { customId };
};


export const verifyBody = (body: any, req: NextRequest) => {
  /* secret は URL クエリでチェック */
  if (req.nextUrl.searchParams.get('secret') !== process.env.WEBHOOK_SECRET)
    throw new Error('Invalid secret');

  // Notion Automation は { "<列名>": { "number": 3 } } で来る
  const raw = body.ID ?? body['№ ID'];          // 列名どちらでも OK
  const customId =
    typeof raw === 'object' ? raw.number : raw; // ラップ解除

  if (typeof customId !== 'number') throw new Error('ID missing');

  return { customId };
};
