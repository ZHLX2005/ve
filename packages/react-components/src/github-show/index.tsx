// index.tsx —— GithubShow 组件入口。
//
// 目标:给面试官看所有项目介绍 + 开发者自填的启发(减少用人成本)。
// 双视图:
//   - 编辑视图:Notion/Feishu 式数据库表格,链接可点击跳转,支持列扩展
//   - 展示视图:统计卡 + ECharts 图表 + 只读表格,支持导出 PDF
// 数据:整份文档 JSON blob 存单 key KV('github-show');游客降级 localStorage。
// 设计原则:清晰优先。

import { useEffect, useMemo, useState } from 'react';
import './index.css';
import { useGithubShow } from './src/hooks/useGithubShow';
import { useLoginModal } from './src/hooks/useLoginModal';
import GithubShowTable from './src/components/GithubShowTable';
import ColumnSettingsModal from './src/components/ColumnSettingsModal';
import DisplayView from './src/components/DisplayView';
import SyncPill from './src/components/SyncPill';
import type { GithubShowRow } from '@api/components/github-show/types';

const VIEW_LS_KEY = 'sl-github-show:view';
type ViewMode = 'edit' | 'display';

/** 示例行 —— 展示数据库长什么样(内容为公开事实,便于理解用途) */
const SAMPLE_ROW = {
  repoUrl: 'https://github.com/vuejs/core',
  name: 'vuejs/core',
  highlights: '示例亮点:组合式 API、响应式系统、高性能虚拟 DOM',
  insights: '示例启发:把核心 API 设计得小而正交,降低上手成本',
  demoUrl: 'https://vuejs.org/',
};

function readInitialView(): ViewMode {
  try {
    return localStorage.getItem(VIEW_LS_KEY) === 'display' ? 'display' : 'edit';
  } catch {
    return 'edit';
  }
}

function filterRows(rows: GithubShowRow[], query: string): GithubShowRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) =>
    [r.repoUrl, r.name, r.highlights, r.insights, r.demoUrl, ...Object.values(r.values)].some((f) =>
      f.toLowerCase().includes(q),
    ),
  );
}

export default function GithubShow() {
  const store = useGithubShow();
  const loginModal = useLoginModal();
  const [query, setQuery] = useState('');
  const [focusRowId, setFocusRowId] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>(readInitialView);
  const [columnsOpen, setColumnsOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_LS_KEY, view);
    } catch {
      /* 忽略:隐私模式等场景 */
    }
  }, [view]);

  const filtered = useMemo(
    () => filterRows(store.rows, query),
    [store.rows, query],
  );

  function handleAddRow(partial?: Partial<Pick<GithubShowRow, 'repoUrl' | 'name' | 'highlights' | 'insights' | 'demoUrl'>>) {
    const row = store.addRow(partial);
    setFocusRowId(row.id);
  }

  const hasAnyRows = store.rows.length > 0;

  return (
    <div className="sl-gh-root">
      <header className="sl-gh-topbar">
        <div className="sl-gh-topbar__left">
          <span className="sl-gh-title">GitHub 项目数据库</span>
          <span className="sl-gh-meta">{store.rows.length} 个项目</span>
        </div>
        <div className="sl-gh-topbar__right">
          <div className="sl-gh-viewswitch" role="tablist" aria-label="视图切换">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'edit'}
              className={`sl-gh-viewswitch__btn${view === 'edit' ? ' is-active' : ''}`}
              onClick={() => setView('edit')}
            >
              编辑
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'display'}
              className={`sl-gh-viewswitch__btn${view === 'display' ? ' is-active' : ''}`}
              onClick={() => setView('display')}
            >
              展示
            </button>
          </div>
          {view === 'edit' && (
            <input
              className="sl-gh-search"
              type="search"
              value={query}
              placeholder="搜索链接 / 项目名 / 亮点 / 启发"
              aria-label="搜索"
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          <SyncPill
            status={store.status}
            syncStatus={store.syncStatus}
            isLoggedIn={store.isLoggedIn}
            onLogin={loginModal.open}
            onRetry={store.retrySave}
          />
          {view === 'edit' && (
            <>
              <button
                type="button"
                className="sl-gh-btn sl-gh-btn--ghost"
                onClick={() => setColumnsOpen(true)}
              >
                列设置
              </button>
              {hasAnyRows && (
                <button
                  type="button"
                  className="sl-gh-btn sl-gh-btn--primary"
                  onClick={() => handleAddRow()}
                >
                  ＋ 添加项目
                </button>
              )}
            </>
          )}
        </div>
      </header>

      {store.status === 'loading' ? (
        <div className="sl-gh-empty">
          <p className="sl-gh-empty__title">加载中…</p>
        </div>
      ) : view === 'display' ? (
        <DisplayView doc={store.doc} onGoEdit={() => setView('edit')} />
      ) : !hasAnyRows ? (
        <div className="sl-gh-empty">
          <h2 className="sl-gh-empty__title">还没有项目</h2>
          <p className="sl-gh-empty__desc">
            粘贴一个 GitHub 链接即可开始:自动解析项目名;亮点与启发由开发者自填,
            面试时一目了然。
          </p>
          <div className="sl-gh-empty__actions">
            <button type="button" className="sl-gh-btn sl-gh-btn--primary" onClick={() => handleAddRow()}>
              ＋ 添加一行
            </button>
            <button
              type="button"
              className="sl-gh-btn sl-gh-btn--ghost"
              onClick={() => handleAddRow(SAMPLE_ROW)}
            >
              填充示例
            </button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="sl-gh-empty">
          <h2 className="sl-gh-empty__title">没有匹配的项目</h2>
          <p className="sl-gh-empty__desc">换个关键词试试。</p>
        </div>
      ) : (
        <GithubShowTable
          rows={filtered}
          columns={store.columns}
          focusRowId={focusRowId}
          onAddRow={() => handleAddRow()}
          onUpdateRow={store.updateRow}
          onDeleteRow={store.deleteRow}
          onSetCellValue={store.setCellValue}
        />
      )}

      {columnsOpen && (
        <ColumnSettingsModal
          columns={store.columns}
          onAdd={store.addColumn}
          onRename={store.renameColumn}
          onDelete={store.deleteColumn}
          onClose={() => setColumnsOpen(false)}
        />
      )}

      <footer className="sl-gh-foot">
        数据整体保存在一个云端 key(github-show);未登录时仅保存在本机浏览器。
      </footer>
    </div>
  );
}
