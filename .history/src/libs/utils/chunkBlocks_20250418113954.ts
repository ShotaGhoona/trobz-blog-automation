/**
 * 配列を指定サイズのチャンクに分割
 * @param arr 分割対象の配列
 * @param size チャンクサイズ（デフォルト: 20）
 * @returns 分割された配列の配列
 */
export const chunk = <T>(arr: T[], size = 20): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}; 