// services/kvV1/index.ts —— /api/v1/kv/* 后端接口(SPEC §3 D1)。
//
// 继承 HttpService 基类(../../base.ts),与 userV1 同构。
//
// 鉴权(Bearer JWT)由 setBearerProvider 注入。
// 401 由 request.ts 处理:有 Bearer → jwtAuth.handleUnauthorized(静默降级 JWT 态)。
//
// tag 契约(与后端对齐):Set 带 tags(replace 语义),List 支持 tags=重复参数 +
// match=any|all 过滤,GET /kv/tags 返回 facet。见 dev_ctr_hello
// user-kv-invitecode skill 的 [[client-api]] / [[kv-multi-tag]]。

import { HttpService } from '../base';
import { apiPaths } from '../../registry';
import type {
  KvItem,
  KvListArgs,
  KvListResponse,
  KvSetArgs,
  KvSetVisibilityArgs,
  KvGetArgs,
  KvDeleteArgs,
  KvTagCount,
  KvVersionInfo,
  KvDuplicateArgs,
  KvDuplicateResponse,
  KvPublicGetArgs,
  KvPublicItem,
} from './types';

export { ApiError } from '../base';
export type {
  KvItem,
  KvListResponse,
  KvListArgs,
  KvSetArgs,
  KvSetVisibilityArgs,
  KvGetArgs,
  KvDeleteArgs,
  KvTagCount,
  KvVersionInfo,
  KvDuplicateArgs,
  KvDuplicateResponse,
  KvPublicGetArgs,
  KvPublicItem,
} from './types';

export class KvV1Service extends HttpService {
  readonly BASE = apiPaths.kvV1;

  async set(args: KvSetArgs): Promise<void> {
    const body: {
      key: string;
      value: string;
      ttl: number;
      tags: string[];
      groupId?: number;
      visibility?: 'public' | 'private';
    } = {
      key: args.key,
      value: args.value,
      ttl: args.ttl ?? 0,
      // replace 语义:传了就用,没传默认 [] = 清空
      tags: args.tags ?? [],
    };
    if (args.groupId !== undefined && args.groupId > 0) body.groupId = args.groupId;
    // 仅显式传入时写入；缺省不带字段，避免把其它业务 KV 误改成 public
    if (args.visibility === 'public' || args.visibility === 'private') {
      body.visibility = args.visibility;
    }
    await this.reqPost('', body);
  }

  async get(args: KvGetArgs): Promise<KvItem> {
    const qs = args.groupId && args.groupId > 0 ? `?groupId=${args.groupId}` : '';
    return this.reqGet<KvItem>(`/${encodeURIComponent(args.key)}${qs}`);
  }

  async delete(args: KvDeleteArgs): Promise<void> {
    const qs = args.groupId && args.groupId > 0 ? `?groupId=${args.groupId}` : '';
    await this.reqDelete(`/${encodeURIComponent(args.key)}${qs}`);
  }

  async list(args: KvListArgs = {}): Promise<KvListResponse> {
    const qs = new URLSearchParams();
    if (args.limit !== undefined) qs.set('limit', String(args.limit));
    if (args.offset !== undefined) qs.set('offset', String(args.offset));
    if (args.groupId !== undefined && args.groupId > 0) qs.set('groupId', String(args.groupId));
    // tags 是重复参数(tags=a&tags=b = 含 a 或 b);match=all 表示全部命中
    for (const tag of args.tags ?? []) qs.append('tags', tag);
    if (args.match) qs.set('match', args.match);
    const path = `${qs.toString() ? `?${qs}` : ''}`;
    return this.reqGet<KvListResponse>(path);
  }

  /** GET /kv/tags —— 当前用户非过期 KV 的 {tag, count} facet(按 count desc / tag asc)。
   *  后端响应是 `{tags: [{tag,count}, ...]}`(KvTagsRes),信封解一层后拿 data.tags。 */
  async tags(args: { groupId?: number } = {}): Promise<KvTagCount[]> {
    const qs = args.groupId && args.groupId > 0 ? `?groupId=${args.groupId}` : '';
    const res = await this.reqGet<{ tags: KvTagCount[] }>(`/tags${qs}`);
    return res?.tags ?? [];
  }

