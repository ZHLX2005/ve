// src/components/DisplayView.tsx —— 展示视图(给面试官看)。
//
// 与编辑视图彻底分开:
//   - 统计卡:项目总数 / 已填亮点 / 已填启发 / 内容完整度
//   - ECharts:项目介绍充实度(分组柱状图)+ 亮点填写率(环形图)
//   - 只读数据库表格:链接可点击跳转,列头可排序
//   - 导出 PDF:展示内容(含图表)直接下载 .pdf(失败降级浏览器打印)
// 渲染规则:文本列含 http 自动渲染链接;多选列渲染为标签;线上地址为可选文本列。

import { useMemo, useState } from 'react';
import type { GithubShowDoc } from '@api/components/github-show/types';
import { useECharts } from '../hooks/useECharts';
import { computeStats, contentChartData } from '../engine/stats';
import { buildPrintHtml, buildPrintParts } from '../engine/printDoc';
import { exportPdf } from '../engine/exportPdf';
import { printHtml } from '../engine/print';
import { deriveRepoName, displayLinkText, splitTextWithLinks, toHref } from '../utils/repo';
import { parseTags } from '../utils/tags';

export interface DisplayViewProps {
  doc: GithubShowDoc;
  onGoEdit: () => void;
}

type SortKey = 'order' | 'name' | 'highlights' | 'insights';

interface SortState {
  key: SortKey;
  dir: 1 | -1;
}

const PRIMARY = '#3b82f6';
const ACCENT = '#10b981';
const MUTED = '#e5e7eb';

function sortRows(doc: GithubShowDoc, sort: SortState): typeof doc.rows {
  if (sort.key === 'order') return doc.rows;
  const dir = sort.dir;
  return [...doc.rows].sort((a, b) => {
    if (sort.key === 'name') return a.name.localeCompare(b.name, 'zh') * dir;
    const av = a[sort.key].length;
    const bv = b[sort.key].length;
    return (av - bv) * dir || a.name.localeCompare(b.name, 'zh');
  });
}

function RepoLink({ url, name }: { url: string; name: string }) {
  const href = toHref(url);
  const text = name.trim() || deriveRepoName(url) || displayLinkText(url);
  if (!href) return <span className="sl-gh-dim">{text || '—'}</span>;
  return (
    <a className="sl-gh-dlink" href={href} target="_blank" rel="noreferrer" title={url}>
      {text}
    </a>
  );
}

