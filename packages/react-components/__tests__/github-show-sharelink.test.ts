// __tests__/github-show-sharelink.test.ts —— 公开分享 URL 解析 / 构建。
//
// 覆盖:
//   - readPublicParamsFromUrl 各种正常 / 异常输入
//   - buildShareUrl 默认 key 省略、非默认 key 显式带

// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import {
  readPublicParamsFromUrl,
  buildShareUrl,
} from '../src/github-show/src/utils/shareLink';

describe('readPublicParamsFromUrl', () => {
  it('returns null when groupId missing', () => {
    expect(readPublicParamsFromUrl('?key=github-show')).toBeNull();
    expect(readPublicParamsFromUrl('')).toBeNull();
    expect(readPublicParamsFromUrl('?other=1')).toBeNull();
  });

  it('returns null for non-positive / non-integer groupId', () => {
    expect(readPublicParamsFromUrl('?groupId=0')).toBeNull();
    expect(readPublicParamsFromUrl('?groupId=-1')).toBeNull();
    expect(readPublicParamsFromUrl('?groupId=1.5')).toBeNull();
    expect(readPublicParamsFromUrl('?groupId=abc')).toBeNull();
    expect(readPublicParamsFromUrl('?groupId=')).toBeNull();
  });

  it('parses valid groupId with default key', () => {
    expect(readPublicParamsFromUrl('?groupId=42')).toEqual({ key: 'github-show', groupId: 42 });
  });

  it('parses custom key when present', () => {
    expect(readPublicParamsFromUrl('?groupId=42&key=my-cover')).toEqual({
      key: 'my-cover',
      groupId: 42,
    });
  });

  it('treats empty key as default', () => {
    expect(readPublicParamsFromUrl('?groupId=1&key=')).toEqual({ key: 'github-show', groupId: 1 });
    expect(readPublicParamsFromUrl('?key=&groupId=1')).toEqual({ key: 'github-show', groupId: 1 });
  });

  it('trims whitespace around custom key', () => {
    expect(readPublicParamsFromUrl('?groupId=1&key=%20%20my-key%20%20')).toEqual({
      key: 'my-key',
      groupId: 1,
    });
  });

  it('reads from window.location.search when no arg passed', () => {
    // jsdom 默认 url 是 about:blank / no query → 应当返 null(不依赖环境副作用)
    expect(readPublicParamsFromUrl()).toBeNull();
  });
});

describe('buildShareUrl', () => {
  it('omits key when it equals the default', () => {
    const url = buildShareUrl({ groupId: 42, baseHref: 'https://example.com/components/github-show' });
    expect(url).toBe('https://example.com/components/github-show?groupId=42');
  });

  it('includes key when non-default', () => {
    const url = buildShareUrl({
      groupId: 42,
      key: 'my-cover',
      baseHref: 'https://example.com/components/github-show',
    });
    expect(url).toBe(
      'https://example.com/components/github-show?groupId=42&key=my-cover',
    );
  });

  it('strips existing query string from baseHref', () => {
    const url = buildShareUrl({
      groupId: 99,
      baseHref: 'https://example.com/components/github-show?groupId=42&key=foo',
    });
    expect(url).toBe('https://example.com/components/github-show?groupId=99');
  });

  it('preserves pathname / hash / port from baseHref', () => {
    const url = buildShareUrl({
      groupId: 7,
      baseHref: 'https://example.com:8443/components/github-show#section',
    });
    expect(url).toBe('https://example.com:8443/components/github-show?groupId=7#section');
  });
});
