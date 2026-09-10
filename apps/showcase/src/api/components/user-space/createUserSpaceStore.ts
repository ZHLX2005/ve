// api/components/user-space/createUserSpaceStore.ts —— user-space 业务封装。
//
// 职责:把 groupV1Service / groupInvitationV1Service / userV1Service / kvV1Service
// 的通用 HTTP 读写,包成 user-space 组件要的 listGroups / createGroup / members /
// invitations / createKv / listKvs 等业务动作。组件只认这些语义,不认后端协议。
//
// 为什么 import 走相对路径而不是 '@api':
//   '@api' 解析到 api/index.ts,而 index.ts 又 `export * from './components'`
//   —— 本文件正在 components 里,形成 self-cycle(index → components → store →
//   index)。ESM 循环虽然能靠 hoisting 侥幸跑通,但求值顺序取决于谁先被 import,
//   一旦有人在 index 顶层加副作用就会拿到 undefined。**目录内部一律走相对
//   路径,'@api' 只留给 src/api/ 外部调用方。**
//
// 关键决策:
//   - 后端 DTO 有 `description: string`(无效空串),UI 统一转 `''` 兜底
//   - createInvitation 后端用 admin / writer / reader;owner 不允许
//   - isDefault / isSelf 由前端按 callerUserId + callerDefaultGroupId 推断
//   - KV CRUD 走 kvV1Service 的 groupId 契约:Set/Delete 需 owner|admin|writer,
//     Get/List 任意成员。listKvs 复用后端 list 自带 value 全文,消除 N+1;
//     toKvView 只做预览截断,不再逐条 get(visibility 已废弃)。

import { jwtAuth } from '../../http/auth-store';
import {
  groupV1Service,
  groupInvitationV1Service,
  userV1Service,
  kvV1Service,
  fileV1Service,
} from '../../services';
import type {
  GroupMemberView,
  GroupSummary,
  GroupInvitationView,
  KvDuplicateArgs,
  KvDuplicateResponse,
  KvListResult,
  KvView,
  KvVersionView,
  KvTagCount,
  KvEditorPayload,
  KvSetVisibilityArgs,
  UserSpaceStore,
  ShortcutsBlob,
  FileView,
  FileListResult,
  FileAccessLevel,
  FileDuplicateArgs,
  FileDuplicateResponse,
  FileUploadChunkedResult,
  FileUploadProgress,
} from './types';
import type { DefaultGroupInfo } from '../../services/userV1/types';
import type { FileInfo } from '../../services/fileV1/types';
import { ApiError } from '../../services/base';
import { resolveFileUrl } from '../../tools/file-url';
import { uploadFileInChunks } from './chunked-upload';

const VALUE_PREVIEW_MAX = 80;

/** shortcut-library 业务封装用的固定 KV key(user-space 不暴露给其他用途)。
 * 走默认 group(0 = caller.default_group_id),由前端组装整库 JSON 写入。 */
// key 与 tag 同名('shortcut-library'),与 user-kv-invitecode 技能的「tag 区分
// 不同组件数据」模式一致;让 listByTag 扫出来时一眼能对到本组件,也让 API 路径
// /api/v1/kv/shortcut-library 自解释,不需要看文档就知道归属。
const SHORTCUTS_KV_KEY = 'shortcut-library';

function normalizeDescription(desc: string | undefined | null): string {
  return (desc ?? '').trim();
}