/** 文本渲染:含 http(s) 自动切成可点击链接,其余保留原文(支持说明文字)。 */
function RichText({ value }: { value: string }) {
  const parts = splitTextWithLinks(value);
  if (parts.length === 0) return <span className="sl-gh-dim">—</span>;
  return (
    <>
      {parts.map((p, i) =>
        p.url ? (
          <a
            key={i}
            className="sl-gh-dlink"
            href={toHref(p.url)}
            target="_blank"
            rel="noreferrer"
            title={p.url}
          >
            {displayLinkText(p.url)}
          </a>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

/** 多选渲染:解析 JSON 数组并渲染为标签。 */
function TagList({ value }: { value: string }) {
  const tags = parseTags(value);
  if (tags.length === 0) return <span className="sl-gh-dim">—</span>;
  return (
    <span className="sl-gh-dtags">
      {tags.map((t) => (
        <span className="sl-gh-dtag" key={t}>
          {t}
        </span>
      ))}
    </span>
  );
}

function HeaderCell({
  label,
  sort,
  sortKey,
  onSort,
}: {
  label: string;
  sort: SortState;
  sortKey: SortKey;
  onSort: (key: SortKey) => void;
}) {
  const active = sort.key === sortKey && sortKey !== 'order';
  return (
    <th aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="sl-gh-dsort" onClick={() => onSort(sortKey)}>
        {label}
        {active && <span className="sl-gh-dsort__arrow">{sort.dir === 1 ? '↑' : '↓'}</span>}
      </button>
    </th>
  );
}

export default function DisplayView({ doc, onGoEdit }: DisplayViewProps) {
  const [sort, setSort] = useState<SortState>({ key: 'order', dir: 1 });
  const [exporting, setExporting] = useState(false);

  const stats = useMemo(() => computeStats(doc), [doc]);
  const chartData = useMemo(() => contentChartData(doc, 12), [doc]);
  const sortedRows = useMemo(() => sortRows(doc, sort), [doc, sort]);

  const barOption = useMemo(
    () =>
      chartData.length === 0
        ? null
        : {
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
            legend: { data: ['亮点', '启发'], top: 0, itemWidth: 12, itemHeight: 8, textStyle: { fontSize: 11 } },
            grid: { left: 8, right: 12, top: 34, bottom: 8, containLabel: true },
            xAxis: {
              type: 'category' as const,
              data: chartData.map((d) => d.name),
              axisLabel: {
                interval: 0,
                rotate: chartData.length > 6 ? 32 : 0,
                fontSize: 10,
                width: 88,
                overflow: 'truncate',
              },
              axisTick: { show: false },
            },
            yAxis: { type: 'value' as const, name: '字符数', nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 } },
            series: [
              { name: '亮点', type: 'bar' as const, data: chartData.map((d) => d.highlightsChars), itemStyle: { color: PRIMARY, borderRadius: [3, 3, 0, 0] }, barMaxWidth: 16 },
              { name: '启发', type: 'bar' as const, data: chartData.map((d) => d.insightsChars), itemStyle: { color: ACCENT, borderRadius: [3, 3, 0, 0] }, barMaxWidth: 16 },
            ],
          },
    [chartData],
  );

  const pieOption = useMemo(
    () =>
      stats.total === 0
        ? null
        : {
            tooltip: { trigger: 'item' as const, formatter: '{b}: {c} 个 ({d}%)' },
            legend: { bottom: 0, itemWidth: 12, itemHeight: 8, textStyle: { fontSize: 11 } },
            series: [
              {
                name: '亮点填写',
                type: 'pie' as const,
                radius: ['50%', '72%'],
                center: ['50%', '44%'],
                label: { show: false },
                data: [
                  { name: '已填亮点', value: stats.highlightsFilled, itemStyle: { color: PRIMARY } },
                  { name: '未填亮点', value: stats.total - stats.highlightsFilled, itemStyle: { color: MUTED } },
                ],
              },
            ],
          },
    [stats],
  );

  const { containerRef: barRef, chartRef: barChartRef } = useECharts(barOption);
  const { containerRef: pieRef } = useECharts(pieOption);

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 1 ? -1 : 1 } : { key, dir: 1 },
    );
  }

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
      let chartDataUrl: string | null = null;
      try {
        if (barChartRef.current) {
          chartDataUrl = barChartRef.current.getDataURL({
            type: 'png',
            pixelRatio: 2,
            backgroundColor: '#ffffff',
          });
        }
      } catch {
        chartDataUrl = null; // 图表异常不阻塞导出
      }
      const generatedAt = new Date().toLocaleString('zh-CN', { hour12: false });
      const fileName = `github-show-${new Date().toISOString().slice(0, 10)}.pdf`;
      const parts = buildPrintParts({ doc, chartDataUrl, generatedAt });
      const downloaded = await exportPdf(parts, fileName);
      if (!downloaded) {
        // 下载失败(依赖加载/截图异常)→ 降级浏览器打印
        await printHtml(buildPrintHtml({ doc, chartDataUrl, generatedAt }));
      }
    } finally {
      setExporting(false);
    }
  }

  if (doc.rows.length === 0) {
    return (
      <div className="sl-gh-display">
        <div className="sl-gh-empty">
          <h2 className="sl-gh-empty__title">还没有可展示的项目</h2>
          <p className="sl-gh-empty__desc">
            切到编辑视图,添加项目并填写亮点与启发,展示页会自动生成统计图表与 PDF 导出。
          </p>
          <div className="sl-gh-empty__actions">
            <button type="button" className="sl-gh-btn sl-gh-btn--primary" onClick={onGoEdit}>
              去编辑
            </button>
          </div>
        </div>
      </div>
    );
  }

  const percent = Math.round(stats.contentRate * 100);

  return (
    <div className="sl-gh-display">
      <div className="sl-gh-dtoolbar">
        <button
          type="button"
          className="sl-gh-btn sl-gh-btn--primary"
          onClick={() => void handleExport()}
          disabled={exporting}
        >
          {exporting ? '正在导出…' : '导出 PDF'}
        </button>
      </div>

      <div className="sl-gh-dstats">
        <div className="sl-gh-dstat">
          <b>{stats.total}</b>
          <span>项目总数</span>
        </div>
        <div className="sl-gh-dstat">
          <b>{stats.highlightsFilled}</b>
          <span>已填亮点</span>
        </div>
        <div className="sl-gh-dstat">
          <b>{stats.insightsFilled}</b>
          <span>已填启发</span>
        </div>
        <div className="sl-gh-dstat">
          <b>{percent}%</b>
          <span>内容完整度</span>
        </div>
      </div>

      <div className="sl-gh-dcharts">
        <div className="sl-gh-dchart">
          <div className="sl-gh-dchart__title">项目介绍充实度</div>
          <div className="sl-gh-dchart__canvas" ref={barRef} aria-label="项目介绍充实度柱状图" />
        </div>
        <div className="sl-gh-dchart">
          <div className="sl-gh-dchart__title">亮点填写率</div>
          <div className="sl-gh-dchart__canvas" ref={pieRef} aria-label="亮点填写率环形图" />
        </div>
      </div>

      <div className="sl-gh-dtable-wrap">
        <table className="sl-gh-dtable" aria-label="项目展示">
          <thead>
            <tr>
              <th>GitHub 链接</th>
              <HeaderCell label="项目名" sort={sort} sortKey="name" onSort={toggleSort} />
              <HeaderCell label="亮点" sort={sort} sortKey="highlights" onSort={toggleSort} />
              <HeaderCell label="启发" sort={sort} sortKey="insights" onSort={toggleSort} />
              <th>线上地址</th>
              {doc.columns.map((c) => (
                <th key={c.id}>{c.title}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr key={row.id}>
                <td>
                  <RepoLink url={row.repoUrl} name="" />
                </td>
                <td className="sl-gh-dname">{row.name || '—'}</td>
                <td className="sl-gh-dtext">{row.highlights || <span className="sl-gh-dim">—</span>}</td>
                <td className="sl-gh-dtext">{row.insights || <span className="sl-gh-dim">—</span>}</td>
                <td>
                  {row.demoUrl ? <RichText value={row.demoUrl} /> : <span className="sl-gh-dim">—</span>}
                </td>
                {doc.columns.map((c) => {
                  const v = row.values[c.id] ?? '';
                  return (
                    <td key={c.id} className="sl-gh-dtext">
                      {c.type === 'multi-select' ? (
                        <TagList value={v} />
                      ) : v ? (
                        <RichText value={v} />
                      ) : (
                        <span className="sl-gh-dim">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
