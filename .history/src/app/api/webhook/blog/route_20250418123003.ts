import { NextRequest, NextResponse } from 'next/server';
import { verify } from '@/libs/verifyWebhook';
import { notion } from '@/libs/notionClient';
import { openai } from '@/libs/openaiClient';
import { chunk } from '@/libs/utils/chunkBlocks';
import { sleep } from '@/libs/utils/sleep';
import { BlockObjectRequest } from '@notionhq/client/build/src/api-endpoints';
import { generateBlogPrompt } from '@/prompts/blog';

export async function POST(req: NextRequest) {
  try {
    const { customId } = await verify(req, 'blog');

    /** 1. 対象ブログページ取得 */
    const { results } = await notion.databases.query({
      database_id: process.env.NOTION_BLOG_DB_ID!,
      filter: { property: 'ID', number: { equals: customId } },
      page_size: 1,
    });
    if (!results.length) throw new Error('Blog not found');
    const page = results[0] as any;

    /** 2. 10 見出しを配列化 */
    const headings = [...Array(10)].map((_, i) =>
      page.properties[`H${i + 1}`].rich_text[0].plain_text,
    );

    /** 3. 各見出しをループして本文生成 */
    for (const heading of headings) {
      const prompt = generateBlogPrompt(heading);

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

      const content = JSON.parse(raw).content;

      /** 4. Notion へ 20ブロックごとに PATCH */
      const blocks: BlockObjectRequest[] = content.split('\n').map((t: string) => ({
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: [{ type: 'text', text: { content: t } }] },
      }));

      for (const slice of chunk(blocks, 20)) {
        await notion.blocks.children.append({
          block_id: page.id,
          children: slice,
        });
      }

      await sleep(1000); // Rate-limit
    }

    await notion.pages.update({
      page_id: page.id,
      properties: { Status: { select: { name: 'generated' } } },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('/blog error', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
} 