import { BlockObjectRequest } from '@notionhq/client/build/src/api-endpoints';

type RichTextItemRequest = {
  type: 'text';
  text: { content: string };
  annotations?: { bold?: boolean };
};

export const markdownToBlocks = (md: string): BlockObjectRequest[] => {
  const blocks: BlockObjectRequest[] = [];
  const bold = /\*\*(.*?)\*\*/g;
  const numberedList = /^`(\d+)\.`\s/;
  const bulletedList = /^- /;

  const toRich = (text: string): RichTextItemRequest[] => {
    const parts = text.split(bold);
    return parts.map((p, i) => ({
      type: 'text' as const,
      text: { content: p },
      annotations: { bold: i % 2 === 1 },
    }));
  };

  md.split('\n').forEach(line => {
    const l = line.trimEnd();
    let block: BlockObjectRequest;

    if (!l) return;

    if (l === '---') {
      block = { object: 'block', type: 'divider', divider: {} };
    } else if (l.startsWith('### ')) {
      block = { object: 'block', type: 'heading_3', heading_3: { rich_text: toRich(l.slice(4)) } };
    } else if (l.startsWith('## ')) {
      block = { object: 'block', type: 'heading_2', heading_2: { rich_text: toRich(l.slice(3)) } };
    } else if (l.startsWith('# ')) {
      block = { object: 'block', type: 'heading_1', heading_1: { rich_text: toRich(l.slice(2)) } };
    } else if (numberedList.test(l)) {
      const match = l.match(numberedList);
      if (match) {
        block = {
          object: 'block',
          type: 'numbered_list_item',
          numbered_list_item: { rich_text: toRich(l.slice(match[0].length)) }
        };
      } else {
        block = { object: 'block', type: 'paragraph', paragraph: { rich_text: toRich(l) } };
      }
    } else if (bulletedList.test(l)) {
      block = { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: toRich(l.slice(2)) } };
    } else {
      block = { object: 'block', type: 'paragraph', paragraph: { rich_text: toRich(l) } };
    }

    blocks.push(block);
  });

  return blocks;
}; 