  /** GET /kv/:key/versions —— 历史版本摘要(version_no / value_len / replaced_at,不回 value 全文)。read+。 */
  async versions(args: { key: string; groupId?: number }): Promise<KvVersionInfo[]> {
    const qs = args.groupId && args.groupId > 0 ? `?groupId=${args.groupId}` : '';
    const res = await this.reqGet<{ versions: KvVersionInfo[] }>(`/${encodeURIComponent(args.key)}/versions${qs}`);
    return res.versions;
  }

  /** POST /kv/:key/restore —— 回滚到指定版本(write+)。本质是 Set:快照当前值 + set/restore 双审计。 */
  async restore(args: { key: string; version: number; groupId?: number }): Promise<void> {
    const body: { version: number; groupId?: number } = { version: args.version };
    if (args.groupId !== undefined && args.groupId > 0) body.groupId = args.groupId;
    await this.reqPost(`/${encodeURIComponent(args.key)}/restore`, body);
  }

  /** POST /kv/:key/duplicate —— 把 KV 从 sourceGroupId 复制到 targetGroupId(源 read+,目标 write+)。
   * 后端 key 冲突自动加 _copy 后缀;caller 须对两端组都有权限。 */
  async duplicate(args: KvDuplicateArgs): Promise<KvDuplicateResponse> {
    const body: { sourceGroupId?: number; targetGroupId: number } = {
      targetGroupId: args.targetGroupId,
    };
    if (args.sourceGroupId !== undefined && args.sourceGroupId > 0) body.sourceGroupId = args.sourceGroupId;
    return this.reqPost<KvDuplicateResponse>(`/${encodeURIComponent(args.key)}/duplicate`, body);
  }

  /** POST /kv/:key/visibility —— 切换可见性(write+)。独立于 Set,避免普通覆盖写
   *  把 public 静默打回 private(后端 Set 的 visibility *string 行为)。审计写入
   *  `set_public` / `set_private`。 */
  async setVisibility(args: KvSetVisibilityArgs): Promise<void> {
    const body: { visibility: 'public' | 'private'; groupId?: number } = {
      visibility: args.visibility,
    };
    if (args.groupId !== undefined && args.groupId > 0) body.groupId = args.groupId;
    await this.reqPost(`/${encodeURIComponent(args.key)}/visibility`, body);
  }

  /**
   * 构造 KV 公开读 URL(供 UI 「复制公开链接」按钮调用)。不发起请求,纯字符串拼接。
   *
   * 后端契约(SPEC §3):`GET /api/v1/kv/public/:key?groupId=<必填>`,无鉴权,
   * 仅放行 `visibility='public'` 且未过期的行。`groupId` 必填是必须的——key 只
   * 在组内唯一(`UNIQUE(group_id, key)`),跨组可能撞名。
   *
   * 返回完整 URL(`window.location.origin` 兜底,SSR/单元测试环境没有 location 时
   * 退到空字符串)。调用方拿到后直接 `navigator.clipboard.writeText`。
   */
  getPublicUrl(args: { key: string; groupId: number }): string {
    const key = encodeURIComponent(args.key);
    const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
    return `${origin}${apiPaths.kvV1}/public/${key}?groupId=${args.groupId}`;
  }

  /**
   * 匿名公开读 `GET /kv/public/:key?groupId=<必填>`。
   * 不带 JWT(走无鉴权公开读 Controller);仅放行 `visibility='public'` 且未过期。
   * 失败(404 / 50 / 其他)按 ApiError 抛出,调用方用 try/catch 接管。
   *
   * 与 `get` 的关键区别:`get` 走组内 RBAC 通道需 Bearer + read+;`getPublic`
   * 任何人(匿名)都能读,但只能读 public 行。这是「分享 URL」场景的主力方法
   * —— 比如 github-show 接收 `?groupId=42&key=...` 公开链接,直接拉别人分享的项目列表。
   */
  async getPublic(args: KvPublicGetArgs): Promise<KvPublicItem> {
    const qs = `?groupId=${args.groupId}`;
    return this.reqGet<KvPublicItem>(`/public/${encodeURIComponent(args.key)}${qs}`);
  }
}

export const kvV1Service = new KvV1Service();