function toGroupSummary(input: {
  id: number;
  name: string;
  description: string;
  ownerId: number;
  myRole: GroupSummary['myRole'];
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}, isDefault: boolean): GroupSummary {
  return {
    id: input.id,
    name: input.name,
    description: normalizeDescription(input.description),
    myRole: input.myRole,
    memberCount: input.memberCount,
    ownerId: input.ownerId,
    isDefault,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

function toKvView(kv: { key: string; value: string; expires_at: string; groupId: number; groupName: string; myRole: KvView['myRole']; tags?: string[]; visibility?: 'public' | 'private' }): KvView {
  return {
    key: kv.key,
    value: kv.value,
    valuePreview: kv.value.length > VALUE_PREVIEW_MAX ? kv.value.slice(0, VALUE_PREVIEW_MAX) + '…' : kv.value,
    valueLength: kv.value.length,
    tags: kv.tags ?? [],
    groupId: kv.groupId,
    groupName: kv.groupName,
    myRole: kv.myRole,
    expiresAt: kv.expires_at,
    // 老后端不返回 visibility → 兜底 private,UI 行为与旧版一致(无公开链接按钮)。
    visibility: kv.visibility ?? 'private',
  };
}

function toKvVersionView(v: { version_no: number; value_len: number; replaced_at: string }): KvVersionView {
  return { versionNo: v.version_no, valueLen: v.value_len, replacedAt: v.replaced_at };
}

/** FileInfo → FileView 映射器。后端未补 originalName,前端用 fileId 前 8 hex
 *  派生 displayName(32 hex 8 字符 = 16^8 = 2^32 几乎不可能碰撞,见 plan 风险 6)。
 *  isPreviewable = public + image MIME;只有 public + image 才能在 UI 出缩略图。
 *  fileKind 用于决定出图类型(text/image/other),UI 按钮图标 / 类型文案按此渲染。 */
function toFileView(info: FileInfo): FileView {
  return {
    fileId: info.fileId,
    url: resolveFileUrl(info.url),
    displayName: info.fileId.slice(0, 8),
    accessLevel: info.accessLevel,
    size: info.size,
    contentType: info.contentType,
    groupId: info.groupId,
    groupName: info.groupName,
    myRole: info.myRole,
    tags: info.tags ?? [],
    md5: info.md5,
    sha256: info.sha256,
    createdAt: info.createdAt,
    expireAt: info.expireAt,
    isPreviewable: info.accessLevel === 'public' && info.contentType.startsWith('image/'),
    fileKind: info.contentType.startsWith('image/')
      ? 'image'
      : info.contentType.startsWith('text/')
        ? 'text'
        : 'other',
    // 后端 2026-08-10 起的缩略图档位;老文件 / 非图片 / md5 dedup 命中 → undefined
    thumbnails: info.thumbnails?.map((t) => ({
      ...t,
      url: resolveFileUrl(t.url),
    })),
  };
}

export function createUserSpaceStore(): UserSpaceStore {
  function requireAuth(): { userId: number } {
    const user = jwtAuth.state.jwtUser;
    if (!user || jwtAuth.state.jwtAuthState !== 'logged-in') {
      throw new Error('not logged in');
    }
    return { userId: user.id };
  }

  async function resolveDefaultGroupId(): Promise<number | null> {
    // 顺序:
    //   1) GET /user/default-group(优先;后端契约稳定后这才是单一事实源)
    //   2) 兜底:jwtUser.defaultGroupId(legacy DTO)
    //   3) 兜底:listGroups() 挑第一个(caller 注册时一定有「个人空间」组,
    //      所以 pick-first 不会误中其他组;多组用户显式 setDefaultGroup
    //      后就走路径 1 了)
    // 用处:仅给 user-space 多组管理 UI(decorate / 各种 group CRUD 返回
    // isDefault)用。shortcut-library 的 get/set 不调这里 —— 它直接不传
    // groupId,让后端 KV 端点自己走 default(见 [[client-api]] §6「groupId
    // 0 或不传 → 回退到 caller 的 default_group_id」),更省事也更准。
    try {
      const info = await userV1Service.getDefaultGroup();
      if (info.groupId > 0) return info.groupId;
      // 未设置(后端返 groupId=0):不走兜底 pick-first —— 避免把「第一个组」
      // 误当默认。UI 此时不展示默认徽章。
      return null;
    } catch {
      // 网络/401/500 → 继续走兜底
    }
    const cached = jwtAuth.state.jwtUser;
    if (cached?.defaultGroupId && cached.defaultGroupId > 0) return cached.defaultGroupId;
    try {
      const { groups } = await groupV1Service.list();
      if (groups.length > 0) return groups[0].id;
    } catch {
      // 全部失败
    }
    return null;
  }

  async function decorate(groups: GroupSummary[]): Promise<GroupSummary[]> {
    const defaultId = await resolveDefaultGroupId();
    return groups.map((g) => ({ ...g, isDefault: defaultId === g.id }));
  }

  // ── 列表 / 详情 ─────────────────────────────────

  async function listGroups(): Promise<GroupSummary[]> {
    requireAuth();
    const { groups } = await groupV1Service.list();
    return decorate(groups.map((g) => toGroupSummary(g, false)));
  }

  async function getGroupDetail(id: number): Promise<GroupSummary> {
    requireAuth();
    const { group } = await groupV1Service.detail(id);
    return toGroupSummary(group, (await resolveDefaultGroupId()) === id);
  }

  async function getDefaultGroupId(): Promise<number | null> {
    requireAuth();
    return resolveDefaultGroupId();
  }

  /** 拉当前默认组的 {groupId, name, myRole};供 UI 顶部徽章展示 name+role。
   * 未设置返回 groupId=0/name=''/myRole='reader' 的占位。失败同样降级到占位
   * —— UI 永远拿得到一个稳定形态,不需再判空。 */
  async function getDefaultGroupInfo(): Promise<DefaultGroupInfo> {
    requireAuth();
    try {
      return await userV1Service.getDefaultGroup();
    } catch {
      // request.ts 已对 401 静默降级;这里继续吞掉其它失败 → UI 拿到占位
      return { groupId: 0, name: '', myRole: 'reader' };
    }
  }

  // ── CRUD ─────────────────────────────────────────

  async function createGroup(args: { name: string; description?: string }): Promise<GroupSummary> {
    requireAuth();
    const { group } = await groupV1Service.create({
      name: args.name.trim(),
      description: normalizeDescription(args.description),
    });
    return toGroupSummary(group, (await resolveDefaultGroupId()) === group.id);
  }

  async function updateGroup(id: number, args: { name?: string; description?: string }): Promise<GroupSummary> {
    requireAuth();
    const payload: { name?: string; description?: string } = {};
    if (args.name !== undefined) payload.name = args.name.trim();
    if (args.description !== undefined) payload.description = normalizeDescription(args.description);
    const { group } = await groupV1Service.update(id, payload);
    return toGroupSummary(group, (await resolveDefaultGroupId()) === id);
  }

  async function dissolveGroup(id: number): Promise<void> {
    requireAuth();
    await groupV1Service.dissolve(id);
  }

  async function leaveGroup(id: number): Promise<void> {
    requireAuth();
    await groupV1Service.leave(id);
  }

  async function setDefaultGroup(id: number): Promise<void> {
    requireAuth();
    await userV1Service.setDefaultGroup(id);
    // 拉一次 /user/info 同步 jwtUser 快照(email / nickname / 等可能变化)。
    // 注意:后端 DTO 历史上不返 defaultGroupId(legacy),所以 refreshUser
    // 不会让 resolveDefaultGroupId 走路径 1 —— 它继续走 listGroups 兜底。
    // shortcut-library 走 KV 端点的 default 解析,完全不依赖这条路径。
    await jwtAuth.refreshUser();
  }

  // ── 成员管理 ─────────────────────────────────────

  async function listMembers(id: number): Promise<GroupMemberView[]> {
    const { userId: callerId } = requireAuth();
    const { members } = await groupV1Service.members(id);
    return members.map((m) => ({
      userId: m.userId,
      email: m.email,
      nickname: m.nickname,
      role: m.role,
      joinedAt: m.joinedAt,
      isSelf: m.userId === callerId,
    }));
  }

  async function changeMemberRole(id: number, userId: number, role: GroupMemberView['role']): Promise<void> {
    requireAuth();
    await groupV1Service.changeMemberRole(id, userId, role);
  }

  async function removeMember(id: number, userId: number): Promise<void> {
    requireAuth();
    await groupV1Service.removeMember(id, userId);
  }

  // ── 邀请 ─────────────────────────────────────────

  async function listInvitations(id: number): Promise<GroupInvitationView[]> {
    requireAuth();
    const { invitations } = await groupV1Service.invitations(id);
    return invitations.map((inv) => ({
      id: inv.id,
      code: inv.code,
      inviterUserId: inv.inviterUserId,
      inviteeEmail: inv.inviteeEmail,
      role: inv.role,
      maxUses: inv.maxUses,
      usedCount: inv.usedCount,
      expiresAt: inv.expiresAt,
      status: inv.status,
      createdAt: inv.createdAt,
    }));
  }

  async function createInvitation(
    id: number,
    args: { inviteeEmail: string; role: Exclude<GroupMemberView['role'], 'owner'>; maxUses?: number; ttlSeconds?: number },
  ): Promise<GroupInvitationView> {
    requireAuth();
    const { invitation } = await groupV1Service.createInvitation(id, {
      inviteeEmail: args.inviteeEmail.trim(),
      role: args.role,
      maxUses: args.maxUses,
      ttlSeconds: args.ttlSeconds,
    });
    return {
      id: invitation.id,
      code: invitation.code,
      inviterUserId: invitation.inviterUserId,
      inviteeEmail: invitation.inviteeEmail,
      role: invitation.role,
      maxUses: invitation.maxUses,
      usedCount: invitation.usedCount,
      expiresAt: invitation.expiresAt,
      status: invitation.status,
      createdAt: invitation.createdAt,
    };
  }

  async function revokeInvitation(id: number, invitationId: number): Promise<void> {
    requireAuth();
    // id(group)当前不用 —— 撤销端点只接受邀请记录 id。保留参数是为了
    // 与 UserSpaceStore 接口签名一致(将来后端按 group 校验权限时再启用)。
    void id;
    await groupInvitationV1Service.revoke(invitationId);
  }

  async function acceptInvitation(code: string): Promise<GroupSummary> {
    requireAuth();
    const { group } = await groupInvitationV1Service.accept({ code: code.trim() });
    return toGroupSummary(group, (await resolveDefaultGroupId()) === group.id);
  }

  // ── KV CRUD ─────────────────────────────────────
  // 权限(后端 contract):Set/Delete → owner|admin|writer;Get/List → 任意成员。
  // createKv/updateKv 都是 set 的 upsert(按 key 覆盖);ttl 秒,0=永久。

  async function createKv(groupId: number, args: KvEditorPayload): Promise<void> {
    requireAuth();
    await kvV1Service.set({
      key: args.key,
      value: args.value,
      ttl: args.ttl,
      tags: args.tags,
      groupId,
      visibility: args.visibility,
    });
  }

  async function updateKv(groupId: number, args: KvEditorPayload): Promise<void> {
    requireAuth();
    await kvV1Service.set({
      key: args.key,
      value: args.value,
      ttl: args.ttl,
      tags: args.tags,
      groupId,
      // args.visibility 省略时 = 不带 visibility 字段 → 后端保留现有可见态(防覆盖写把 public 打回 private)
      visibility: args.visibility,
    });
  }

  async function deleteKv(groupId: number, key: string): Promise<void> {
    requireAuth();
    await kvV1Service.delete({ key, groupId });
  }

  async function getKvDetail(groupId: number, key: string): Promise<KvView> {
    requireAuth();
    return toKvView(await kvV1Service.get({ key, groupId }));
  }

  async function listKvs(groupId: number, opts: { page: number; pageSize: number; tags?: string[] }): Promise<KvListResult> {
    requireAuth();
    const { items, total } = await kvV1Service.list({
      limit: opts.pageSize,
      offset: (opts.page - 1) * opts.pageSize,
      tags: opts.tags,
      groupId,
    });
    return { items: items.map(toKvView), total, page: opts.page, pageSize: opts.pageSize };
  }

  async function listKvTags(groupId: number): Promise<KvTagCount[]> {
    requireAuth();
    return kvV1Service.tags({ groupId });
  }

  async function listKvVersions(groupId: number, key: string): Promise<KvVersionView[]> {
    requireAuth();
    const vers = await kvV1Service.versions({ key, groupId });
    return vers.map(toKvVersionView);
  }

  async function restoreKv(groupId: number, key: string, version: number): Promise<void> {
    requireAuth();
    await kvV1Service.restore({ key, version, groupId });
  }

  async function duplicateKv(args: KvDuplicateArgs): Promise<KvDuplicateResponse> {
    requireAuth();
    return kvV1Service.duplicate(args);
  }

  /** 切换 KV 可见性(独立于 Set,审计 set_public/set_private)。write+。 */
  async function setKvVisibility(args: KvSetVisibilityArgs): Promise<void> {
    requireAuth();
    await kvV1Service.setVisibility(args);
  }

  /** 构造公开读完整 URL(`window.location.origin + /api/v1/kv/public/:key?groupId=`)。不发起请求。 */
  function getKvPublicUrl(args: { key: string; groupId: number }): string {
    return kvV1Service.getPublicUrl(args);
  }

  // ── 文件 CRUD ──────────────────────────────────
  // 权限(后端 contract):upload → owner|admin|writer;delete → owner|admin;
  // patch → owner|admin|writer;list/info → 任意成员。
  // upload 固定 accessLevel='public',由 fileV1Service 内部设;tags replace 语义,
  // 空数组 = 清空。

  async function uploadFile(groupId: number, args: { file: Blob; tags?: string[] }): Promise<FileView> {
    requireAuth();
    return toFileView(await fileV1Service.upload({ file: args.file, groupId, tags: args.tags }));
  }

  // 大文件分片路径:编排逻辑在 ./chunked-upload.ts(hash 遍 → init 三态 →
  // 并发 PUT → complete),这里只做 auth 闸门 + FileInfo → FileView 映射。
  async function uploadFileChunked(
    groupId: number,
    args: { file: File; tags?: string[] },
    opts?: { onProgress?: (p: FileUploadProgress) => void; signal?: AbortSignal },
  ): Promise<FileUploadChunkedResult> {
    requireAuth();
    const res = await uploadFileInChunks({ file: args.file, groupId, tags: args.tags }, opts);
    return {
      file: toFileView(res.file),
      instant: res.instant,
      uploadedChunks: res.uploadedChunks,
      skippedChunks: res.skippedChunks,
    };
  }

  async function listFiles(
    groupId: number,
    opts: { page: number; pageSize: number; tags?: string[] },
  ): Promise<FileListResult> {
    requireAuth();
    const { items, total } = await fileV1Service.list({
      groupId,
      limit: opts.pageSize,
      offset: (opts.page - 1) * opts.pageSize,
      tags: opts.tags,
    });
    return { items: items.map(toFileView), total, page: opts.page, pageSize: opts.pageSize };
  }

  async function updateFileMeta(
    groupId: number,
    fileId: string,
    args: { accessLevel?: FileAccessLevel; tags?: string[] },
  ): Promise<FileView> {
    requireAuth();
    return toFileView(await fileV1Service.patch({ fileId, groupId, ...args }));
  }

  async function deleteFile(groupId: number, fileId: string): Promise<void> {
    requireAuth();
    await fileV1Service.delete({ fileId, groupId });
  }

  async function duplicateFile(args: FileDuplicateArgs): Promise<FileDuplicateResponse> {
    requireAuth();
    return fileV1Service.duplicate(args);
  }

  // ─── 组件业务封装(per-component contract)────────────────────────
  // shortcut-library 的整个库作为单个 KV 整体存取,内部固定 key='shortcuts'。
  // shortcut-library 不知道 KV 协议,也不直接接触 kvV1Service。
  // KV 后端 "键不存在"(code 50)当作首次使用 → 返回空数组(不是故障)。
  //
  // 自愈读(getShortcuts):'shortcuts' blob 不存在时,扫一次 tag=shortcut-library
  // 的全量列表,识别旧 per-item 行(sl-group-* / sl-shortcut-*)→ 合并成新格式 →
  // 写回 'shortcuts' blob → best-effort 删旧行。这样切换 schema 不需要后端迁移
  // 脚本,部署后第一次读用户时自动完成。失败也不阻塞 —— 旧行只会遗留为不可见
  // (组件后续只读写单 blob)。

  const SHORTCUT_TAGS = ['shortcut-library'] as const;
  const LEGACY_GROUP_PREFIX = 'sl-group-';
  const LEGACY_SHORTCUT_PREFIX = 'sl-shortcut-';
  const LEGACY_LIST_PAGE_SIZE = 200;

  function safeParseShortcuts(raw: string): ShortcutsBlob {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as ShortcutsBlob;
      return [];
    } catch {
      return [];
    }
  }

  interface LegacyGroupRecord { id: string; name: string; order: number; createdAt: number; updatedAt: number; }
  interface LegacyShortcutRecord { id: string; groupId: string; order: number; combo: { code: string; label: string; isModifier: boolean }[]; description: string; condition?: string; createdAt: number; updatedAt: number; }
  function isLegacyGroupRecord(x: unknown): x is LegacyGroupRecord {
    return !!x && typeof x === 'object' && typeof (x as LegacyGroupRecord).id === 'string' && typeof (x as LegacyGroupRecord).name === 'string';
  }
  function isLegacyShortcutRecord(x: unknown): x is LegacyShortcutRecord {
    return !!x && typeof x === 'object' && typeof (x as LegacyShortcutRecord).id === 'string' && typeof (x as LegacyShortcutRecord).groupId === 'string';
  }

  /** 把 per-item 旧行合并成新格式 Group[]。 */
  function consolidateLegacy(groups: LegacyGroupRecord[], shortcuts: LegacyShortcutRecord[]): ShortcutsBlob {
    const sorted = [...groups].sort((a, b) => a.order - b.order);
    return sorted.map((g) => ({
      id: g.id,
      name: g.name,
      shortcuts: shortcuts
        .filter((s) => s.groupId === g.id)
        .sort((a, b) => a.order - b.order)
        .map((s) => ({
          id: s.id,
          combo: s.combo,
          description: s.description,
          condition: s.condition,
          createdAt: s.createdAt,
        })),
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
    }));
  }

  /** 拉全量 ?tags=shortcut-library(分页),返回旧行集合。
   *  不传 groupId,后端用 caller 的 default_group_id —— 见 [[client-api]] §6:
   *  「groupId 参数:0 或不传 → 回退到 caller 的 default_group_id」。所以 caller
   *  设了默认组之后,这里不传 groupId 也只会扫到「自己默认组」里的旧 per-item 行,
   *  不会误扫到他组。 */
  async function listLegacyShortcutKeys(): Promise<{ legacyGroups: LegacyGroupRecord[]; legacyShortcuts: LegacyShortcutRecord[]; legacyKeys: string[] }> {
    const legacyGroups: LegacyGroupRecord[] = [];
    const legacyShortcuts: LegacyShortcutRecord[] = [];
    const legacyKeys: string[] = [];
    let offset = 0;
    while (true) {
      let resp: { items?: Array<{ key?: string; value?: string }>; total?: number };
      try {
        resp = await kvV1Service.list({ limit: LEGACY_LIST_PAGE_SIZE, offset, tags: [...SHORTCUT_TAGS] });
      } catch {
        return { legacyGroups, legacyShortcuts, legacyKeys };
      }
      if (!resp || !Array.isArray(resp.items)) return { legacyGroups, legacyShortcuts, legacyKeys };
      if (resp.items.length === 0) break;
      for (const item of resp.items) {
        if (!item || typeof item.key !== 'string') continue;
        if (item.key === SHORTCUTS_KV_KEY) continue; // 新格式 blob,忽略
        if (item.key.startsWith(LEGACY_GROUP_PREFIX)) {
          legacyKeys.push(item.key);
          try { const parsed = JSON.parse(String(item.value ?? '')); if (isLegacyGroupRecord(parsed)) legacyGroups.push(parsed); } catch { /* skip */ }
        } else if (item.key.startsWith(LEGACY_SHORTCUT_PREFIX)) {
          legacyKeys.push(item.key);
          try { const parsed = JSON.parse(String(item.value ?? '')); if (isLegacyShortcutRecord(parsed)) legacyShortcuts.push(parsed); } catch { /* skip */ }
        }
      }
      offset += resp.items.length;
      if (typeof resp.total !== 'number' || offset >= resp.total) break;
    }
    return { legacyGroups, legacyShortcuts, legacyKeys };
  }

  async function getShortcuts(): Promise<ShortcutsBlob> {
    requireAuth();
    // 不传 groupId,后端用 caller 的 default_group_id(见 dev_ctr_hello
    // user-kv-invitecode 技能 [[client-api]] §6:「groupId 参数:0 或不传
    // → 回退到 caller 的 default_group_id」)。这样前端不用解析 groupId,
    // 切默认组后所有组件自动命中。
    //   - 首次用户 default_group_id=NULL → 后端 code 50「no default group」,
    //     被 catch 当成"还没有 blob",继续走自愈扫旧行(可能命中 → 合并 → 写回)
    //   - 已设默认组 → 后端返回 blob 或 404
    try {
      const item = await kvV1Service.get({ key: SHORTCUTS_KV_KEY });
      return safeParseShortcuts(item.value);
    } catch (e) {
      if (!(e instanceof ApiError) || e.code !== 50) throw e;
    }
    // 旧版本兼容:扫 tag 全部 key,识别 per-item 旧行 → 合并 → 写回 → 删旧行
    const { legacyGroups, legacyShortcuts, legacyKeys } = await listLegacyShortcutKeys();
    if (legacyGroups.length === 0 && legacyShortcuts.length === 0) return [];
    const merged = consolidateLegacy(legacyGroups, legacyShortcuts);
    try {
      await kvV1Service.set({
        key: SHORTCUTS_KV_KEY,
        value: JSON.stringify(merged),
        tags: [...SHORTCUT_TAGS],
        ttl: 0,
      });
    } catch {
      // 写不进去也不阻塞本次读
    }
    for (const k of legacyKeys) {
      kvV1Service.delete({ key: k }).catch(() => undefined);
    }
    return merged;
  }

  async function setShortcuts(groups: ShortcutsBlob): Promise<void> {
    requireAuth();
    // 不传 groupId,后端用 default_group_id(见 getShortcuts 注释)。
    await kvV1Service.set({
      key: SHORTCUTS_KV_KEY,
      value: JSON.stringify(groups),
      tags: [...SHORTCUT_TAGS],
      ttl: 0,
    });
  }

  return {
    listGroups,
    getGroupDetail,
    getDefaultGroupId,
    getDefaultGroupInfo,
    createGroup,
    updateGroup,
    dissolveGroup,
    leaveGroup,
    setDefaultGroup,
    listMembers,
    changeMemberRole,
    removeMember,
    listInvitations,
    createInvitation,
    revokeInvitation,
    acceptInvitation,
    createKv,
    updateKv,
    deleteKv,
    getKvDetail,
    listKvs,
    listKvTags,
    listKvVersions,
    restoreKv,
    duplicateKv,
    setKvVisibility,
    getKvPublicUrl,
    uploadFile,
    uploadFileChunked,
    listFiles,
    updateFileMeta,
    deleteFile,
    duplicateFile,
    getShortcuts,
    setShortcuts,
  };
}
