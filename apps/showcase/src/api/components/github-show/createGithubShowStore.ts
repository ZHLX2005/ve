// apps/showcase/src/api/components/github-show/createGithubShowStore.ts
//
// 业务封装:把整个 GithubShowDoc(JSON blob)整体读写进 kvV1。
// 复用 shortcut-library / color-studio 的单 key + 单 tag + 不传 groupId 范式
// (模型二 single-blob):后端走 caller 的 default_group_id,不传 groupId。
//
// 组件不直接接触 kvV1Service —— 业务封装负责拼成组件语义的 API。

import { kvV1Service } from '../../services';
import { ApiError } from '../../services/base';
import { parseDoc } from './docSchema';
import type { GithubShowDoc } from './types';
import { emptyDoc } from './types';

export const GITHUB_SHOW_KV_KEY = 'github-show';
const GITHUB_SHOW_TAGS = ['github-show'] as const;

export interface GithubShowStoreLite {
  load(): Promise<GithubShowDoc>;
  save(doc: GithubShowDoc): Promise<void>;
  /** 登录态条显示用;cloud store 场景返回 'logged-in' 让 UI 显示已登录。 */
  readonly authState: 'logged-out' | 'logged-in' | 'syncing' | 'error';
}

/**
 * 建一个 github-show 持久化实例。
 * 两个方法都是独立闭包,不依赖 `this` —— 调用方常解构使用。
 */
export function createGithubShowStore(): GithubShowStoreLite {
  async function load(): Promise<GithubShowDoc> {
    try {
      const item = await kvV1Service.get({ key: GITHUB_SHOW_KV_KEY });
      try {
        return parseDoc(JSON.parse(item.value));
      } catch {
        // value 不是合法 JSON → 兜底空文档,不崩
        return emptyDoc();
      }
    } catch (e) {
      // code 50(no default group / key not found)、404、其他网络错误 → 容错空文档
      if (e instanceof ApiError && (e.code === 50 || e.code === 404)) {
        return emptyDoc();
      }
      return emptyDoc();
    }
  }

  async function save(doc: GithubShowDoc): Promise<void> {
    await kvV1Service.set({
      key: GITHUB_SHOW_KV_KEY,
      value: JSON.stringify(doc),
      tags: [...GITHUB_SHOW_TAGS],
      ttl: 0,
    });
  }

  return { load, save, authState: 'logged-in' };
}
