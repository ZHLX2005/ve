// src/utils/tags.ts —— multi-select 列值的序列化 / 解析纯函数。
//
// 多选列的行值存为字符串(values[colId]),格式 = JSON.stringify(string[])。
// 解析失败(旧数据手填 / 单值文本)按逗号分隔兜底,保证展示不崩。

/** 解析多选值:JSON 数组优先,逗号分隔兜底,过滤空项。 */
export function parseTags(raw: string | undefined): string[] {
  const value = (raw ?? '').trim();
  if (!value) return [];

  // JSON 数组
  if (value.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((x): x is string => typeof x === 'string')
          .map((x) => x.trim())
          .filter((x) => x.length > 0);
      }
    } catch {
      /* 落兜底 */
    }
  }

  // 逗号 / 中文逗号分隔兜底
  return value
    .split(/[,，]/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

/** 序列化多选值:去重、过滤空项后存 JSON 数组字符串。 */
export function serializeTags(tags: string[]): string {
  const seen = new Set<string>();
  const cleaned = tags
    .map((t) => t.trim())
    .filter((t) => {
      if (!t || seen.has(t)) return false;
      seen.add(t);
      return true;
    });
  return cleaned.length === 0 ? '' : JSON.stringify(cleaned);
}
