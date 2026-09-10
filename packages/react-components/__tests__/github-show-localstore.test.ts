// __tests__/github-show-localstore.test.ts —— 游客本地存储的读写与容错(v1.4.0)。

// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import {
  LocalGithubShowStore,
  GITHUB_SHOW_LS_KEY,
} from '../src/github-show/src/storage/LocalStore';
import { emptyDoc } from '@api/components/github-show/types';

describe('LocalGithubShowStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns empty doc when nothing stored', async () => {
    const store = new LocalGithubShowStore();
    const doc = await store.load();
    expect(doc.rows).toEqual([]);
    expect(doc.meta.schemaVersion).toBe('1.4.0');
  });

  it('round-trips save/load', async () => {
    const store = new LocalGithubShowStore();
    const doc = emptyDoc();
    doc.rows.push({
      id: 'r1',
      repoUrl: 'https://github.com/owner/repo',
      name: 'owner/repo',
      highlights: '亮点',
      insights: '启发',
      output: 'https://demo.example.com',
      values: { c1: '自研' },
      createdAt: 1,
      updatedAt: 1,
    });
    await store.save(doc);

    const loaded = await store.load();
    expect(loaded.rows).toHaveLength(1);
    expect(loaded.rows[0].repoUrl).toBe('https://github.com/owner/repo');
    expect(loaded.rows[0].output).toBe('https://demo.example.com');
    expect(loaded.rows[0].values).toEqual({ c1: '自研' });
  });

  it('falls back to empty doc on corrupt data', async () => {
    localStorage.setItem(GITHUB_SHOW_LS_KEY, 'not-json{');
    const store = new LocalGithubShowStore();
    expect((await store.load()).rows).toEqual([]);
  });

  it('falls back to empty doc on schema mismatch', async () => {
    localStorage.setItem(GITHUB_SHOW_LS_KEY, JSON.stringify({ meta: 'bad', rows: 'bad' }));
    const store = new LocalGithubShowStore();
    expect((await store.load()).rows).toEqual([]);
  });
});
