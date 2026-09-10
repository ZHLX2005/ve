// __tests__/github-show-repo.test.ts —— GitHub 链接解析 + 通用链接工具纯函数。

import { describe, it, expect } from 'vitest';
import {
  parseRepoUrl,
  deriveRepoName,
  isGithubUrl,
  normalizeRepoUrl,
  isHttpUrl,
  toHref,
  displayLinkText,
} from '../src/github-show/src/utils/repo';

describe('repo utils', () => {
  it('parses a standard github url', () => {
    expect(parseRepoUrl('https://github.com/vuejs/core')).toEqual({
      owner: 'vuejs',
      repo: 'core',
      full: 'vuejs/core',
    });
  });

  it('accepts http and www variants', () => {
    expect(parseRepoUrl('http://www.github.com/owner/repo')?.full).toBe('owner/repo');
  });

  it('strips .git suffix', () => {
    expect(parseRepoUrl('https://github.com/owner/repo.git')?.repo).toBe('repo');
  });

  it('ignores trailing path (tree/blob)', () => {
    const p = parseRepoUrl('https://github.com/owner/repo/tree/main/src');
    expect(p?.full).toBe('owner/repo');
  });

  it('rejects non-github or malformed urls', () => {
    expect(parseRepoUrl('https://example.com/a/b')).toBeNull();
    expect(parseRepoUrl('https://github.com/single')).toBeNull();
    expect(parseRepoUrl('')).toBeNull();
  });

  it('deriveRepoName returns empty for invalid url', () => {
    expect(deriveRepoName('not a url')).toBe('');
    expect(deriveRepoName('https://github.com/owner/repo')).toBe('owner/repo');
  });

  it('isGithubUrl gates validity', () => {
    expect(isGithubUrl('https://github.com/owner/repo')).toBe(true);
    expect(isGithubUrl('https://gitlab.com/owner/repo')).toBe(false);
  });

  it('normalizeRepoUrl produces canonical form', () => {
    expect(normalizeRepoUrl('https://github.com/owner/repo.git/')).toBe('https://github.com/owner/repo');
    expect(normalizeRepoUrl('  https://github.com/owner/repo  ')).toBe('https://github.com/owner/repo');
    expect(normalizeRepoUrl('plain-text')).toBe('plain-text');
  });

  it('isHttpUrl accepts http/https with host, rejects others', () => {
    expect(isHttpUrl('https://vuejs.org/')).toBe(true);
    expect(isHttpUrl('http://example.com/a?b=1')).toBe(true);
    expect(isHttpUrl('ftp://example.com')).toBe(false);
    expect(isHttpUrl('vuejs.org')).toBe(false);
    expect(isHttpUrl('')).toBe(false);
  });

  it('toHref returns href only for valid urls', () => {
    expect(toHref(' https://demo.dev/x ')).toBe('https://demo.dev/x');
    expect(toHref('not a url')).toBe('');
  });

  it('displayLinkText truncates long urls with ellipsis', () => {
    expect(displayLinkText('https://a.dev')).toBe('https://a.dev');
    const long = `https://example.com/${'x'.repeat(80)}`;
    const out = displayLinkText(long, 48);
    expect(out.length).toBe(48);
    expect(out.endsWith('…')).toBe(true);
  });
});
