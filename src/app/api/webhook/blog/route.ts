import { NextRequest, NextResponse } from 'next/server';
import { verify } from '@/libs/verifyWebhook';
import { notion } from '@/libs/notionClient';
import { openai } from '@/libs/openaiClient';
import { chunkSmart } from '@/libs/utils/chunkBlocks';
import { sleep } from '@/libs/utils/sleep';
import { generateBlogPrompt } from '@/prompts/blog';
import { markdownToBlocks } from '@/libs/markdownToBlocks';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';

type BlogPage = PageObjectResponse & {
  properties: {
    [key: string]: {
      rich_text: Array<{ plain_text: string }>;
    };
  };
};

export async function POST(req: NextRequest) {
  try {
    const { customId } = await verify(req);

    const { results } = await notion.databases.query({
      database_id: process.env.NOTION_BLOG_DB_ID!,
      filter: { property: 'ID', number: { equals: customId } },
      page_size: 1,
    });
    if (!results.length) throw new Error('Blog not found');
    
    const page = results[0] as BlogPage;

    /** 2. 10 見出しを配列化 */
    const headings = [...Array(10)].map((_, i) =>
      page.properties[`見出し${i + 1}`].rich_text[0].plain_text,
    );

    /** 3. 各見出しをループして本文生成 */
    for (const heading of headings) {
      const prompt = generateBlogPrompt(heading);

      const ai = await openai.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0.7,
        messages: [{ role: 'user', content: prompt }],
      });

      const markdown = ai.choices[0].message.content!.trim();
      const blocks = markdownToBlocks(markdown);

      for (const slice of chunkSmart(blocks)) {
        await notion.blocks.children.append({ block_id: page.id, children: slice });
        await sleep(400);
      }

      await sleep(1000); // Rate-limit
    }

    await notion.pages.update({
      page_id: page.id,
      properties: { Status: { status: { name: 'generated' } } },
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error('/blog error', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}