export const generateKeywordPrompt = (keyword: string) => `
あなたはJSON生成マシンです。
以下の仕様の JSON **のみ** を返してください。前後に文字や \`\`\` は付けないでください。

仕様:
{
  "blogs":[
    { "title":"...", "items":["...","..."] },
    ...
  ]
}

キーワード: 「${keyword}」
10セット生成してください。
`; 