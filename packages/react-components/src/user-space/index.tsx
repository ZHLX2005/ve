// index.tsx —— UserSpace 组件入口
// 布局:左 sidebar(工作空间列表) + 右 tab(概览/成员/邀请/库存)
// 登录态读 host jwtAuth;未登录展示 "登录后查看" 引导
// 一切副作用(创建/修改/删除)走 host createUserSpaceStore()

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './index.css';
import { useUserSpaceStore } from './src/hooks/useUserSpaceStore';
import { useJwtAuth } from './src/hooks/useAuth';
import { useLoginModal } from './src/hooks/useLoginModal';
import Sidebar from './src/pages/Sidebar';
import Overview from './src/pages/Overview';
import Members from './src/pages/Members';
import Invitations from './src/pages/Invitations';
import Inventory from './src/pages/Inventory';
import Files from './src/pages/Files';
import KvEditorModal from './src/pages/KvEditorModal';
import DuplicateKvModal from './src/pages/DuplicateKvModal';
import UploadFileModal from './src/pages/UploadFileModal';
import DuplicateFileModal from './src/pages/DuplicateFileModal';
import SettingsPanel from './src/pages/SettingsPanel';
import { CHUNKED_UPLOAD_MIN_SIZE, hasMinRole } from '@api/components/user-space';
import type {
  DefaultGroupInfo,
  GroupInvitationView,
  GroupMemberView,
  GroupSummary,
  KvListResult,
  KvTagCount,
  KvVersionView,
  KvView,
  FileAccessLevel,
  FileListResult,
  FileUploadProgress,
  FileView,
  ViewMode,
} from './src/types';

const VIEW_TABS: { key: ViewMode; label: string }[] = [
  { key: 'overview', label: '概览' },
  { key: 'members', label: '成员' },
  { key: 'invitations', label: '邀请' },
  { key: 'inventory', label: 'KV 库存' },
  { key: 'files', label: '文件' },
];

