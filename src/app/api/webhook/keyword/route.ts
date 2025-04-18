export const runtime = 'nodejs';
export const maxDuration = 300; // 5分のタイムアウト設定

import { NextRequest, NextResponse } from 'next/server';
// import { verify } from '@/libs/verifyWebhook';
import { notion } from '@/libs/notionClient';
import { openai } from '@/libs/openaiClient';
import { generateKeywordPrompt } from '@/prompts/keyword';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import { verifyBody } from '@/libs/verifyWebhook'; 

type KeywordPage = PageObjectResponse & {
  properties: {
    Title: {
      title: Array<{ plain_text: string }>;
    };
  };
};

type BlogProperties = {
  Title: { title: Array<{ text: { content: string } }> };
  ID: { number: number };
  キーワード: { relation: Array<{ id: string }> };
} & {
  [K in `見出し${number}`]: { rich_text: Array<{ text: { content: string } }> };
};

export async function POST(req: NextRequest) {
  /* ★ 追加：リクエスト内容をそのまま見る */
  const raw = await req.text();                        // ← 文字列で受け取る
  console.log('🛬 Notion Webhook RAW ↓\n', raw);       // Vercel Logs に出力
  const body = raw ? JSON.parse(raw) : {};             // JSON 化

  try {
    /* verifyBody が { customId } を返すようにしておく */
    const { customId } = verifyBody(body, req);

    /* ↓ 以降は従来コードのまま */
    const { results } = await notion.databases.query({
      database_id: process.env.NOTION_KEYWORD_DB_ID!,
      filter: { property: 'ID', number: { equals: customId } },
      page_size: 1,
    });
    if (!results.length) throw new Error('Keyword not found');
    
    const keywordPage = results[0] as KeywordPage;
    const keyword = keywordPage.properties.Title.title[0].plain_text;

    /** 3. GPT-4-turbo で "タイトル＋目次×10" を生成 */
    const prompt = generateKeywordPrompt(keyword);

    const ai = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }],
    });

    let raw = ai.choices[0].message.content!.trim();

    // 先頭・末尾の ``` を取り除く
    if (raw.startsWith('```')) {
      raw = raw.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();
    }

    const blogs = JSON.parse(raw).blogs as { title: string; items: string[] }[];

    /** 4. Blogs DB に 10 レコード create */
    for (const [i, blog] of blogs.entries()) {
      const properties: BlogProperties = {
        Title: { title: [{ text: { content: blog.title } }] },
        ID: { number: Date.now() + i },
        キーワード: {
          relation: [{ id: keywordPage.id }],
        },
      } as BlogProperties;

      blog.items.forEach((v, idx) => {
        properties[`見出し${idx + 1}`] = { rich_text: [{ text: { content: v } }] };
      });

      await notion.pages.create({
        parent: { database_id: process.env.NOTION_BLOG_DB_ID! },
        properties,
      });
    }

    /** 5. OK */
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error('/keyword error', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}