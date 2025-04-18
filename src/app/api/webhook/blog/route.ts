export const runtime = 'nodejs';
export const maxDuration = 300; // 5分のタイムアウト設定

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
      type: 'title';
      title: Array<{ plain_text: string }>;
    };
    キーワード: {
      type: 'relation';
      relation: Array<{ id: string }>;
    };
    [key: string]: {
      type: string;
      rich_text?: Array<{ plain_text: string }>;
      [key: string]: any;
    };
  };
};

export async function POST(req: NextRequest) {
  try {
    const { customId } = await verify(req);

    const { results } = await notion.databases.query({
      database_id: process.env.NOTION_BLOG_DB_ID!,
      filter: {
        property: 'ID',
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

    // 各見出しごとに本文を生成して追加
    for (let i = 1; i <= 10; i++) {
      const headingKey = `見出し${i}`;
      const heading = blogPage.properties[headingKey];
      if (!heading?.rich_text?.[0]) continue;

      const headingText = heading.rich_text[0].plain_text;
      const prompt = generateBlogPrompt(`${title} - ${headingText} - ${keywords.join(', ')}`);

      const ai = await openai.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0.7,
        messages: [{ role: 'user', content: prompt }],
      });

      let raw = ai.choices[0].message.content!.trim();
      if (raw.startsWith('```')) {
        raw = raw.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();
      }

      const blocks = markdownToBlocks(raw);
      
      // ブロックを分割して追加
      for (const slice of chunkSmart(blocks)) {
        await notion.blocks.children.append({
          block_id: blogPage.id,
          children: slice,
        });
        await sleep(2000);
      }

      // 各見出しの生成後に少し待機
      await sleep(2000);
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error('/blog error', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}