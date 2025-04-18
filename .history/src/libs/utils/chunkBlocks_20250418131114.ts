import { BlockObjectRequest } from '@notionhq/client/build/src/api-endpoints';

/**
 * Notion の children 制限 (20) に合わせつつ、
 * - 同種リスト(bulleted_list_item / numbered_list_item)は 1 かたまりで分割しない
 * - それでも上限を超える場合は 20 件毎で切る
 */
export const chunkSmart = (
  blocks: BlockObjectRequest[],
  limit = 20,
): BlockObjectRequest[][] => {
  const out: BlockObjectRequest[][] = [];
  let curr: BlockObjectRequest[] = [];

  const flush = () => {
    if (curr.length) out.push(curr);
    curr = [];
  };

  for (const b of blocks) {
    const prev = curr.at(-1);
    const sameList =
      prev?.type?.includes('_list_item') && b.type === prev.type;

    // 上限超過かつ「リスト継続ではない」タイミングで flush
    if (!sameList && curr.length >= limit) flush();

    // 「リスト継続」かつ上限超過 → すでにリスト中なのでそのまま追加
    curr.push(b);
  }

  flush();
  return out;
};
