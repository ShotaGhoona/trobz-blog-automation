import { NextRequest, NextResponse } from 'next/server';
import { verify } from '@/libs/verifyWebhook';
import { notion } from '@/libs/notionClient';
import { openai } from '@/libs/openaiClient';
import { generateBlogPrompt } from '@/prompts/blog';
import { markdownToBlocks } from '@/libs/markdownToBlocks';
import { chunkSmart } from '@/libs/utils/chunkBlocks';
import { sleep } from '@/libs/utils/sleep';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';

type BlogPage = PageObjectResponse & {
  properties: {
    Title: {
      title: Array<{ plain_text: string }>;
    };
    キーワード: {
      relation: Array<{ id: string }>;
    };
  };
};

export async function POST(req: NextRequest) {
  try {
    const { customId } = await verify(req);

    const { results } = await notion.databases.query({
      database_id: process.env.NOTION_BLOG_DB_ID!,
      filter: {
        property: '№ ID',
        number: { equals: customId },
      },
      page_size: 1,
    });
    if (!results.length) throw new Error('Blog not found');
    
    const blogPage = results[0] as BlogPage;
    const title = blogPage.properties.Title.title[0].plain_text;

    // キーワードを取得
    const keywordIds = blogPage.properties.キーワード.relation.map(r => r.id);
    const keywordPages = await Promise.all(
      keywordIds.map(id => notion.pages.retrieve({ page_id: id }))
    );
    const keywords = keywordPages.map(
      page => (page as BlogPage).properties.Title.title[0].plain_text
    );

    /** 3. GPT-4-turbo で "ブログ本文" を生成 */
    const prompt = generateBlogPrompt(`${title} - ${keywords.join(', ')}`);

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

    /** 4. Notion ページにブログ本文を追加 */
    const blocks = markdownToBlocks(raw);
    for (const slice of chunkSmart(blocks)) {
      await notion.blocks.children.append({
        block_id: blogPage.id,
        children: slice,
      });
      await sleep(400); // appendごとに短い待機
    }

    /** 5. OK */
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error('/blog error', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}