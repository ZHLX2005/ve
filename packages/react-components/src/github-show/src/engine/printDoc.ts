// src/engine/printDoc.ts —— 展示视图导出 PDF 的内容生成(纯函数,可单测)。
//
// buildPrintParts 输出拆分的 CSS + body,供两类消费:
//   - buildPrintHtml:组装自包含 HTML 走浏览器打印(降级路径)
//   - exportPdf:渲染到屏幕外容器,html2canvas 截图 + jsPDF 分页直接下载
// 不依赖组件 DOM / ShadowRoot —— 样式与组件完全隔离,输出稳定。

import type { GithubShowDoc } from '@api/components/github-show/types';
import { computeStats } from './stats';
import { splitTextWithLinks, toHref } from '../utils/repo';
import { parseTags } from '../utils/tags';

export interface PrintDocOptions {
  doc: GithubShowDoc;
  /** ECharts 导出的 dataURL(png),可为 null(无图) */
  chartDataUrl?: string | null;
  /** 生成时间文案,如 '2026-09-10 19:30' */
  generatedAt?: string;
  /** 文档标题 */
  title?: string;
}

/** 拆分产物:bodyHtml 为 <body> 内片段(含 <style> 由 cssText 提供)。 */
export interface PrintDocParts {
  title: string;
  cssText: string;
  bodyHtml: string;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 多行文本 → <br> 分行(先转义再替换换行)。 */
function lines(s: string): string {
  return esc(s).replace(/\r?\n/g, '<br>');
}

function linkCell(raw: string): string {
  const url = raw.trim();
  if (!url) return '<span class="dim">—</span>';
  return `<a href="${esc(url)}">${esc(url)}</a>`;
}

function textCell(raw: string): string {
  const v = raw.trim();
  if (!v) return '<span class="dim">—</span>';
  return lines(v);
}

/**
 * 富文本单元格:含 http(s) 的片段渲染为可点击链接,其余保留原文
 * (线上地址 / 文本列可写说明文字,URL 自动可点)。
 */
function richTextCell(raw: string): string {
  const v = raw.trim();
  if (!v) return '<span class="dim">—</span>';
  const parts = splitTextWithLinks(v);
  return parts
    .map((p) => {
      if (p.url) return `<a href="${esc(toHref(p.url))}">${esc(p.url)}</a>`;
      return lines(p.text ?? '');
    })
    .join('');
}

/** 多选单元格:JSON 数组解析后渲染为标签。 */
function tagsCell(raw: string): string {
  const tags = parseTags(raw);
  if (tags.length === 0) return '<span class="dim">—</span>';
  return tags
    .map((t) => `<span class="ptag">${esc(t)}</span>`)
    .join('');
}

const PRINT_CSS = `
@page { size: A4; margin: 16mm 14mm; }
* { box-sizing: border-box; }
body { font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; color: #1f2328; font-size: 12px; line-height: 1.55; margin: 0; }
h1 { font-size: 20px; margin: 0 0 4px; }
.meta { color: #6b7280; font-size: 11px; margin-bottom: 14px; }
.stats { display: flex; gap: 28px; margin-bottom: 14px; padding: 12px 16px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; }
.stat b { display: block; font-size: 20px; }
.stat span { font-size: 11px; color: #6b7280; }
.chart { width: 100%; max-height: 280px; object-fit: contain; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 14px; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #e5e7eb; padding: 7px 9px; vertical-align: top; text-align: left; }
th { background: #f9fafb; font-size: 11px; font-weight: 600; color: #374151; white-space: nowrap; }
td.name { min-width: 96px; font-weight: 600; }
a { color: #2563eb; text-decoration: none; word-break: break-all; }
.dim { color: #9ca3af; }
.ptag { display: inline-block; margin: 1px 4px 1px 0; padding: 1px 8px; border: 1px solid #dbe3ee; border-radius: 999px; background: #f3f6fb; color: #374151; font-size: 11px; }
tr { break-inside: avoid; }
.footer { margin-top: 16px; font-size: 10px; color: #9ca3af; text-align: right; }
`;

export function buildPrintParts(options: PrintDocOptions): PrintDocParts {
  const { doc, chartDataUrl = null, generatedAt = '', title = 'GitHub 项目展示' } = options;
  const stats = computeStats(doc);

  const percent = Math.round(stats.contentRate * 100);
  const statHtml = `
    <div class="stat"><b>${stats.total}</b><span>项目总数</span></div>
    <div class="stat"><b>${stats.highlightsFilled}</b><span>已填亮点</span></div>
    <div class="stat"><b>${stats.insightsFilled}</b><span>已填启发</span></div>
    <div class="stat"><b>${percent}%</b><span>内容完整度</span></div>`;

  const chartHtml = chartDataUrl
    ? `<img class="chart" src="${chartDataUrl}" alt="项目介绍充实度">`
    : '';

  const headCells = [
    '<th>项目</th>',
    '<th>GitHub 链接</th>',
    '<th>亮点</th>',
    '<th>启发</th>',
    '<th>线上地址</th>',
    ...doc.columns.map((c) => `<th>${esc(c.title)}</th>`),
  ].join('');

  const bodyRows = doc.rows
    .map((r) => {
      const cells = [
        `<td class="name">${esc(r.name.trim() || '未命名项目')}</td>`,
        `<td>${linkCell(r.repoUrl)}</td>`,
        `<td>${textCell(r.highlights)}</td>`,
        `<td>${textCell(r.insights)}</td>`,
        `<td>${richTextCell(r.demoUrl)}</td>`,
        ...doc.columns.map((c) => {
          const v = r.values[c.id] ?? '';
          return `<td>${c.type === 'multi-select' ? tagsCell(v) : richTextCell(v)}</td>`;
        }),
      ].join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  const bodyHtml = [
    `<h1>${esc(title)}</h1>`,
    `<div class="meta">生成时间: ${esc(generatedAt || '—')} · 共 ${stats.total} 个项目</div>`,
    `<div class="stats">${statHtml}</div>`,
    chartHtml,
    '<table>',
    `<thead><tr>${headCells}</tr></thead>`,
    `<tbody>${bodyRows || '<tr><td colspan="5">暂无项目</td></tr>'}</tbody>`,
    '</table>',
    '<div class="footer">数据来源: github-show · 由开发者自填</div>',
  ].join('');

  return { title, cssText: PRINT_CSS, bodyHtml };
}

export function buildPrintHtml(options: PrintDocOptions): string {
  const { title, cssText, bodyHtml } = buildPrintParts(options);
  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${esc(title)}</title>`,
    `<style>${cssText}</style>`,
    '</head>',
    '<body>',
    bodyHtml,
    '</body>',
    '</html>',
  ].join('');
}
