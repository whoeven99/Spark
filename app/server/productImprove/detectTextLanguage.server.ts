/**
 * 基于字符特征的简单语言检测
 * 返回语言名称（中文显示）
 */
export function detectTextLanguage(text: string): string {
  if (!text?.trim()) return "英语";

  const sample = text.slice(0, 500);

  // 统计不同字符集的数量
  const cjkChars = (sample.match(/[\u4e00-\u9fff]/g) || []).length;
  const hiragana = (sample.match(/[\u3040-\u309f]/g) || []).length;
  const katakana = (sample.match(/[\u30a0-\u30ff]/g) || []).length;
  const hangul = (sample.match(/[\uac00-\ud7af]/g) || []).length;
  const cyrillic = (sample.match(/[\u0400-\u04ff]/g) || []).length;
  const arabic = (sample.match(/[\u0600-\u06ff]/g) || []).length;
  const thai = (sample.match(/[\u0e00-\u0e7f]/g) || []).length;

  const japaneseKana = hiragana + katakana;
  const totalChars = sample.replace(/\s/g, "").length;

  if (totalChars === 0) return "英语";

  // 日文：有假名或 CJK + 假名混合
  if (japaneseKana > 3 || (cjkChars > 0 && japaneseKana > 0)) return "日语";
  // 韩文
  if (hangul > totalChars * 0.1) return "韩语";
  // 中文：有 CJK 字符但无假名
  if (cjkChars > totalChars * 0.1) return "中文";
  // 俄语
  if (cyrillic > totalChars * 0.3) return "俄语";
  // 阿拉伯语
  if (arabic > totalChars * 0.3) return "阿拉伯语";
  // 泰语
  if (thai > totalChars * 0.3) return "泰语";

  // 默认英语
  return "英语";
}
