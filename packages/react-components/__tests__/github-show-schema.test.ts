// __tests__/github-show-schema.test.ts —— docSchema 的版本解析与 v1.0.0 → v1.1.0 迁移。

import { describe, it, expect } from 'vitest';
import { parseDoc } from '@api/components/github-show/docSchema';
import { emptyDoc, migrateDocV100 } from '@api/components/github-show/types';

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
  it('passes through a valid v1.1.0 doc untouched', () => {
    const doc = emptyDoc();
    doc.rows.push({
      id: 'r1',
      repoUrl: 'https://github.com/a/b',
      name: 'a/b',
      highlights: '',
      insights: '',
      demoUrl: 'https://demo.dev',
      values: { c1: 'x' },
      createdAt: 1,
      updatedAt: 1,
    });
    const parsed = parseDoc(JSON.parse(JSON.stringify(doc)));
    expect(parsed.meta.schemaVersion).toBe('1.1.0');
    expect(parsed.rows[0].demoUrl).toBe('https://demo.dev');
    expect(parsed.rows[0].values).toEqual({ c1: 'x' });
  });

  it('migrates a v1.0.0 doc to v1.1.0 (adds demoUrl / values / columns)', () => {
    const parsed = parseDoc(v100Doc());
    expect(parsed.meta.schemaVersion).toBe('1.1.0');
    expect(parsed.columns).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].demoUrl).toBe('');
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
    expect(migrated.meta.schemaVersion).toBe('1.1.0');
    expect(migrated.rows[0].name).toBe('owner/repo');
    expect(migrated.rows[0].demoUrl).toBe('');
    expect(migrated.columns).toEqual([]);
  });
});
