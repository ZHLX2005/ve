// __tests__/github-show-print.test.ts —— 展示视图 PDF 导出 HTML 生成(纯函数)。

import { describe, it, expect } from 'vitest';
import { buildPrintHtml } from '../src/github-show/src/engine/printDoc';
import { computeStats } from '../src/github-show/src/engine/stats';
import { emptyDoc } from '@api/components/github-show/types';

function sampleDoc() {
  const doc = emptyDoc('a@b.c', 1000);
  doc.columns = [{ id: 'c1', title: '技术栈', type: 'text', createdAt: 2 }];
  doc.rows.push({
    id: 'r1',
    repoUrl: 'https://github.com/vuejs/core',
    name: 'vuejs/core',
    highlights: '响应式系统\n组合式 API',
    insights: '小而正交的 API 设计',
    demoUrl: 'https://vuejs.org/',
    values: { c1: 'TypeScript' },
    createdAt: 1,
    updatedAt: 1,
  });
  return doc;
}

describe('buildPrintHtml', () => {
  it('renders stats, rows and custom columns', () => {
    const html = buildPrintHtml({ doc: sampleDoc(), generatedAt: '2026-09-10 19:30' });
    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain('GitHub 项目展示');
    expect(html).toContain('2026-09-10 19:30');
    expect(html).toContain('vuejs/core');
    expect(html).toContain('https://github.com/vuejs/core');
    expect(html).toContain('vuejs.org');
    expect(html).toContain('技术栈');
    expect(html).toContain('TypeScript');
    expect(html).toContain('<br>'); // 多行亮点分行
    expect(html).toContain('共 1 个项目');
  });

  it('embeds chart data URL when provided', () => {
    const html = buildPrintHtml({ doc: sampleDoc(), chartDataUrl: 'data:image/png;base64,abc' });
    expect(html).toContain('<img class="chart" src="data:image/png;base64,abc"');
  });

  it('omits chart when no data URL', () => {
    const html = buildPrintHtml({ doc: sampleDoc() });
    expect(html).not.toContain('<img class="chart"');
  });

  it('escapes HTML in user content (XSS-safe)', () => {
    const doc = sampleDoc();
    doc.rows[0].insights = '<script>alert(1)</script> & "quoted"';
    doc.rows[0].name = 'a<b';
    const html = buildPrintHtml({ doc });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('a&lt;b');
  });

  it('renders empty state gracefully', () => {
    const html = buildPrintHtml({ doc: emptyDoc() });
    expect(html).toContain('暂无项目');
    expect(html).toContain('共 0 个项目');
  });
});

describe('computeStats', () => {
  it('computes totals, filled counts and content rate', () => {
    const doc = sampleDoc();
    doc.rows.push({
      id: 'r2',
      repoUrl: '',
      name: '空项目',
      highlights: '',
      insights: '',
      demoUrl: '',
      values: {},
      createdAt: 3,
      updatedAt: 3,
    });
    const stats = computeStats(doc);
    expect(stats.total).toBe(2);
    expect(stats.highlightsFilled).toBe(1);
    expect(stats.insightsFilled).toBe(1);
    expect(stats.withDemo).toBe(1);
    expect(stats.contentRate).toBe(0.5);
  });
});
