import { NextRequest, NextResponse } from 'next/server';
import { verify } from '@/libs/verifyWebhook';
import { notion } from '@/libs/notionClient';
import { openai } from '@/libs/openaiClient';
import { chunk } from '@/libs/utils/chunkBlocks';

export async function POST(req: NextRequest) {
  try {
    /** 1. Webhook 署名＋zod で検証 */
    const { customId } = await verify(req, 'keyword');

    /** 2. customId で Keywords DB を検索 */
    const { results } = await notion.databases.query({
      database_id: process.env.NOTION_KEYWORD_DB_ID!,
      filter: {
        property: 'ID',
        number: { equals: customId },
      },
      page_size: 1,
    });
    if (!results.length) throw new Error('Keyword not found');
    const keywordPage = results[0] as any;
    const keyword = keywordPage.properties.Title.title[0].plain_text;

    /** 3. GPT-4-turbo で "タイトル＋目次×10" を生成 */
    const prompt = `「${keyword}」のキーワードで、SEOに最適化されたブログタイトルと目次を10個生成してください。
以下のJSON形式で出力してください：
{
  "blogs": [
    {
      "title": "タイトル",
      "items": ["見出し1", "見出し2", ..., "見出し10"]
    }
  ]
}`;

    const ai = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }],
    });

    const blogs = JSON.parse(ai.choices[0].message.content!).blogs as {
      title: string;
      items: string[];
    }[];

    /** 4. Blogs DB に 10 レコード create */
    for (const [i, blog] of blogs.entries()) {
      await notion.pages.create({
        parent: { database_id: process.env.NOTION_BLOG_DB_ID! },
        properties: {
          Title: { title: [{ text: { content: blog.title } }] },
          ID: { number: Date.now() + i }, // 任意採番
          キーワード: {
            relation: [{ id: keywordPage.id }],
          },
          ...blog.items.reduce((acc, v, idx) => {
            acc[`H${idx + 1}`] = { rich_text: [{ text: { content: v } }] };
            return acc;
          }, {} as Record<string, any>),
        },
      });
    }

    /** 5. OK */
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('/keyword error', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
} 