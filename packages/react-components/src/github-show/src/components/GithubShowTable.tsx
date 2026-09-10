// src/components/GithubShowTable.tsx —— 编辑视图的数据库表格本体。
//
// 列:GitHub 链接 | 项目名 | 亮点 | 启发 | 线上地址(可选文本列) | 自定义列 | 操作
// - 链接列(GitHub)用 LinkCell:合法即点击跳转,可编辑
// - 线上地址是可选文本列:可写解释文字,含 http 自动可点,可修改可清空
// - 自定义列:text 用自动撑高 textarea(含 http 渲染在展示/导出);multi-select 用 chip 编辑器
// - 删除行走两步确认
// 样式统一 sl-gh- 前缀 + --sl-* token。

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { GithubShowColumn, GithubShowRow } from '@api/components/github-show/types';
import { deriveRepoName, displayLinkText } from '../utils/repo';
import LinkCell from './LinkCell';
import MultiSelectCell from './MultiSelectCell';

export interface GithubShowTableProps {
  rows: GithubShowRow[];
  columns: GithubShowColumn[];
  /** 添加后需要聚焦的行的 id(新行链接输入框自动聚焦) */
  focusRowId: string | null;
  onAddRow: () => void;
  onUpdateRow: (
    id: string,
    patch: Partial<Pick<GithubShowRow, 'repoUrl' | 'name' | 'highlights' | 'insights' | 'demoUrl'>>,
  ) => void;
  onDeleteRow: (id: string) => void;
  onSetCellValue: (rowId: string, colId: string, value: string) => void;
}

