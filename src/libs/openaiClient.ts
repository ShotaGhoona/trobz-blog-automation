import OpenAI from 'openai';

/**
 * GPT 呼び出しの薄いラッパー
 *   - モデルや温度は呼び出し側で指定
 *   - streaming や tools を使う場合も共通クライアントで対応
 */
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}); 