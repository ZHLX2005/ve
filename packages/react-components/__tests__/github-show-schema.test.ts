// __tests__/github-show-schema.test.ts —— docSchema 的版本解析与
// v1.0.0 / v1.1.0 / v1.2.0 / v1.3.0 → v1.4.0 迁移。

import { describe, it, expect } from 'vitest';
import { parseDoc } from '@api/components/github-show/docSchema';
import {
  emptyDoc,
  migrateDocV100,
  migrateDocV110,
  migrateDocV120,
  migrateDocV130,
} from '@api/components/github-show/types';

function v130Doc() {
  return {
    meta: { schemaVersion: '1.3.0', createdAt: 1, updatedAt: 2, authorEmail: 'a@b.c' },
    columns: [{ id: 'c1', title: '技术栈', type: 'text', createdAt: 3 }],
    rows: [
      {
        id: 'r1',
        repoUrl: 'https://github.com/owner/repo',
        name: 'owner/repo',
        highlights: '亮点',
        insights: '启发',
        output: 'https://demo.dev',
        values: { c1: 'TypeScript' },
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  };
}

function v120Doc() {
  return {
    meta: { schemaVersion: '1.2.0', createdAt: 1, updatedAt: 2, authorEmail: 'a@b.c' },
    columns: [{ id: 'c1', title: '技术栈', type: 'text', createdAt: 3 }],
    rows: [
      {
        id: 'r1',
        repoUrl: 'https://github.com/owner/repo',
        name: 'owner/repo',
        highlights: '亮点',
        insights: '启发',
        demoUrl: 'https://demo.dev',
        values: { c1: 'TypeScript' },
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  };
}

function v110Doc() {
  return {
    meta: { schemaVersion: '1.1.0', createdAt: 1, updatedAt: 2, authorEmail: 'a@b.c' },
    columns: [
      { id: 'c1', title: '技术栈', type: 'text', createdAt: 3 },
      { id: 'c2', title: '博客', type: 'link', createdAt: 4 },
    ],
    rows: [
      {
        id: 'r1',
        repoUrl: 'https://github.com/owner/repo',
        name: 'owner/repo',
        highlights: '亮点',
        insights: '启发',
        demoUrl: 'https://demo.dev',
        values: { c1: 'TypeScript', c2: 'https://blog.dev' },
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  };
}

function v100Doc() {
  return {
    meta: { schemaVersion: '1.0.0', createdAt: 1, updatedAt: 2, authorEmail: 'a@b.c' },
    rows: [
      {
        id: 'r1',
        repoUrl: 'https://github.com/owner/repo',
        name: 'owner/repo',
        highlights: '亮点',
        insights: '启发',
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  };
}

describe('parseDoc', () => {
  it('passes through a valid v1.4.0 doc untouched', () => {
    const doc = emptyDoc();
    doc.columns.push({ id: 'c1', title: '评分', type: 'number', createdAt: 1, hiddenInDisplay: false });
    doc.rows.push({
      id: 'r1',
      repoUrl: 'https://github.com/a/b',
      name: 'a/b',
      highlights: '',
      insights: '',
      output: '演示 https://demo.dev',
      values: { c1: '88' },
      createdAt: 1,
      updatedAt: 1,
    });
    const parsed = parseDoc(JSON.parse(JSON.stringify(doc)));
    expect(parsed.meta.schemaVersion).toBe('1.4.0');
    expect(parsed.rows[0].output).toBe('演示 https://demo.dev');
    expect(parsed.columns[0]).toEqual({ id: 'c1', title: '评分', type: 'number', createdAt: 1, hiddenInDisplay: false });
  });

  it('migrates a v1.3.0 doc to v1.4.0 (columns gain hiddenInDisplay)', () => {
    const parsed = parseDoc(v130Doc());
    expect(parsed.meta.schemaVersion).toBe('1.4.0');
    expect(parsed.columns[0]).toEqual({ id: 'c1', title: '技术栈', type: 'text', createdAt: 3, hiddenInDisplay: false });
    expect(parsed.rows[0].output).toBe('https://demo.dev');
  });

  it('migrates a v1.2.0 doc to v1.4.0 (demoUrl renamed to output)', () => {
    const parsed = parseDoc(v120Doc());
    expect(parsed.meta.schemaVersion).toBe('1.4.0');
    expect(parsed.rows[0].output).toBe('https://demo.dev');
    expect((parsed.rows[0] as Record<string, unknown>).demoUrl).toBeUndefined();
    expect(parsed.columns[0].hiddenInDisplay).toBe(false);
    expect(parsed.rows[0].values).toEqual({ c1: 'TypeScript' });
  });

  it('migrates a v1.1.0 doc to v1.4.0 (link columns become text + demoUrl renamed)', () => {
    const parsed = parseDoc(v110Doc());
    expect(parsed.meta.schemaVersion).toBe('1.4.0');
    expect(parsed.columns).toEqual([
      { id: 'c1', title: '技术栈', type: 'text', createdAt: 3, hiddenInDisplay: false },
      { id: 'c2', title: '博客', type: 'text', createdAt: 4, hiddenInDisplay: false },
    ]);
    expect(parsed.rows[0].output).toBe('https://demo.dev');
    expect(parsed.rows[0].values).toEqual({ c1: 'TypeScript', c2: 'https://blog.dev' });
  });

  it('migrates a v1.0.0 doc to v1.4.0 (adds output / values / columns)', () => {
    const parsed = parseDoc(v100Doc());
    expect(parsed.meta.schemaVersion).toBe('1.4.0');
    expect(parsed.columns).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].output).toBe('');
    expect(parsed.rows[0].values).toEqual({});
    expect(parsed.rows[0].highlights).toBe('亮点');
  });

  it('falls back to empty doc on garbage', () => {
    expect(parseDoc(null).rows).toEqual([]);
    expect(parseDoc('nope').rows).toEqual([]);
    expect(parseDoc({ meta: {}, rows: [] }).rows).toEqual([]);
  });
});

describe('migrateDocV100', () => {
  it('keeps row data and bumps schemaVersion', () => {
    const migrated = migrateDocV100(v100Doc() as Parameters<typeof migrateDocV100>[0]);
    expect(migrated.meta.schemaVersion).toBe('1.4.0');
    expect(migrated.rows[0].name).toBe('owner/repo');
    expect(migrated.rows[0].output).toBe('');
    expect(migrated.columns).toEqual([]);
  });
});

describe('migrateDocV110', () => {
  it('normalizes link columns to text and bumps schemaVersion', () => {
    const migrated = migrateDocV110(v110Doc() as Parameters<typeof migrateDocV110>[0]);
    expect(migrated.meta.schemaVersion).toBe('1.4.0');
    expect(migrated.columns.map((c) => c.type)).toEqual(['text', 'text']);
    expect(migrated.rows[0].output).toBe('https://demo.dev');
    expect(migrated.rows[0].values.c2).toBe('https://blog.dev');
  });
});

describe('migrateDocV120', () => {
  it('renames demoUrl to output and bumps schemaVersion', () => {
    const migrated = migrateDocV120(v120Doc() as Parameters<typeof migrateDocV120>[0]);
    expect(migrated.meta.schemaVersion).toBe('1.4.0');
    expect(migrated.rows[0].output).toBe('https://demo.dev');
    expect((migrated.rows[0] as Record<string, unknown>).demoUrl).toBeUndefined();
  });
});

describe('migrateDocV130', () => {
  it('adds hiddenInDisplay=false to every column and bumps schemaVersion', () => {
    const migrated = migrateDocV130(v130Doc() as Parameters<typeof migrateDocV130>[0]);
    expect(migrated.meta.schemaVersion).toBe('1.4.0');
    expect(migrated.columns).toEqual([
      { id: 'c1', title: '技术栈', type: 'text', createdAt: 3, hiddenInDisplay: false },
    ]);
    expect(migrated.rows[0].output).toBe('https://demo.dev');
  });
});
