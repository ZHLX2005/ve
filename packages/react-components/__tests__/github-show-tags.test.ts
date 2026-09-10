// __tests__/github-show-tags.test.ts —— 文本/URL 拆分与多选值的序列化解析。

import { describe, it, expect } from 'vitest';
import { findFirstUrl, splitTextWithLinks } from '../src/github-show/src/utils/repo';
import { parseTags, serializeTags } from '../src/github-show/src/utils/tags';

describe('findFirstUrl', () => {
  it('extracts the first http(s) url from mixed text', () => {
    expect(findFirstUrl('演示 https://a.b/c 说明')).toBe('https://a.b/c');
    expect(findFirstUrl('https://a.b/c')).toBe('https://a.b/c');
    expect(findFirstUrl('无链接')).toBe('');
    expect(findFirstUrl('')).toBe('');
  });

  it('strips trailing half-width punctuation from the url', () => {
    expect(findFirstUrl('见 https://a.b/c,后续')).toBe('https://a.b/c');
    expect(findFirstUrl('见 https://a.b/c。')).toBe('https://a.b/c');
  });

  it('does not swallow full-width parentheses that follow the url', () => {
    expect(findFirstUrl('https://vuejs.org/（需登录）')).toBe('https://vuejs.org/');
  });
});

describe('splitTextWithLinks', () => {
  it('splits text and url segments in order', () => {
    expect(splitTextWithLinks('演示 https://a.b/c 说明')).toEqual([
      { text: '演示 ' },
      { url: 'https://a.b/c' },
      { text: ' 说明' },
    ]);
  });

  it('handles multiple urls', () => {
    const parts = splitTextWithLinks('A https://x.dev B https://y.dev C');
    expect(parts).toEqual([
      { text: 'A ' },
      { url: 'https://x.dev' },
      { text: ' B ' },
      { url: 'https://y.dev' },
      { text: ' C' },
    ]);
  });

  it('returns empty for empty input', () => {
    expect(splitTextWithLinks('')).toEqual([]);
    expect(splitTextWithLinks(undefined as unknown as string)).toEqual([]);
  });

  it('strips trailing punctuation from url segments', () => {
    expect(splitTextWithLinks('去 https://a.b/c,然后')).toEqual([
      { text: '去 ' },
      { url: 'https://a.b/c' },
      { text: ',然后' },
    ]);
  });
});

describe('parseTags', () => {
  it('parses JSON array values', () => {
    expect(parseTags('["Vue","TypeScript"]')).toEqual(['Vue', 'TypeScript']);
  });

  it('falls back to comma-separated text', () => {
    expect(parseTags('Vue, TypeScript')).toEqual(['Vue', 'TypeScript']);
    expect(parseTags('Vue，TS')).toEqual(['Vue', 'TS']);
  });

  it('handles empty / whitespace', () => {
    expect(parseTags('')).toEqual([]);
    expect(parseTags(undefined)).toEqual([]);
    expect(parseTags('  ')).toEqual([]);
  });

  it('filters non-string and empty entries from json', () => {
    expect(parseTags('["A", 1, "", "B"]')).toEqual(['A', 'B']);
  });
});

describe('serializeTags', () => {
  it('serializes as a JSON array string', () => {
    expect(serializeTags(['Vue', 'TypeScript'])).toBe('["Vue","TypeScript"]');
  });

  it('dedupes and trims', () => {
    expect(serializeTags(['Vue', ' Vue ', 'Vue', ''])).toBe('["Vue"]');
  });

  it('returns empty string when no tags remain', () => {
    expect(serializeTags([])).toBe('');
    expect(serializeTags(['', ' '])).toBe('');
  });
});

describe('parseTags round-trips with serializeTags', () => {
  it('keeps values stable', () => {
    const serialized = serializeTags(['A', 'B', 'C']);
    expect(parseTags(serialized)).toEqual(['A', 'B', 'C']);
  });
});
