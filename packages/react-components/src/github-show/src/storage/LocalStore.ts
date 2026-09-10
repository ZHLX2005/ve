// src/storage/LocalStore.ts —— 游客模式的本地存储(降级通道)。
//
// 未登录时(无 JWT token)数据只落在 localStorage;登录后无缝迁回 cloud store
// (createGithubShowStore,单 key KV)。与 shortcut-library 的 LSStore 同思路,
// 但这里整份文档(JSON blob)一个 key,不做增量。

import type { GithubShowDoc } from '@api/components/github-show/types';
import { emptyDoc } from '@api/components/github-show/types';
import { parseDoc } from '@api/components/github-show/docSchema';

export const GITHUB_SHOW_LS_KEY = 'sl-github-show:v1';

export class LocalGithubShowStore {
  async load(): Promise<GithubShowDoc> {
    try {
      const raw = localStorage.getItem(GITHUB_SHOW_LS_KEY);
      if (!raw) return emptyDoc();
      return parseDoc(JSON.parse(raw));
    } catch {
      // 无数据 / 脏数据 → 兜底空文档,不崩
      return emptyDoc();
    }
  }

  async save(doc: GithubShowDoc): Promise<void> {
    localStorage.setItem(GITHUB_SHOW_LS_KEY, JSON.stringify(doc));
  }
}
