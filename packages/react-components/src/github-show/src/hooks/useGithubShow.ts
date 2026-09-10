// src/hooks/useGithubShow.ts —— github-show 数据层 React 适配。
//
// 数据落点由三层决定(从高到低优先级):
//   1) URL 公开分享参数 `?groupId=<必填>[&key=<可选>]` —— PublicStore(只读)
//      任何人(匿名)都能访问别人公开的 github-show,直接渲染分享视图;
//      不写回。所有 mutate() 在 readOnly=true 时都是 no-op。
//   2) 已登录(token 存在且 jwtAuthState === 'logged-in')→ cloud store
//      (createGithubShowStore,经 kvV1 单 key 'github-show' 存取,整库 JSON blob)
//   3) 游客(无 token)→ LocalGithubShowStore(本地缓存),登录后无缝迁回云端
//
// 保存策略:每次变更 600ms debounce 后整体写回(与 color-studio 一致),
// 卸载时 flush 未落盘的待保存内容,避免丢最后一次编辑。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GithubShowDoc, GithubShowRow } from '@api/components/github-show/types';
import { emptyDoc } from '@api/components/github-show/types';
import { createGithubShowStore, type GithubShowStoreLite } from '@api/components/github-show/createGithubShowStore';
import { LocalGithubShowStore } from '../storage/LocalStore';
import { PublicGithubShowStore } from '../storage/PublicStore';
import { readPublicParamsFromUrl, buildShareUrl } from '../utils/shareLink';
import { useJwtAuth } from './useAuth';

export type GithubShowStatus = 'loading' | 'ready' | 'error';
export type SyncStatus = 'idle' | 'saving' | 'synced' | 'error';

type PersistStore = GithubShowStoreLite | LocalGithubShowStore | PublicGithubShowStore;