/** 自动撑高 textarea:内容变长时高度跟随,超出不出现滚动条。 */
function AutoTextarea({
  value,
  placeholder,
  ariaLabel,
  onChange,
}: {
  value: string;
  placeholder?: string;
  ariaLabel?: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  };

  useEffect(() => {
    resize();
  }, [value]);

  useEffect(() => {
    resize();
  }, []);

  return (
    <textarea
      ref={ref}
      className="sl-gh-textarea"
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      rows={1}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function GithubShowTable({
  rows,
  columns,
  focusRowId,
  onAddRow,
  onUpdateRow,
  onDeleteRow,
  onSetCellValue,
}: GithubShowTableProps) {
  // 两步删除:× → ?(变红)→ 再点 → 真删;失焦自动取消
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  /** 链接提交:自动解析项目名(仅当名字为空或仍等于上次的自动名时才覆盖) */
  function handleRepoUrlCommit(row: GithubShowRow, value: string) {
    const derived = deriveRepoName(value);
    const prevDerived = deriveRepoName(row.repoUrl);
    const autoNamed = !row.name.trim() || (prevDerived !== '' && row.name === prevDerived);
    onUpdateRow(row.id, autoNamed ? { repoUrl: value, name: derived } : { repoUrl: value });
  }

  function handleRowKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // Ctrl/Cmd + Enter 触发行内任意输入框失焦(提交输入法候选)——
    // 无实际副作用,仅为移动端/输入法场景提供确定性提交。
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      (e.target as HTMLElement).blur();
    }
  }

  return (
    <div
      className="sl-gh-table"
      role="table"
      aria-label="GitHub 项目数据库"
      style={{ '--sl-gh-custom-cols': columns.length } as CSSProperties}
    >
      <div className="sl-gh-head" role="row">
        <div className="sl-gh-cell sl-gh-cell--url" role="columnheader" title="粘贴 GitHub 仓库链接,点击可打开">
          GitHub 链接
        </div>
        <div className="sl-gh-cell sl-gh-cell--name" role="columnheader" title="从链接自动解析,可手动修改">
          项目名
        </div>
        <div className="sl-gh-cell sl-gh-cell--highlights" role="columnheader" title="做了什么 / 技术亮点 / 成果">
          亮点
        </div>
        <div className="sl-gh-cell sl-gh-cell--insights" role="columnheader" title="做这件事的收获 / 可复用的思路(开发者自填)">
          启发
        </div>
        <div className="sl-gh-cell sl-gh-cell--demo" role="columnheader" title="可选:线上地址 / 演示链接,可写说明,含 http 自动可点">
          线上地址
        </div>
        {columns.map((c) => (
          <div
            className={`sl-gh-cell sl-gh-cell--custom${c.type === 'multi-select' ? ' is-multi' : ''}`}
            role="columnheader"
            key={c.id}
            title={`${c.title}(${c.type === 'multi-select' ? '多选' : '文本'})`}
          >
            {c.title}
          </div>
        ))}
        <div className="sl-gh-cell sl-gh-cell--ops" role="columnheader" aria-label="操作">
          {/* 留白:操作列 */}
        </div>
      </div>

      {rows.map((row) => {
        const confirming = confirmDeleteId === row.id;
        return (
          <div
            className="sl-gh-row"
            role="row"
            key={row.id}
            data-row-id={row.id}
            onKeyDown={(e) => handleRowKeyDown(e)}
          >
            <div className="sl-gh-cell sl-gh-cell--url" role="cell">
              <LinkCell
                value={row.repoUrl}
                placeholder="https://github.com/…"
                ariaLabel="GitHub 仓库链接"
                autoFocus={row.id === focusRowId}
                displayText={deriveRepoName(row.repoUrl) || displayLinkText(row.repoUrl)}
                onCommit={(v) => handleRepoUrlCommit(row, v)}
              />
            </div>
            <div className="sl-gh-cell sl-gh-cell--name" role="cell">
              <input
                className="sl-gh-input"
                value={row.name}
                placeholder="自动解析，可修改"
                aria-label="项目名"
                onChange={(e) => onUpdateRow(row.id, { name: e.target.value })}
              />
            </div>
            <div className="sl-gh-cell sl-gh-cell--highlights" role="cell">
              <AutoTextarea
                value={row.highlights}
                placeholder="技术亮点、难点与成果…"
                ariaLabel={`${row.name || '项目'} 的亮点`}
                onChange={(v) => onUpdateRow(row.id, { highlights: v })}
              />
            </div>
            <div className="sl-gh-cell sl-gh-cell--insights" role="cell">
              <AutoTextarea
                value={row.insights}
                placeholder="做这件事的收获、可复用的思路…"
                ariaLabel={`${row.name || '项目'} 的启发`}
                onChange={(v) => onUpdateRow(row.id, { insights: v })}
              />
            </div>
            <div className="sl-gh-cell sl-gh-cell--demo" role="cell">
              <AutoTextarea
                value={row.demoUrl}
                placeholder="可选:线上地址 / 说明,含 http 自动可点…"
                ariaLabel="线上地址"
                onChange={(v) => onUpdateRow(row.id, { demoUrl: v })}
              />
            </div>
            {columns.map((c) => (
              <div className="sl-gh-cell sl-gh-cell--custom" role="cell" key={c.id}>
                {c.type === 'multi-select' ? (
                  <MultiSelectCell
                    value={row.values[c.id] ?? ''}
                    ariaLabel={c.title}
                    onCommit={(v) => onSetCellValue(row.id, c.id, v)}
                  />
                ) : (
                  <AutoTextarea
                    value={row.values[c.id] ?? ''}
                    placeholder="—"
                    ariaLabel={c.title}
                    onChange={(v) => onSetCellValue(row.id, c.id, v)}
                  />
                )}
              </div>
            ))}
            <div className="sl-gh-cell sl-gh-cell--ops" role="cell">
              <button
                type="button"
                className={`sl-gh-del${confirming ? ' is-confirming' : ''}`}
                title={confirming ? '再次点击确认删除' : '删除此行'}
                aria-label={confirming ? '确认删除' : '删除'}
                onBlur={() => { if (confirming) setConfirmDeleteId(null); }}
                onClick={() => {
                  if (confirming) {
                    onDeleteRow(row.id);
                    setConfirmDeleteId(null);
                  } else {
                    setConfirmDeleteId(row.id);
                  }
                }}
              >
                {confirming ? '?' : '×'}
              </button>
            </div>
          </div>
        );
      })}

      <button type="button" className="sl-gh-add-row" onClick={onAddRow}>
        ＋ 添加一行
      </button>
    </div>
  );
}

export default GithubShowTable;
