// src/hooks/useGithubShow.ts —— github-show 数据层 React 适配。
//
// 数据落点由 host 的 JWT 态决定:
//   - 已登录(token 存在且 jwtAuthState === 'logged-in')→ cloud store
//     (createGithubShowStore,经 kvV1 单 key 'github-show' 存取,整库 JSON blob)
//   - 游客(无 token)→ LocalGithubShowStore(本地缓存),登录后无缝迁回云端
//
// 保存策略:每次变更 600ms debounce 后整体写回(与 color-studio 一致),
// 卸载时 flush 未落盘的待保存内容,避免丢最后一次编辑。

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GithubShowDoc, GithubShowRow } from '@api/components/github-show/types';
import { emptyDoc } from '@api/components/github-show/types';
import { createGithubShowStore, type GithubShowStoreLite } from '@api/components/github-show/createGithubShowStore';
import { LocalGithubShowStore } from '../storage/LocalStore';
import { useJwtAuth } from './useAuth';

export type GithubShowStatus = 'loading' | 'ready' | 'error';
export type SyncStatus = 'idle' | 'saving' | 'synced' | 'error';

type PersistStore = GithubShowStoreLite | LocalGithubShowStore;

function freshId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function useGithubShow() {
  const auth = useJwtAuth();

  // store 实例用 ref 缓存,身份跨渲染稳定
  const cloudStoreRef = useRef<GithubShowStoreLite | null>(null);
  const localStoreRef = useRef<LocalGithubShowStore | null>(null);
  const getCloudStore = useCallback(() => {
    if (!cloudStoreRef.current) cloudStoreRef.current = createGithubShowStore();
    return cloudStoreRef.current;
  }, []);
  const getLocalStore = useCallback(() => {
    if (!localStoreRef.current) localStoreRef.current = new LocalGithubShowStore();
    return localStoreRef.current;
  }, []);

  const [doc, setDoc] = useState<GithubShowDoc>(() => emptyDoc());
  const [status, setStatus] = useState<GithubShowStatus>('loading');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedJsonRef = useRef<string>('');
  const pendingRef = useRef<{ doc: GithubShowDoc; store: PersistStore } | null>(null);

  // 登录判断:userId/token 存在 = 登录(同步中不变);jwtAuthState 必须进依赖
  // (init race:token 落 ref 但 /user/info 还在拉,见 usage-scope「三态独立」)
  const isLoggedIn = auth.jwtAuthState === 'logged-in' && !!auth.token;
  const activeStore: PersistStore = isLoggedIn ? getCloudStore() : getLocalStore();

  // 启动 + 登录态切换:重新 load
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
  }, [isLoggedIn, activeStore]);

  // 变更 → 600ms debounce 保存到当前 activeStore
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
      const next = updater(docRef.current);
      docRef.current = next;
      setDoc(next);
      scheduleSave(next, activeStore);
    },
    [activeStore, scheduleSave],
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
        Pick<GithubShowRow, 'repoUrl' | 'name' | 'highlights' | 'insights' | 'demoUrl' | 'values'>
      >,
    ): GithubShowRow => {
      const now = Date.now();
      const row: GithubShowRow = {
        id: freshId(),
        repoUrl: partial?.repoUrl ?? '',
        name: partial?.name ?? '',
        highlights: partial?.highlights ?? '',
        insights: partial?.insights ?? '',
        demoUrl: partial?.demoUrl ?? '',
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
    [mutate],
  );

  const updateRow = useCallback(
    (
      id: string,
      patch: Partial<
        Pick<GithubShowRow, 'repoUrl' | 'name' | 'highlights' | 'insights' | 'demoUrl' | 'values'>
      >,
    ) => {
      const now = Date.now();
      mutate((prev) => ({
        ...prev,
        meta: { ...prev.meta, updatedAt: now },
        rows: prev.rows.map((r) => (r.id === id ? { ...r, ...patch, updatedAt: now } : r)),
      }));
    },
    [mutate],
  );

  const deleteRow = useCallback(
    (id: string) => {
      const now = Date.now();
      mutate((prev) => ({
        ...prev,
        meta: { ...prev.meta, updatedAt: now },
        rows: prev.rows.filter((r) => r.id !== id),
      }));
    },
    [mutate],
  );

  // ── 自定义列 ──────────────────────────────────────────

  const addColumn = useCallback(
    (title: string, type: 'text' | 'link'): string => {
      const now = Date.now();
      const colId = freshId();
      mutate((prev) => ({
        ...prev,
        meta: { ...prev.meta, updatedAt: now },
        columns: [...prev.columns, { id: colId, title: title.trim() || '未命名', type, createdAt: now }],
      }));
      return colId;
    },
    [mutate],
  );

  const renameColumn = useCallback(
    (colId: string, title: string) => {
      const now = Date.now();
      mutate((prev) => ({
        ...prev,
        meta: { ...prev.meta, updatedAt: now },
        columns: prev.columns.map((c) =>
          c.id === colId ? { ...c, title: title.trim() || c.title } : c,
        ),
      }));
    },
    [mutate],
  );

  const deleteColumn = useCallback(
    (colId: string) => {
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
    [mutate],
  );

  const setCellValue = useCallback(
    (rowId: string, colId: string, value: string) => {
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
    [mutate],
  );

  // 保存失败后手动重试(把当前 doc 立即再存一次)
  const retrySave = useCallback(() => {
    const current = docRef.current;
    scheduleSave(current, activeStore);
  }, [activeStore, scheduleSave]);

  return {
    doc,
    status,
    syncStatus,
    isLoggedIn,
    rows: doc.rows,
    columns: doc.columns,
    addRow,
    updateRow,
    deleteRow,
    addColumn,
    renameColumn,
    deleteColumn,
    setCellValue,
    retrySave,
  };
}
