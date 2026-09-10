// apps/showcase/src/api/components/github-show/docSchema.ts
//
// Zod 校验 GithubShowDoc 的 load / save 边界 + v1.0.0 ~ v1.3.0 → v1.4.0 迁移。
// 防止 KV 里读到脏数据(手改 / 旧版本 / 部分写入)时把 UI 打崩。

import { z } from 'zod';
import type { GithubShowDoc } from './types';
import { emptyDoc, migrateDocV100, migrateDocV110, migrateDocV120, migrateDocV130 } from './types';

const rowSchema = z.object({
  id: z.string().min(1),
  repoUrl: z.string(),
  name: z.string(),
  highlights: z.string(),
  insights: z.string(),
  output: z.string(),
  values: z.record(z.string(), z.string()),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const columnSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  type: z.enum(['text', 'multi-select', 'number']),
  createdAt: z.number(),
  hiddenInDisplay: z.boolean(),
});

const docV140Schema = z.object({
  meta: z.object({
    schemaVersion: z.literal('1.4.0'),
    createdAt: z.number(),
    updatedAt: z.number(),
    authorEmail: z.string(),
  }),
  columns: z.array(columnSchema),
  rows: z.array(rowSchema),
});

const columnV130Schema = columnSchema.omit({ hiddenInDisplay: true });

const docV130Schema = z.object({
  meta: z.object({
    schemaVersion: z.literal('1.3.0'),
    createdAt: z.number(),
    updatedAt: z.number(),
    authorEmail: z.string(),
  }),
  columns: z.array(columnV130Schema),
  rows: z.array(rowSchema),
});

const rowV120Schema = rowSchema.omit({ output: true }).extend({ demoUrl: z.string() });

const columnV120Schema = columnV130Schema;

const docV120Schema = z.object({
  meta: z.object({
    schemaVersion: z.literal('1.2.0'),
    createdAt: z.number(),
    updatedAt: z.number(),
    authorEmail: z.string(),
  }),
  columns: z.array(columnV120Schema),
  rows: z.array(rowV120Schema),
});

const columnV110Schema = z.object({
  id: z.string().min(1),
  title: z.string(),
  type: z.enum(['text', 'link']),
  createdAt: z.number(),
});

const rowV110Schema = rowV120Schema;

const docV110Schema = z.object({
  meta: z.object({
    schemaVersion: z.literal('1.1.0'),
    createdAt: z.number(),
    updatedAt: z.number(),
    authorEmail: z.string(),
  }),
  columns: z.array(columnV110Schema),
  rows: z.array(rowV110Schema),
});

const rowV100Schema = z.object({
  id: z.string().min(1),
  repoUrl: z.string(),
  name: z.string(),
  highlights: z.string(),
  insights: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const docV100Schema = z.object({
  meta: z.object({
    schemaVersion: z.literal('1.0.0'),
    createdAt: z.number(),
    updatedAt: z.number(),
    authorEmail: z.string(),
  }),
  rows: z.array(rowV100Schema),
});

/**
 * 解析 + 迁移一个未知的 KV 值。
 * - 合法 v1.4.0 → 原样返回
 * - 合法 v1.3.0 → 迁移到 v1.4.0(列补 hiddenInDisplay:false)
 * - 合法 v1.2.0 → 迁移到 v1.4.0(demoUrl 更名为 output + 列补 hiddenInDisplay)
 * - 合法 v1.1.0 → 迁移到 v1.4.0(link 列收敛为 text + demoUrl → output)
 * - 合法 v1.0.0 → 迁移到 v1.4.0(补 output / values / columns)
 * - 其它(脏数据 / 非 JSON)→ 空文档兜底,不抛异常
 */
export function parseDoc(raw: unknown): GithubShowDoc {
  const v14 = docV140Schema.safeParse(raw);
  if (v14.success) return v14.data;

  const v13 = docV130Schema.safeParse(raw);
  if (v13.success) return migrateDocV130(v13.data);

  const v12 = docV120Schema.safeParse(raw);
  if (v12.success) return migrateDocV120(v12.data);

  const v11 = docV110Schema.safeParse(raw);
  if (v11.success) return migrateDocV110(v11.data);

  const v10 = docV100Schema.safeParse(raw);
  if (v10.success) return migrateDocV100(v10.data);

  return emptyDoc();
}