export default function UserSpace() {
  const auth = useJwtAuth();
  const loginModal = useLoginModal();
  const { groups, defaultGroupId, loading, error, reload, store } = useUserSpaceStore();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [view, setView] = useState<ViewMode>('overview');
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // 当前默认工作空间 {groupId, name, myRole} —— 顶部默认徽章展示 name+role。
  // store.getDefaultGroupInfo() 失败时也会回占位(由 store 内部 catch),
  // UI 永远拿到一个稳定形态,不需再判空。
  const [defaultGroupInfo, setDefaultGroupInfo] = useState<DefaultGroupInfo | null>(null);

  // ── 各视图子状态 ─────────────────────────────────
  const [members, setMembers] = useState<GroupMemberView[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);

  const [invitations, setInvitations] = useState<GroupInvitationView[]>([]);
  const [invitationsLoading, setInvitationsLoading] = useState(false);
  const [invitationsError, setInvitationsError] = useState<string | null>(null);

  const [kv, setKv] = useState<KvListResult | null>(null);
  const [kvLoading, setKvLoading] = useState(false);
  const [kvError, setKvError] = useState<string | null>(null);
  const [kvPage, setKvPage] = useState(1);
  const [kvTag, setKvTag] = useState<string | null>(null);
  // KV tag facet(组内全部成员的 tag 频次),与 kv 列表并行拉;空 tag 集合时
  // Inventory tag 下拉只显示「所有 tag」,不显示任何选项。后端契约 GET /kv/tags
  // ?groupId=...,由 store.listKvTags 包,接口职责清晰。
  const [kvTags, setKvTags] = useState<KvTagCount[]>([]);
  const [kvEditorOpen, setKvEditorOpen] = useState(false);
  const [kvEditorMode, setKvEditorMode] = useState<'create' | 'edit'>('create');
  const [kvEditorInit, setKvEditorInit] = useState<KvView | null>(null);
  const [kvVersions, setKvVersions] = useState<KvVersionView[]>([]);
  const [kvVersionsLoading, setKvVersionsLoading] = useState(false);
  // 复制 KV → 其他工作空间 的 modal 态。
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateSource, setDuplicateSource] = useState<KvView | null>(null);
  // 复制成功的瞬时反馈(顶部 banner);与 actionError(失败 banner)分开,避免互相覆盖。
  const [duplicateToast, setDuplicateToast] = useState<string | null>(null);
  // KV 每页条数 —— 可设置(设置面板),持久化到 LS
  const [kvPageSize, setKvPageSize] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem('sl-us:v1:kvPageSize'));
      return [10, 20, 50].includes(v) ? v : 10;
    } catch { return 10; }
  });
  // 文件 tab 复用 KV 每页条数(共享 LS key + 同一个 value;Files.tsx 仅
  // read-only,改尺寸走 changeKvPageSize)。避免再加一个独立设置 / LS 键。
  const filesPageSize = kvPageSize;
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 移动端 sidebar 抽屉开关(≤640px 有效);切组后也自动关闭,避免遮挡新视图。
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── 文件 tab 子状态(镜像 KV 库存) ────────────
  // tag facet 后端未提供 (YAGNI),UI 从列表内 items 收集 tag,与 KV 库存
  // 一致行为。displayName = fileId[:8] 唯一展示名,见 FileView 注释。
  const [files, setFiles] = useState<FileListResult | null>(null);
  const [filesLoading, setFilesLoading] = useState(false);
  // 保留原始 Error 对象(用来在 Files.tsx 里识别 ApiError.code === 50 「permission denied」)。
  // 不直接 toString,避免丢 code / stack。
  const [filesError, setFilesError] = useState<unknown | null>(null);
  const [filesErrorAction, setFilesErrorAction] = useState<'list' | 'upload' | 'patch' | 'delete' | 'duplicate' | null>(null);
  const [filesPage, setFilesPage] = useState(1);
  const [filesTag, setFilesTag] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  // 分片上传:进度(null = 直传/未开始)+ 取消句柄(软取消,见 handleUploadFileChunked)
  const [uploadProgress, setUploadProgress] = useState<FileUploadProgress | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const [duplicateFileOpen, setDuplicateFileOpen] = useState(false);
  const [duplicateFileSource, setDuplicateFileSource] = useState<FileView | null>(null);
  // 复制文件成功时的瞬时 banner(顶部提示,8s 后自动消失,与 KV 复制一致)。
  const [fileToast, setFileToast] = useState<string | null>(null);

  // 改每页条数 → 回到第 1 页
  function changeKvPageSize(n: number): void {
    setKvPageSize(n);
    try { localStorage.setItem('sl-us:v1:kvPageSize', String(n)); } catch { /* ignore */ }
    setKvPage(1);
  }

  // 拉当前默认工作空间 {groupId, name, myRole} —— 顶部默认徽章展示用。
  // 与列表 reload 同步:登录态变 / 切默认组 / 退登 → 重拉。
  useEffect(() => {
    if (auth.jwtAuthState !== 'logged-in' || !auth.token) {
      setDefaultGroupInfo(null);
      return;
    }
    let cancelled = false;
    store.getDefaultGroupInfo()
      .then((info) => { if (!cancelled) setDefaultGroupInfo(info); })
      .catch(() => { if (!cancelled) setDefaultGroupInfo({ groupId: 0, name: '', myRole: 'reader' }); });
    return () => { cancelled = true; };
  }, [auth.jwtAuthState, auth.token, store]);

  // 选中态:默认进第一个组 / 用户手动选过的优先
  const currentSelected = useMemo(() => {
    if (selectedId && groups?.some((g) => g.id === selectedId)) return selectedId;
    if (defaultGroupId && groups?.some((g) => g.id === defaultGroupId)) return defaultGroupId;
    if (groups && groups.length > 0) return groups[0].id;
    return null;
  }, [selectedId, defaultGroupId, groups]);

  const selectedGroup: GroupSummary | null = useMemo(() => {
    if (!currentSelected || !groups) return null;
    return groups?.find((g) => g.id === currentSelected) ?? null;
  }, [currentSelected, groups]);

  // 写权限:reader 只读,writer+ 才有写操作
  const canWrite = selectedGroup ? hasMinRole(selectedGroup.myRole, 'writer') : false;

  // 切换组时清空子视图缓存,避免脏数据
  useEffect(() => {
    setMembers([]);
    setInvitations([]);
    setKv(null);
    setKvPage(1);
    setKvTag(null);
    setKvTags([]);
    setKvEditorOpen(false);
    setKvVersions([]);
    setDuplicateOpen(false);
    setDuplicateSource(null);
    setMembersError(null);
    setInvitationsError(null);
    setKvError(null);
    setFiles(null);
    setFilesPage(1);
    setFilesTag(null);
    setUploadOpen(false);
    setUploadProgress(null);
    uploadAbortRef.current?.abort();
    setDuplicateFileOpen(false);
    setDuplicateFileSource(null);
    setFilesError(null);
    setFilesErrorAction(null);
  }, [currentSelected]);

  // ── 各视图 lazy load ───────────────────────────────
  const loadMembers = useCallback(async () => {
    if (!currentSelected) return;
    setMembersLoading(true);
    setMembersError(null);
    try {
      const list = await store.listMembers(currentSelected);
      setMembers(list);
    } catch (e) {
      setMembersError(e instanceof Error ? e.message : 'load members failed');
    } finally {
      setMembersLoading(false);
    }
  }, [currentSelected, store]);

  const loadInvitations = useCallback(async () => {
    if (!currentSelected) return;
    setInvitationsLoading(true);
    setInvitationsError(null);
    try {
      const list = await store.listInvitations(currentSelected);
      setInvitations(list);
    } catch (e) {
      setInvitationsError(e instanceof Error ? e.message : 'load invitations failed');
    } finally {
      setInvitationsLoading(false);
    }
  }, [currentSelected, store]);

  const loadKv = useCallback(async (page: number, tag: string | null) => {
    if (!currentSelected) return;
    setKvLoading(true);
    setKvError(null);
    try {
      const result = await store.listKvs(currentSelected, { page, pageSize: kvPageSize, tags: tag ? [tag] : undefined });
      setKv(result);
    } catch (e) {
      setKvError(e instanceof Error ? e.message : 'load kv failed');
    } finally {
      setKvLoading(false);
    }
  }, [currentSelected, store, kvPageSize]);

  // KV tag facet —— 组内全部成员的 tag 频次。失败不阻塞列表(下拉只显示「所有 tag」)。
  // 与 kv 列表并行拉(loadKv / loadKvTags 在 view==='inventory' effect 同步调用)。
  // CRUD 完成后要重新拉 —— 单条 tag 修改可能新增/删除 facet 条目。
  const loadKvTags = useCallback(async () => {
    if (!currentSelected) return;
    try {
      const list = await store.listKvTags(currentSelected);
      setKvTags(list);
    } catch {
      // facet 失败不阻断 inventory;降级到空下拉
      setKvTags([]);
    }
  }, [currentSelected, store]);

