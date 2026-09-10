// index.tsx —— GithubShow 组件入口。
//
// 目标:给面试官看所有项目介绍 + 开发者自填的启发(减少用人成本)。
// 双视图:
//   - 编辑视图:Notion/Feishu 式数据库表格,链接可点击跳转,支持列扩展
//   - 展示视图:统计卡 + ECharts 图表 + 只读表格,支持导出 PDF
// 数据:整份文档 JSON blob 存单 key KV('github-show');游客降级 localStorage。
//
// 公开分享模式(2026-09 起):URL 带 `?groupId=N[&key=...]` 时,组件走只读
// 公开读接口拉别人的 KV,展示给他人(无需登录);不能编辑/保存。详见
// useGithubShow 的三态优先级 + PublicStore。
// 设计原则:清晰优先。

import { useEffect, useMemo, useState } from 'react';
import './index.css';
import { useGithubShow } from './src/hooks/useGithubShow';
import { useLoginModal } from './src/hooks/useLoginModal';
import GithubShowTable from './src/components/GithubShowTable';
import ColumnSettingsModal from './src/components/ColumnSettingsModal';
import DisplayView from './src/components/DisplayView';
import SyncPill from './src/components/SyncPill';
import PublicShareBanner from './src/components/PublicShareBanner';
import ShareButton from './src/components/ShareButton';
import type { GithubShowRow } from '@api/components/github-show/types';

const VIEW_LS_KEY = 'sl-github-show:view';
type ViewMode = 'edit' | 'display';

/** 示例行 —— 展示数据库长什么样(内容为公开事实,便于理解用途) */
const SAMPLE_ROW = {
  repoUrl: 'https://github.com/vuejs/core',
  name: 'vuejs/core',
  highlights: '示例亮点:组合式 API、响应式系统、高性能虚拟 DOM',
  insights: '示例启发:把核心 API 设计得小而正交,降低上手成本',
  output: 'https://vuejs.org/',
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
    [r.repoUrl, r.name, r.highlights, r.insights, r.output, ...Object.values(r.values)].some((f) =>
      f.toLowerCase().includes(q),
    ),
  );
}

export default function GithubShow() {
  const store = useGithubShow();
  const loginModal = useLoginModal();
  const [query, setQuery] = useState('');
  const [focusRowId, setFocusRowId] = useState<string | null>(null);
  // 公开分享模式强制只看 display 视图 —— 编辑器在该模式下没有存在意义(只读 + 不能保存)。
  // 非公开模式维持原 LS 记忆(默认 edit)。
  const [view, setView] = useState<ViewMode>(() => (store.readOnly ? 'display' : readInitialView()));
  const [columnsOpen, setColumnsOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_LS_KEY, view);
    } catch {
      /* 忽略:隐私模式等场景 */
    }
  }, [view]);

  // 公开模式下若用户切到 edit,自动拉回 display(防止误操作空编辑)
  useEffect(() => {
    if (store.readOnly && view !== 'display') setView('display');
  }, [store.readOnly, view]);

  const filtered = useMemo(
    () => filterRows(store.rows, query),
    [store.rows, query],
  );

  function handleAddRow(partial?: Partial<Pick<GithubShowRow, 'repoUrl' | 'name' | 'highlights' | 'insights' | 'output'>>) {
    const row = store.addRow(partial);
    if (row) setFocusRowId(row.id);
  }

  const hasAnyRows = store.rows.length > 0;

  return (
    <div className="sl-gh-root">
      {/* 公开分享模式顶部 banner —— 只读状态指示 + 「我也要分享」链接。
          该 banner 只在 store.readOnly=true 时挂载(URL 带 groupId 参数)。 */}
      {store.readOnly && store.publicParams && (
        <PublicShareBanner
          key={store.publicParams.key}
          keyName={store.publicParams.key}
          groupId={store.publicParams.groupId}
        />
      )}

      <header className="sl-gh-topbar">
        <div className="sl-gh-topbar__left">
          <span className="sl-gh-title">GitHub 项目数据库</span>
          <span className="sl-gh-meta">{store.rows.length} 个项目</span>
        </div>
        <div className="sl-gh-topbar__right">
          {/* 公开模式下隐藏视图切换 —— 强制 display,不让用户以为能编辑 */}
          {!store.readOnly && (
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
          )}
          {view === 'edit' && !store.readOnly && (
            <input
              className="sl-gh-search"
              type="search"
              value={query}
              placeholder="搜索链接 / 项目名 / 亮点 / 启发"
              aria-label="搜索"
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          {/* 同步指示器:公开模式下没有"同步"概念(只读拉一次),隐藏 SyncPill */}
          {!store.readOnly && (
            <SyncPill
              status={store.status}
              syncStatus={store.syncStatus}
              isLoggedIn={store.isLoggedIn}
              onLogin={loginModal.open}
              onRetry={store.retrySave}
            />
          )}
          {/* 公开分享入口:登录态 + 非公开模式下挂载,弹层管理可见性 + 复制链接。
              ready=doc 已加载(避免在空 doc 时弹分享但提示 KV 不存在)。公开模式下隐藏
              (banner 已经承担只读提示,无需再提供 toggle)。 */}
          {!store.readOnly && store.isLoggedIn && (
            <ShareButton ready={store.status === 'ready'} />
          )}
          {view === 'edit' && !store.readOnly && (
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
      ) : store.status === 'error' ? (
        <div className="sl-gh-empty">
          <h2 className="sl-gh-empty__title">{store.readOnly ? '公开分享加载失败' : '加载失败'}</h2>
          <p className="sl-gh-empty__desc">
            {store.readOnly
              ? '该链接对应的分享可能尚未公开(visibility=private)、已过期,或群组 ID 不存在。'
              : '请稍后重试。'}
          </p>
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
          onMoveRow={store.moveRow}
          onSetCellValue={store.setCellValue}
        />
      )}

      {columnsOpen && !store.readOnly && (
        <ColumnSettingsModal
          columns={store.columns}
          onAdd={store.addColumn}
          onRename={store.renameColumn}
          onDelete={store.deleteColumn}
          onToggleVisible={store.toggleColumnVisibility}
          onClose={() => setColumnsOpen(false)}
        />
      )}

      <footer className="sl-gh-foot">
        {store.readOnly
          ? '公开分享模式 — 通过 URL groupId 参数只读访问,不会写入任何数据。'
          : '数据整体保存在一个云端 key(github-show);未登录时仅保存在本机浏览器。'}
      </footer>
    </div>
  );
}