function freshId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function useGithubShow() {
  const auth = useJwtAuth();

  // URL 公开分享参数:在首次 render 同步读取(window.location.search 已就绪),
  // 之后整个 hook 生命周期固定——避免登录态切换 / 路由变化导致模式反复跳变。
  const publicParamsRef = useRef(readPublicParamsFromUrl());
  const publicParams = publicParamsRef.current; // null | {key, groupId}

  // store 实例用 ref 缓存,身份跨渲染稳定
  const cloudStoreRef = useRef<GithubShowStoreLite | null>(null);
  const localStoreRef = useRef<LocalGithubShowStore | null>(null);
  const publicStoreRef = useRef<PublicGithubShowStore | null>(null);
  const getCloudStore = useCallback(() => {
    if (!cloudStoreRef.current) cloudStoreRef.current = createGithubShowStore();
    return cloudStoreRef.current;
  }, []);
  const getLocalStore = useCallback(() => {
    if (!localStoreRef.current) localStoreRef.current = new LocalGithubShowStore();
    return localStoreRef.current;
  }, []);
  const getPublicStore = useCallback(() => {
    if (!publicStoreRef.current && publicParams) {
      publicStoreRef.current = new PublicGithubShowStore(publicParams);
    }
    return publicStoreRef.current!;
  }, [publicParams]);

  const [doc, setDoc] = useState<GithubShowDoc>(() => emptyDoc());
  const [status, setStatus] = useState<GithubShowStatus>('loading');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedJsonRef = useRef<string>('');
  const pendingRef = useRef<{ doc: GithubShowDoc; store: PersistStore } | null>(null);

  // 三态优先级:publicParams > isLoggedIn > anonymous(local)
  // 公开分享模式下,即使已登录也走 PublicStore(看的是别人分享的 KV),不走自己的 cloud store
  const isLoggedIn = auth.jwtAuthState === 'logged-in' && !!auth.token;
  const activeStore: PersistStore = publicParams
    ? getPublicStore()
    : isLoggedIn
      ? getCloudStore()
      : getLocalStore();

  // 启动 + 模式切换:重新 load
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    (async () => {
      try {
        const loaded = await activeStore.load();
        if (cancelled) return;
        setDoc(loaded);
        lastSavedJsonRef.current = JSON.stringify(loaded);
        pendingRef.current = null;
        // 公开模式下没有"云端同步"概念,syncStatus 永远 synced;本地/云端模式维持原语义
        setSyncStatus('synced');
        setStatus('ready');
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[useGithubShow] load failed:', msg);
        if (cancelled) return;
        setDoc(emptyDoc());
        setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [activeStore]);

  // 变更 → 600ms debounce 保存到当前 activeStore
  // 公开模式下 scheduleSave 永远不会被调(mutate 是 no-op),但留着不会出问题
  const scheduleSave = useCallback((next: GithubShowDoc, store: PersistStore) => {
    pendingRef.current = { doc: next, store };
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSyncStatus('saving');
    saveTimerRef.current = setTimeout(async () => {
      const pending = pendingRef.current;
      if (!pending) return;
      const json = JSON.stringify(pending.doc);
      if (json === lastSavedJsonRef.current) {
        setSyncStatus('synced');
        return;
      }
      try {
        await pending.store.save(pending.doc);
        lastSavedJsonRef.current = json;
        setSyncStatus('synced');
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[useGithubShow] save failed:', msg);
        setSyncStatus('error');
      }
    }, 600);
  }, []);

  // mutate:以 ref 的最新 doc 为基做不可变更新,避免 setState updater 里做副作用
  const docRef = useRef(doc);
  useEffect(() => { docRef.current = doc; }, [doc]);

  const mutate = useCallback(
    (updater: (prev: GithubShowDoc) => GithubShowDoc) => {
      // 公开分享模式只读 —— 任何 mutate 调用直接吞掉,不写本地 doc 也不调度保存。
      // UI 层还会用 readOnly 隐藏编辑按钮,但 mutate 兜底防止误调。
      if (publicParams) return docRef.current;
      const next = updater(docRef.current);
      docRef.current = next;
      setDoc(next);
      scheduleSave(next, activeStore);
      return next;
    },
    [publicParams, activeStore, scheduleSave],
  );

  // 卸载:清 timer + 把未落盘的待保存内容 flush 一次
  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const pending = pendingRef.current;
    if (pending) {
      const json = JSON.stringify(pending.doc);
      if (json !== lastSavedJsonRef.current) {
        void pending.store.save(pending.doc).catch(() => { /* 尽力而为 */ });
      }
    }
  }, []);

  // ── CRUD ──────────────────────────────────────────────

  const addRow = useCallback(
    (
      partial?: Partial<
        Pick<GithubShowRow, 'repoUrl' | 'name' | 'highlights' | 'insights' | 'output' | 'values'>
      >,
    ): GithubShowRow | null => {
      // 公开分享模式返回 null,UI 用 readOnly 守卫应该已经禁掉按钮;此处兜底
      if (publicParams) return null;
      const now = Date.now();
      const row: GithubShowRow = {
        id: freshId(),
        repoUrl: partial?.repoUrl ?? '',
        name: partial?.name ?? '',
        highlights: partial?.highlights ?? '',
        insights: partial?.insights ?? '',
        output: partial?.output ?? '',
        values: partial?.values ?? {},
        createdAt: now,
        updatedAt: now,
      };
      mutate((prev) => ({
        ...prev,
        meta: { ...prev.meta, updatedAt: now },
        rows: [...prev.rows, row],
      }));
      return row;
    },
    [mutate, publicParams],
  );

  const updateRow = useCallback(
    (
      id: string,
      patch: Partial<
        Pick<GithubShowRow, 'repoUrl' | 'name' | 'highlights' | 'insights' | 'output' | 'values'>
      >,
    ) => {
      if (publicParams) return;
      const now = Date.now();
      mutate((prev) => ({
        ...prev,
        meta: { ...prev.meta, updatedAt: now },
        rows: prev.rows.map((r) => (r.id === id ? { ...r, ...patch, updatedAt: now } : r)),
      }));
    },
    [mutate, publicParams],
  );

  const deleteRow = useCallback(
    (id: string) => {
      if (publicParams) return;
      const now = Date.now();
      mutate((prev) => ({
        ...prev,
        meta: { ...prev.meta, updatedAt: now },
        rows: prev.rows.filter((r) => r.id !== id),
      }));
    },
    [mutate, publicParams],
  );

  /** 调整行顺序:dir = -1 上移,1 下移(与相邻行交换)。顺序即 doc.rows 数组序,随保存同步。 */
  const moveRow = useCallback(
    (id: string, dir: -1 | 1) => {
      if (publicParams) return;
      const now = Date.now();
      mutate((prev) => {
        const idx = prev.rows.findIndex((r) => r.id === id);
        const target = idx + dir;
        if (idx < 0 || target < 0 || target >= prev.rows.length) return prev;
        const rows = prev.rows.slice();
        [rows[idx], rows[target]] = [rows[target], rows[idx]];
        return { ...prev, meta: { ...prev.meta, updatedAt: now }, rows };
      });
    },
    [mutate, publicParams],
  );

  // ── 自定义列 ──────────────────────────────────────────

  const addColumn = useCallback(
    (title: string, type: 'text' | 'multi-select' | 'number'): string | null => {
      if (publicParams) return null;
      const now = Date.now();
      const colId = freshId();
      mutate((prev) => ({
        ...prev,
        meta: { ...prev.meta, updatedAt: now },
        columns: [
          ...prev.columns,
          { id: colId, title: title.trim() || '未命名', type, createdAt: now, hiddenInDisplay: false },
        ],
      }));
      return colId;
    },
    [mutate, publicParams],
  );

  const renameColumn = useCallback(
    (colId: string, title: string) => {
      if (publicParams) return;
      const now = Date.now();
      mutate((prev) => ({
        ...prev,
        meta: { ...prev.meta, updatedAt: now },
        columns: prev.columns.map((c) =>
          c.id === colId ? { ...c, title: title.trim() || c.title } : c,
        ),
      }));
    },
    [mutate, publicParams],
  );

  /** 切换自定义列在展示页的显示状态(编辑页始终显示)。 */
  const toggleColumnVisibility = useCallback(
    (colId: string, hiddenInDisplay: boolean) => {
      if (publicParams) return;
      const now = Date.now();
      mutate((prev) => ({
        ...prev,
        meta: { ...prev.meta, updatedAt: now },
        columns: prev.columns.map((c) =>
          c.id === colId ? { ...c, hiddenInDisplay } : c,
        ),
      }));
    },
    [mutate, publicParams],
  );

  const deleteColumn = useCallback(
    (colId: string) => {
      if (publicParams) return;
      const now = Date.now();
      mutate((prev) => ({
        ...prev,
        meta: { ...prev.meta, updatedAt: now },
        columns: prev.columns.filter((c) => c.id !== colId),
        rows: prev.rows.map((r) => {
          const values = { ...r.values };
          delete values[colId];
          return { ...r, values, updatedAt: now };
        }),
      }));
    },
    [mutate, publicParams],
  );

  const setCellValue = useCallback(
    (rowId: string, colId: string, value: string) => {
      if (publicParams) return;
      const now = Date.now();
      mutate((prev) => ({
        ...prev,
        meta: { ...prev.meta, updatedAt: now },
        rows: prev.rows.map((r) =>
          r.id === rowId
            ? { ...r, values: { ...r.values, [colId]: value }, updatedAt: now }
            : r,
        ),
      }));
    },
    [mutate, publicParams],
  );

  // 保存失败后手动重试(把当前 doc 立即再存一次)—— 公开模式无意义但保留签名
  const retrySave = useCallback(() => {
    if (publicParams) return;
    const current = docRef.current;
    scheduleSave(current, activeStore);
  }, [activeStore, scheduleSave, publicParams]);

  // ── 公开分享信息(供 UI 顶部 banner / 「复制分享链接」按钮)────────────
  const readOnly = publicParams !== null;
  const shareUrl = useMemo(
    () => (publicParams ? buildShareUrl(publicParams) : ''),
    [publicParams],
  );

  return {
    doc,
    status,
    syncStatus,
    isLoggedIn,
    readOnly,
    publicParams,
    shareUrl,
    rows: doc.rows,
    columns: doc.columns,
    addRow,
    updateRow,
    deleteRow,
    moveRow,
    addColumn,
    renameColumn,
    deleteColumn,
    toggleColumnVisibility,
    setCellValue,
    retrySave,
  };
}
