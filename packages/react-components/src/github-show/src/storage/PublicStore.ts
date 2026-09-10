// src/storage/PublicStore.ts —— github-show 公开分享模式用的只读 store。
//
// 入口:URL 带 `?groupId=N[&key=...]` 时由 useGithubShow 选用。
// 不走登录态(匿名也能用),也不写回(KV 只读)。
// load() 走 `GET /api/v1/kv/public/:key?groupId=`;save() 直接抛错 ——
// 公开分享模式不能改别人的 KV,任何 mutate() 都被外层 hook 拦截成 no-op。

import { kvV1Service } from '@api/services';
import { ApiError } from '@api/services/base';
import { parseDoc } from '@api/components/github-show/docSchema';
import type { GithubShowDoc } from '@api/components/github-show/types';
import { emptyDoc } from '@api/components/github-show/types';

export interface PublicGithubShowStoreArgs {
  key: string;
  groupId: number;
}

export class PublicGithubShowStore {
  constructor(private readonly args: PublicGithubShowStoreArgs) {}

  async load(): Promise<GithubShowDoc> {
    let item;
    try {
      item = await kvV1Service.getPublic({ key: this.args.key, groupId: this.args.groupId });
    } catch (e) {
      // 把 ApiError(404 / 50 等)转成普通 Error,useGithubShow 统一展示。
      // 保留原 message 便于排查;code 50 = key not found / 非 public(后端统一返 50)。
      const msg = e instanceof ApiError ? `${e.code}: ${e.message}` : e instanceof Error ? e.message : String(e);
      throw new Error(`公开分享加载失败 — ${msg}`);
    }
    try {
      return parseDoc(JSON.parse(item.value));
    } catch {
      // value 不是合法 JSON → 兜底空文档,让 UI 走「该公开分享为空」分支
      return emptyDoc();
    }
  }

  /** 公开分享模式只读。任何写入调用都会被外层 hook 的 readOnly 守卫拦截,
   *  此处再兜一道抛错,防止误用(避免静默丢写)。 */
  async save(): Promise<void> {
    throw new Error('公开分享模式只读,不能保存');
  }
}
