/**
 * 指定時間待機
 * @param ms 待機時間（ミリ秒）
 * @returns Promise
 */
export const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
}; 