// 文件列表 —— tag 由后端传给 list,UI 自行从 items 收集(无 facet)。
  const loadFiles = useCallback(async (page: number, tag: string | null) => {
    if (!currentSelected) return;
    setFilesLoading(true);
    setFilesError(null);
    setFilesErrorAction('list');
    try {
      const result = await store.listFiles(currentSelected, {
        page,
        pageSize: kvPageSize,
        tags: tag ? [tag] : undefined,
      });
      setFiles(result);
    } catch (e) {
      setFilesError(e);
    } finally {
      setFilesLoading(false);
    }
  }, [currentSelected, store, kvPageSize]);

  useEffect(() => {
    if (view === 'members') void loadMembers();
    if (view === 'invitations') void loadInvitations();
    if (view === 'inventory') {
      // kv 列表 + tag facet 并行 —— facet 失败不阻塞列表,各自降级
      void loadKv(kvPage, kvTag);
      void loadKvTags();
    }
    if (view === 'files') {
      void loadFiles(filesPage, filesTag);
    }
  }, [view, loadMembers, loadInvitations, loadKv, loadKvTags, loadFiles, kvPage, kvTag, filesPage, filesTag]);

  // 打开编辑弹窗时拉一次版本历史;创建模式不拉。恢复成功后父级会 setKvEditorInit
  // 换新引用,本 effect 随之重跑,自动刷新版本列表(restore 会新拍一份快照)。
  useEffect(() => {
    if (!kvEditorOpen || kvEditorMode !== 'edit' || !currentSelected || !kvEditorInit) {
      setKvVersions([]);
      return;
    }
    let cancelled = false;
    setKvVersionsLoading(true);
    store.listKvVersions(currentSelected, kvEditorInit.key)
      .then((vers) => { if (!cancelled) setKvVersions(vers); })
      .catch(() => { if (!cancelled) setKvVersions([]); })
      .finally(() => { if (!cancelled) setKvVersionsLoading(false); });
    return () => { cancelled = true; };
  }, [kvEditorOpen, kvEditorMode, currentSelected, kvEditorInit, store]);

  // ── 动作封装(展示态) ──────────────────────────────
  async function withError(fn: () => Promise<void>): Promise<void> {
    setActionError(null);
    setSaving(true);
    try {
      await fn();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '操作失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate(name: string, description: string): Promise<void> {
    await withError(async () => {
      const created = await store.createGroup({ name, description });
      await reload();
      setSelectedId(created.id);
    });
  }

  async function handleSetDefault(id: number): Promise<void> {
    await withError(async () => {
      await store.setDefaultGroup(id);
      await reload();
    });
  }

  async function handleSaveOverview(args: { name?: string; description?: string }): Promise<void> {
    if (!currentSelected) return;
    await withError(async () => {
      await store.updateGroup(currentSelected, args);
      await reload();
    });
  }

  async function handleLeave(): Promise<void> {
    if (!currentSelected) return;
    await withError(async () => {
      await store.leaveGroup(currentSelected);
      setSelectedId(null);
      await reload();
    });
  }

  async function handleDissolve(): Promise<void> {
    if (!currentSelected) return;
    await withError(async () => {
      await store.dissolveGroup(currentSelected);
      setSelectedId(null);
      await reload();
    });
  }

  async function handleChangeRole(userId: number, role: GroupMemberView['role']): Promise<void> {
    if (!currentSelected) return;
    await withError(async () => {
      await store.changeMemberRole(currentSelected, userId, role);
      await loadMembers();
    });
  }

  async function handleRemoveMember(userId: number): Promise<void> {
    if (!currentSelected) return;
    await withError(async () => {
      await store.removeMember(currentSelected, userId);
      await loadMembers();
    });
  }

  async function handleCreateInvite(args: {
    inviteeEmail: string;
    role: Exclude<GroupInvitationView['role'], 'owner'>;
    maxUses?: number;
    ttlSeconds?: number;
  }): Promise<GroupInvitationView> {
    if (!currentSelected) throw new Error('no group selected');
    let created: GroupInvitationView | null = null;
    await withError(async () => {
      created = await store.createInvitation(currentSelected, args);
      await loadInvitations();
    });
    if (!created) throw new Error('create invitation failed');
    return created;
  }

  async function handleRevokeInvite(invitationId: number): Promise<void> {
    if (!currentSelected) return;
    await withError(async () => {
      await store.revokeInvitation(currentSelected, invitationId);
      await loadInvitations();
    });
  }

  async function handleAccept(code: string): Promise<GroupSummary> {
    let joined: GroupSummary | null = null;
    await withError(async () => {
      joined = await store.acceptInvitation(code);
      await reload();
      setSelectedId(joined!.id);
    });
    if (!joined) throw new Error('accept failed');
    return joined;
  }

  // ── KV CRUD handlers ─────────────────────────────
  async function handleCreateKv(payload: { key: string; value: string; tags: string[]; ttl: number; visibility?: 'public' | 'private' }): Promise<void> {
    if (!currentSelected) return;
    await withError(async () => {
      await store.createKv(currentSelected, payload);
      setKvEditorOpen(false);
      setKvPage(1); // 新建后回到第一页,新 key 在前
      await Promise.all([loadKv(1, kvTag), loadKvTags()]);
    });
  }

  async function handleUpdateKv(payload: { key: string; value: string; tags: string[]; ttl: number; visibility?: 'public' | 'private' }): Promise<void> {
    if (!currentSelected) return;
    await withError(async () => {
      await store.updateKv(currentSelected, payload);
      setKvEditorOpen(false);
      await Promise.all([loadKv(kvPage, kvTag), loadKvTags()]);
    });
  }

  async function handleDeleteKv(item: KvView): Promise<void> {
    if (!currentSelected) return;
    await withError(async () => {
      await store.deleteKv(currentSelected, item.key);
      // 末页删空则回退一页
      let nextPage = kvPage;
      if (kv && kv.items.length === 1 && kvPage > 1) {
        nextPage = kvPage - 1;
        setKvPage(nextPage);
      }
      await Promise.all([loadKv(nextPage, kvTag), loadKvTags()]);
    });
  }

  async function handleRestoreKv(version: number): Promise<void> {
    if (!currentSelected || !kvEditorInit) return;
    if (!window.confirm(`确认将 KV「${kvEditorInit.key}」回滚到版本 v${version}?\n当前值会被覆盖(仍可从版本历史回退)。`)) return;
    await withError(async () => {
      await store.restoreKv(currentSelected, kvEditorInit.key, version);
      // 回滚本质是 set:重新拉详情刷新编辑框 value(initial 换新引用,弹窗 effect 重跑)
      // + 刷新列表预览;版本列表由上面的 effect 随 kvEditorInit 变化自动重拉。
      const detail = await store.getKvDetail(currentSelected, kvEditorInit.key);
      setKvEditorInit(detail);
      await Promise.all([loadKv(kvPage, kvTag), loadKvTags()]);
    });
  }

  // 把 sourceItem.key 从当前组复制到另一个 group。DuplicateKvModal 已经过滤
  // 掉源组 + 只留 writer+ 候选,所以这里不再二次校验。成功 → 关弹窗 + 顶部
  // 短暂 banner(复用 .sl-us-success 样式,见渲染处)+ reload 当前源组列表
  // (复制对源组视图没影响,但 brief 要求 onReload,保持与 create/update/delete 一致)。
  async function handleDuplicateKv(args: { targetGroupId: number }): Promise<{ newKey: string }> {
    if (!currentSelected || !duplicateSource) {
      throw new Error('no kv to duplicate');
    }
    let newKey = '';
    await withError(async () => {
      const res = await store.duplicateKv({
        key: duplicateSource.key,
        sourceGroupId: currentSelected,
        targetGroupId: args.targetGroupId,
      });
      newKey = res.newKey;
      setDuplicateOpen(false);
      setDuplicateSource(null);
      setDuplicateToast(`已复制为「${newKey}」`);
      await loadKv(kvPage, kvTag);
    });
    return { newKey };
  }

  /**
   * 复制 KV 公开读链接到剪贴板(供 Inventory 行内「🔗」按钮 / 编辑弹窗内按钮调用)。
   * 公开链接:`{origin}/api/v1/kv/public/{key}?groupId={groupId}`。
   * 不发起请求——纯字符串拼接 + navigator.clipboard.writeText,失败降级
   * execCommand(老浏览器 / 非安全上下文)。
   * 成功 → 顶部 toast「已复制公开链接…」(3s 自动消失,复用 duplicateToast 状态机)。
   */
  async function handleCopyPublicLink(item: KvView): Promise<void> {
    if (!currentSelected) return;
    const url = store.getKvPublicUrl({ key: item.key, groupId: currentSelected });
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setDuplicateToast(`已复制公开链接:${item.key}`);
    } catch {
      setActionError('复制公开链接失败,请手动复制');
    }
  }

  // ── 文件 CRUD handlers ────────────────────────
  // accessLevel 永远发完整值(行内 select 总是发完整对象;后端 PATCH pointer 字段)。
  // delete 确认文案用 displayName (= fileId[:8] 截断)。
  //
  // 上传双路径:≥ CHUNKED_UPLOAD_MIN_SIZE(10MB)走分片(进度 + 断点续传 +
  // 秒传),小文件保持单发直传。分片路径不用 withError:取消(AbortError)要
  // 静默处理(toast 提示可续传),不能落进全局 error banner;错误 rethrow 给
  // UploadFileModal 在弹窗内联展示(submitError),因为全局 banner 被弹窗遮罩挡住。
  async function handleUploadFile(args: { file: File; tags: string[] }): Promise<void> {
    if (!currentSelected) return;
    if (args.file.size >= CHUNKED_UPLOAD_MIN_SIZE) {
      await handleUploadFileChunked(currentSelected, args);
      return;
    }
    await withError(async () => {
      await store.uploadFile(currentSelected, { file: args.file, tags: args.tags });
      setUploadOpen(false);
      setFilesError(null);
      setFilesErrorAction(null);
      setFilesPage(1); // 新建后回到第一页,新文件出现在前
      await loadFiles(1, filesTag);
    }).catch((e) => { setFilesError(e); setFilesErrorAction('upload'); });
  }

  async function handleUploadFileChunked(groupId: number, args: { file: File; tags: string[] }): Promise<void> {
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    setUploadProgress(null);
    setActionError(null);
    setSaving(true);
    try {
      const res = await store.uploadFileChunked(groupId, { file: args.file, tags: args.tags }, {
        onProgress: setUploadProgress,
        signal: controller.signal,
      });
      setUploadOpen(false);
      setFileToast(
        res.instant
          ? '秒传完成:文件已存在,直接引用'
          : res.skippedChunks > 0
            ? `已续传完成(跳过 ${res.skippedChunks} 片)`
            : '上传成功',
      );
      setFilesError(null);
      setFilesErrorAction(null);
      setFilesPage(1);
      await loadFiles(1, filesTag);
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        // 软取消:服务端会话保留(uploading),重传同文件 init 即 resume 续传
        setUploadOpen(false);
        setFileToast('已取消;重新上传同一文件可断点续传');
        return;
      }
      setFilesError(e);
      setFilesErrorAction('upload');
      throw e; // UploadFileModal catch 后在弹窗内联展示(全局 banner 被遮罩挡住)
    } finally {
      setSaving(false);
      setUploadProgress(null);
      uploadAbortRef.current = null;
    }
  }

  /** 分片上传「停止上传」:abort 当前 controller(编排器抛 AbortError 软取消)。 */
  function handleCancelUpload(): void {
    uploadAbortRef.current?.abort();
  }

  async function handleAccessLevelChange(item: FileView, accessLevel: FileAccessLevel): Promise<void> {
    if (!currentSelected) return;
    await withError(async () => {
      await store.updateFileMeta(currentSelected, item.fileId, { accessLevel });
      setFilesError(null);
      setFilesErrorAction(null);
      await loadFiles(filesPage, filesTag);
    }).catch((e) => { setFilesError(e); setFilesErrorAction('patch'); });
  }

  async function handleDeleteFile(item: FileView): Promise<void> {
    if (!currentSelected) return;
    if (!window.confirm(`删除文件「${item.displayName}」?`)) return;
    await withError(async () => {
      await store.deleteFile(currentSelected, item.fileId);
      // 末页删空则回退一页
      let nextPage = filesPage;
      if (files && files.items.length === 1 && filesPage > 1) {
        nextPage = filesPage - 1;
        setFilesPage(nextPage);
      }
      setFilesError(null);
      setFilesErrorAction(null);
      await loadFiles(nextPage, filesTag);
    }).catch((e) => { setFilesError(e); setFilesErrorAction('delete'); });
  }

  // 把 sourceFile 从当前组复制到另一个 group。DuplicateFileModal 已经过滤
  // 掉源组 + 只留 writer+ 候选。
  async function handleDuplicateFile(args: { targetGroupId: number }): Promise<{ newFileId: string }> {
    if (!currentSelected || !duplicateFileSource) {
      throw new Error('no file to duplicate');
    }
    let newFileId = '';
    await withError(async () => {
      const res = await store.duplicateFile({
        fileId: duplicateFileSource.fileId,
        sourceGroupId: currentSelected,
        targetGroupId: args.targetGroupId,
      });
      newFileId = res.fileId;
      setDuplicateFileOpen(false);
      setDuplicateFileSource(null);
      setFileToast(`已复制为「${res.fileId.slice(0, 8)}」`);
      setFilesError(null);
      setFilesErrorAction(null);
      await loadFiles(filesPage, filesTag);
    }).catch((e) => { setFilesError(e); setFilesErrorAction('duplicate'); });
    return { newFileId };
  }

  // fileToast 自动消失:8s 后清空,避免长时间挂着旧消息。
  useEffect(() => {
    if (!fileToast) return;
    const t = setTimeout(() => setFileToast(null), 8000);
    return () => clearTimeout(t);
  }, [fileToast]);

  // duplicateToast 自动消失:8s 后清空,避免长时间挂着旧消息。
  useEffect(() => {
    if (!duplicateToast) return;
    const t = setTimeout(() => setDuplicateToast(null), 8000);
    return () => clearTimeout(t);
  }, [duplicateToast]);

  // ── 渲染 ─────────────────────────────────────────
  if (auth.jwtAuthState !== 'logged-in' || !auth.token) {
    return (
      <div className="sl-us-root sl-us-gate">
        <div className="sl-us-gate__card">
          <h2 className="sl-us-gate__title">用户空间</h2>
          <p className="sl-us-gate__desc">
            登录后查看工作空间、成员、邀请和 KV 库存。
          </p>
          <button
            className="sl-us-btn sl-us-btn--primary"
            onClick={loginModal.open}
          >
            登录
          </button>
        </div>
      </div>
    );
  }

  if (loading && (!groups || groups.length === 0)) {
    return (
      <div className="sl-us-root sl-us-gate">
        <div className="sl-us-gate__card">
          <span className="sl-us-muted">正在加载工作空间…</span>
        </div>
      </div>
    );
  }

  if (error && (!groups || groups.length === 0)) {
    return (
      <div className="sl-us-root sl-us-gate">
        <div className="sl-us-gate__card">
          <h2 className="sl-us-gate__title">加载失败</h2>
          <p className="sl-us-error">{error}</p>
          <button
            className="sl-us-btn"
            onClick={() => void reload()}
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  const safeGroups = groups ?? [];

  return (
    <div className="sl-us-root">
      {/* drawer backdrop —— 仅 mobile 显(mobile @media 才 display: block),桌面 no-op */}
      <div
        className={sidebarOpen ? 'sl-us-side-backdrop is-open' : 'sl-us-side-backdrop'}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />
      <Sidebar
        open={sidebarOpen}
        groups={safeGroups}
        selectedGroupId={currentSelected}
        defaultGroupId={defaultGroupId}
        userEmail={auth.jwtUser?.email ?? null}
        onSelect={(id) => { setSelectedId(id); setSidebarOpen(false); }}
        onCreate={(name, description) => handleCreate(name, description)}
        onSetDefault={(id) => handleSetDefault(id)}
        onOpenSettings={() => setSettingsOpen(true)}
        disabled={saving}
      />

      <main className="sl-us-main">
        {actionError && (
          <div className="sl-us-error">{actionError}</div>
        )}
        {duplicateToast && (
          <div className="sl-us-toast" role="status">{duplicateToast}</div>
        )}
        {fileToast && (
          <div className="sl-us-toast" role="status">{fileToast}</div>
        )}

        {selectedGroup ? (
          <>
            <div className="sl-us-topbar">
              <button
                className="sl-us-topbar__burger"
                onClick={() => setSidebarOpen((v) => !v)}
                aria-label="切换工作空间列表"
                aria-expanded={sidebarOpen}
              >
                ☰
              </button>
              <div className="sl-us-topbar__title">{selectedGroup.name}</div>
              <span className="sl-us-topbar__crumb-sep">/</span>
              <div className="sl-us-topbar__crumb">{VIEW_TABS.find((t) => t.key === view)?.label}</div>
              <span className="sl-us-topbar__spacer" />
              <span className={`sl-us-chip sl-us-chip--${selectedGroup.myRole}`}>
                {selectedGroup.myRole.toUpperCase()}
              </span>
              {selectedGroup.isDefault && (
                <span className="sl-us-chip sl-us-chip--default">
                  {defaultGroupInfo?.name
                    ? `${defaultGroupInfo.name} · ${defaultGroupInfo.myRole.toUpperCase()}`
                    : '默认'}
                </span>
              )}
            </div>

            <nav className="sl-us-tabs">
              {(() => {
                // tab 上的 count:让用户一眼看到每个视图有多少条(懒加载中时显示 ?)
                const counts: Record<ViewMode, number | null> = {
                  overview: null,
                  members: members.length || selectedGroup.memberCount,
                  invitations: invitations.length,
                  inventory: kv?.total ?? null,
                  files: files?.total ?? null,
                };
                return VIEW_TABS.map((t) => (
                  <button
                    key={t.key}
                    className={`sl-us-tab ${view === t.key ? 'is-active' : ''}`}
                    onClick={() => setView(t.key)}
                  >
                    {t.label}
                    {counts[t.key] !== null && (
                      <span className="sl-us-tab__count">{counts[t.key]}</span>
                    )}
                  </button>
                ));
              })()}
            </nav>

            {view === 'overview' && (
              <Overview
                group={selectedGroup}
                defaultGroupName={groups?.find((g) => g.id === defaultGroupId)?.name ?? null}
                saving={saving}
                onSave={handleSaveOverview}
                onSetDefault={() => handleSetDefault(selectedGroup.id)}
                onLeave={handleLeave}
                onDissolve={handleDissolve}
              />
            )}
            {view === 'members' && (
              <Members
                group={selectedGroup}
                members={members}
                loading={membersLoading}
                error={membersError}
                saving={saving}
                onChangeRole={handleChangeRole}
                onRemove={handleRemoveMember}
                onReload={loadMembers}
              />
            )}
            {view === 'invitations' && (
              <Invitations
                group={selectedGroup}
                invitations={invitations}
                loading={invitationsLoading}
                error={invitationsError}
                saving={saving}
                onCreate={handleCreateInvite}
                onRevoke={handleRevokeInvite}
                onReload={loadInvitations}
                onAcceptExternal={handleAccept}
              />
            )}
            {view === 'inventory' && (
              <>
                <Inventory
                  group={selectedGroup}
                  kv={kv}
                  loading={kvLoading}
                  error={kvError}
                  saving={saving}
                  page={kvPage}
                  pageSize={kvPageSize}
                  selectedTag={kvTag}
                  tags={kvTags}
                  onPageChange={(p) => setKvPage(p)}
                  onTagChange={(t) => { setKvTag(t); setKvPage(1); }}
                  onCreate={() => { setKvEditorMode('create'); setKvEditorInit(null); setKvEditorOpen(true); }}
                  onEdit={(item) => { setKvEditorMode('edit'); setKvEditorInit(item); setKvEditorOpen(true); }}
                  onDelete={handleDeleteKv}
                  onDuplicate={(item) => { setDuplicateSource(item); setDuplicateOpen(true); }}
                  onCopyPublicLink={(item) => void handleCopyPublicLink(item)}
                  onReload={() => loadKv(kvPage, kvTag)}
                />
                <KvEditorModal
                  open={kvEditorOpen}
                  mode={kvEditorMode}
                  initial={kvEditorInit}
                  saving={saving}
                  canWrite={canWrite}
                  versions={kvVersions}
                  versionsLoading={kvVersionsLoading}
                  groupId={currentSelected}
                  groupName={selectedGroup.name}
                  getPublicUrl={(args) => store.getKvPublicUrl(args)}
                  onRestoreVersion={(v) => void handleRestoreKv(v)}
                  onSave={kvEditorMode === 'create' ? handleCreateKv : handleUpdateKv}
                  onClose={() => setKvEditorOpen(false)}
                />
                <DuplicateKvModal
                  open={duplicateOpen}
                  sourceGroup={selectedGroup}
                  sourceKey={duplicateSource?.key ?? ''}
                  groups={safeGroups}
                  saving={saving}
                  onDuplicate={handleDuplicateKv}
                  onClose={() => { setDuplicateOpen(false); setDuplicateSource(null); }}
                />
              </>
            )}
            {view === 'files' && (
              <>
                <Files
                  group={selectedGroup}
                  files={files}
                  loading={filesLoading}
                  error={filesError}
                  errorAction={filesErrorAction}
                  saving={saving}
                  page={filesPage}
                  pageSize={filesPageSize}
                  selectedTag={filesTag}
                  onPageChange={(p) => setFilesPage(p)}
                  onTagChange={(t) => { setFilesTag(t); setFilesPage(1); }}
                  onUpload={() => setUploadOpen(true)}
                  onAccessLevelChange={handleAccessLevelChange}
                  onDuplicate={(item) => { setDuplicateFileSource(item); setDuplicateFileOpen(true); }}
                  onDelete={handleDeleteFile}
                  onReload={() => loadFiles(filesPage, filesTag)}
                />
                <UploadFileModal
                  open={uploadOpen}
                  saving={saving}
                  progress={uploadProgress}
                  onCancelUpload={handleCancelUpload}
                  onUpload={handleUploadFile}
                  onClose={() => setUploadOpen(false)}
                />
                <DuplicateFileModal
                  open={duplicateFileOpen}
                  sourceGroup={selectedGroup}
                  sourceFile={duplicateFileSource}
                  groups={safeGroups}
                  saving={saving}
                  onDuplicate={handleDuplicateFile}
                  onClose={() => { setDuplicateFileOpen(false); setDuplicateFileSource(null); }}
                />
              </>
            )}
          </>
        ) : (
          <div className="sl-us-empty">
            <h3>还没有工作空间</h3>
            <p>在左侧点击「+ 新建工作空间」创建第一个组。</p>
          </div>
        )}
      </main>

      {/* 设置面板 —— 组件自己的偏好,不接管登录/退出 */}
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        kvPageSize={kvPageSize}
        onChangeKvPageSize={changeKvPageSize}
        defaultGroupName={groups?.find((g) => g.id === defaultGroupId)?.name ?? null}
      />
    </div>
  );
}
