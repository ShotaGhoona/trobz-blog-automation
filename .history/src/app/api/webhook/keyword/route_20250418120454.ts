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
    const prompt = `あなたはJSON生成マシンです。
以下の仕様の JSON **のみ** を返してください。前後に文字や \`\`\` は付けないでください。

仕様:
{
  "blogs":[
    { "title":"...", "items":["...","..."] },
    ...
  ]
}

キーワード: 「${keyword}」
10セット生成してください。`;

    const ai = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
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
      await notion.pages.create({
        parent: { database_id: process.env.NOTION_BLOG_DB_ID! },
        properties: {
          Title: { title: [{ text: { content: blog.title } }] },
          ID: { number: Date.now() + i }, // 任意採番
          キーワード: {
            relation: [{ id: keywordPage.id }],
          },
          ...blog.items.reduce((acc, v, idx) => {
            acc[`見出し${idx + 1}`] = { rich_text: [{ text: { content: v } }] };
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