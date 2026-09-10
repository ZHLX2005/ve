// src/engine/stats.ts —— 展示视图统计纯函数(无 UI / 无依赖,可单测)。
//
// 给"展示视图"提供:概览指标 + 图表数据(项目介绍充实度 + 亮点填写率)。

import type { GithubShowDoc } from '@api/components/github-show/types';

export interface GithubShowStats {
  total: number;
  highlightsFilled: number;
  insightsFilled: number;
  withDemo: number;
  /** 亮点或启发至少填了一个的项目占比(0..1) */
  contentRate: number;
}

export function computeStats(doc: GithubShowDoc): GithubShowStats {
  const rows = doc.rows;
  const total = rows.length;
  let highlightsFilled = 0;
  let insightsFilled = 0;
  let withDemo = 0;
  let anyContent = 0;
  for (const r of rows) {
    const h = r.highlights.trim().length > 0;
    const i = r.insights.trim().length > 0;
    if (h) highlightsFilled += 1;
    if (i) insightsFilled += 1;
    if (r.demoUrl.trim()) withDemo += 1;
    if (h || i) anyContent += 1;
  }
  return {
    total,
    highlightsFilled,
    insightsFilled,
    withDemo,
    contentRate: total === 0 ? 0 : anyContent / total,
  };
}

export interface ContentDatum {
  name: string;
  highlightsChars: number;
  insightsChars: number;
}

/**
 * 项目介绍充实度(每个项目的亮点/启发字符数),按内容量降序取前 N。
 * 用于分组柱状图:一眼看出哪些项目介绍最完整。
 */
export function contentChartData(doc: GithubShowDoc, limit = 12): ContentDatum[] {
  return doc.rows
    .map((r) => ({
      name: r.name.trim() || deriveLabel(r.repoUrl),
      highlightsChars: r.highlights.length,
      insightsChars: r.insights.length,
    }))
    .sort((a, b) => b.highlightsChars + b.insightsChars - (a.highlightsChars + a.insightsChars))
    .slice(0, limit);
}

/** 回退标签:无项目名时用链接的 owner/repo,再退化为 "未命名项目"。 */
function deriveLabel(repoUrl: string): string {
  const m = /github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/.exec(repoUrl);
  if (m) return m[1];
  return '未命名项目';
}

export { deriveLabel };
