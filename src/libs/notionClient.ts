import { Client } from '@notionhq/client';

/**
 * 単一インスタンスで全 API ルートから共有
 *   - auth は環境変数 NOTION_TOKEN を利用
 *   - fetch オプションを上書きしたい場合は { fetch: customFetch } を追加
 */
export const notion = new Client({
  auth: process.env.NOTION_TOKEN,
}); 