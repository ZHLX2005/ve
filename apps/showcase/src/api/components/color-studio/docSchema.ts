// apps/showcase/src/api/components/color-studio/docSchema.ts
//
// Zod 校验 ColorStudioDocument 的导入/导出边界。
// v1.2.0 加 FilterStack / mainView;
// load 1.0.0 / 1.1.0 旧文档自动升级(补默认字段 + schemaVersion bump)。

import { z } from 'zod';

const hexSchema = z.string().regex(/^#[0-9A-F]{6}$/, 'hex must be #RRGGBB uppercase');

const harmonyTypeSchema = z.enum([
  'complementary',
  'triadic',
  'split-complementary',
  'analogous',
  'monochromatic',
]);

const pickHistoryItemSchema = z.object({
  hex: hexSchema,
  source: z.enum(['wheel', 'eyedropper', 'image', 'paste', 'shortcut', 'filter']),
  pickedAt: z.number(),
});

// ── 共享子 schema ──────────────────────────────────────────

const paletteHarmonySchema = z.object({
  type: harmonyTypeSchema,
  anchorColorId: z.string(),
  autoFill: z.boolean(),
});

const paletteSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  colorIds: z.array(z.string()),
  harmony: paletteHarmonySchema.nullable(),
  sortBy: z.enum(['manual', 'hue', 'brightness', 'saturation']),
  createdAt: z.number(),
  updatedAt: z.number(),
});

// ── v1.3.0(当前)──────────────────────────────────────────
// 变更:group/groupBy 废弃(passthrough 保留旧数据);新增 selectedColorId。

const colorEntryV130Schema = z.object({
  id: z.string().min(1),
  hex: hexSchema,
  weight: z.number().min(0).max(100),
  locked: z.boolean(),
  note: z.string(),
  tags: z.array(z.string()),
  group: z.string().optional(), // deprecated,旧数据 passthrough
  derivedFrom: z.object({
    paletteId: z.string(),
    rule: harmonyTypeSchema,
  }).optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const filterTypeSchema = z.enum([
  'brightness', 'contrast', 'saturate', 'hueRotate', 'grayscale', 'sepia', 'invert',
]);

const filterConfigSchema = z.object({
  id: z.string().min(1),
  type: filterTypeSchema,
  value: z.number(),
  enabled: z.boolean(),
});

const viewStateV130Schema = z.object({
  leftPane: z.enum(['palettes', 'picker', 'history']),
  showHarmony: z.boolean(),
  selectedHarmony: harmonyTypeSchema.nullable(),
  brightness: z.number().min(0).max(100),
  groupBy: z.enum(['none', 'group']).optional(), // deprecated
  mainView: z.enum(['wheel', 'proportional', 'brush']),
  selectedColorId: z.string().nullable(),
});

const metaV130Schema = z.object({
  schemaVersion: z.literal('1.3.0'),
  createdAt: z.number(),
  updatedAt: z.number(),
  authorEmail: z.string(),
});

const docV130Schema = z.object({
  meta: metaV130Schema,
  activePaletteId: z.string(),
  palettes: z.array(paletteSchema).min(1),
  colorEntries: z.array(colorEntryV130Schema).min(1),
  filterStack: z.array(filterConfigSchema),
  pickHistory: z.array(pickHistoryItemSchema).max(12),
  viewState: viewStateV130Schema,
});

// ── v1.2.0(legacy:无 selectedColorId)─────────────────────

const viewStateV120Schema = viewStateV130Schema.omit({ selectedColorId: true });
const metaV120Schema = z.object({
  schemaVersion: z.literal('1.2.0'),
  createdAt: z.number(),
  updatedAt: z.number(),
  authorEmail: z.string(),
});
const docV120Schema = z.object({
  meta: metaV120Schema,
  activePaletteId: z.string(),
  palettes: z.array(paletteSchema).min(1),
  colorEntries: z.array(colorEntryV130Schema).min(1),
  filterStack: z.array(filterConfigSchema),
  pickHistory: z.array(pickHistoryItemSchema).max(12),
  viewState: viewStateV120Schema,
});

// ── v1.1.0(legacy:无 token/filter/mainView)───────────────

const colorEntryV110Schema = colorEntryV130Schema;
const viewStateV110Schema = viewStateV120Schema.omit({ mainView: true });
const metaV110Schema = z.object({
  schemaVersion: z.literal('1.1.0'),
  createdAt: z.number(),
  updatedAt: z.number(),
  authorEmail: z.string(),
});
const docV110Schema = z.object({
  meta: metaV110Schema,
  activePaletteId: z.string(),
  palettes: z.array(paletteSchema).min(1),
  colorEntries: z.array(colorEntryV110Schema).min(1),
  pickHistory: z.array(pickHistoryItemSchema).max(12),
  viewState: viewStateV110Schema,
});

// ── v1.0.0(legacy:再少 group / groupBy)───────────────────

const colorEntryV100Schema = colorEntryV110Schema.omit({ group: true });
const viewStateV100Schema = viewStateV110Schema.omit({ groupBy: true });
const metaV100Schema = z.object({
  schemaVersion: z.literal('1.0.0'),
  createdAt: z.number(),
  updatedAt: z.number(),
  authorEmail: z.string(),
});
const docV100Schema = z.object({
  meta: metaV100Schema,
  activePaletteId: z.string(),
  palettes: z.array(paletteSchema).min(1),
  colorEntries: z.array(colorEntryV100Schema).min(1),
  pickHistory: z.array(pickHistoryItemSchema).max(12),
  viewState: viewStateV100Schema,
});

// ── union + 自动迁移到 v1.3.0 ──────────────────────────────

export const docSchema = z
  .union([docV130Schema, docV120Schema, docV110Schema, docV100Schema])
  .transform((d): z.infer<typeof docV130Schema> => {
    if (d.meta.schemaVersion === '1.3.0') return d;
    if (d.meta.schemaVersion === '1.2.0') {
      return {
        ...d,
        meta: { ...d.meta, schemaVersion: '1.3.0' as const },
        viewState: { ...d.viewState, selectedColorId: null },
      };
    }
    if (d.meta.schemaVersion === '1.1.0') {
      return {
        ...d,
        meta: { ...d.meta, schemaVersion: '1.3.0' as const },
        filterStack: [],
        viewState: { ...d.viewState, mainView: 'wheel' as const, selectedColorId: null },
      };
    }
    // 1.0.0
    return {
      ...d,
      meta: { ...d.meta, schemaVersion: '1.3.0' as const },
      filterStack: [],
      viewState: {
        ...d.viewState,
        groupBy: 'none' as const,
        mainView: 'wheel' as const,
        selectedColorId: null,
      },
    };
  });

export type ParsedDoc = z.infer<typeof docV130Schema>;
