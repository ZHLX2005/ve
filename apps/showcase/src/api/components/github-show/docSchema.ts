// apps/showcase/src/api/components/github-show/docSchema.ts
//
// Zod 校验 GithubShowDoc 的 load / save 边界 + v1.0.0 → v1.1.0 迁移。
// 防止 KV 里读到脏数据(手改 / 旧版本 / 部分写入)时把 UI 打崩。

import { z } from 'zod';
import type { GithubShowDoc } from './types';
import { emptyDoc, migrateDocV100 } from './types';

const rowV110Schema = z.object({
  id: z.string().min(1),
  repoUrl: z.string(),
  name: z.string(),
  highlights: z.string(),
  insights: z.string(),
  demoUrl: z.string(),
  values: z.record(z.string(), z.string()),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const columnSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  type: z.enum(['text', 'link']),
  createdAt: z.number(),
});

const docV110Schema = z.object({
  meta: z.object({
    schemaVersion: z.literal('1.1.0'),
    createdAt: z.number(),
    updatedAt: z.number(),
    authorEmail: z.string(),
  }),
  columns: z.array(columnSchema),
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
 * - 合法 v1.1.0 → 原样返回
 * - 合法 v1.0.0 → 迁移到 v1.1.0
 * - 其它(脏数据 / 非 JSON)→ 空文档兜底,不抛异常
 */
export function parseDoc(raw: unknown): GithubShowDoc {
  const v11 = docV110Schema.safeParse(raw);
  if (v11.success) return v11.data;

  const v10 = docV100Schema.safeParse(raw);
  if (v10.success) return migrateDocV100(v10.data);

  return emptyDoc();
}
