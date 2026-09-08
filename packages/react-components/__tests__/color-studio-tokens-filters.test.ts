import { describe, it, expect } from 'vitest';
import { filterStackToCss } from '../src/color-studio/src/engine/filterCss';
import { normalizeWeights, donutSlicePath } from '../src/color-studio/src/engine/proportional';
import { docSchema } from '../../../apps/showcase/src/api/components/color-studio/docSchema';
import { emptyDoc } from '../../../apps/showcase/src/api/components/color-studio/types';

function entry(id: string, hex: string, weight = 1) {
  return { id, hex, weight, locked: false, note: '', tags: [], createdAt: 1, updatedAt: 1 };
}

describe('filterCss', () => {
  it('enabled filters join in order', () => {
    const out = filterStackToCss([
      { id: '1', type: 'brightness', value: 120, enabled: true },
      { id: '2', type: 'grayscale', value: 50, enabled: true },
    ]);
    expect(out).toBe('brightness(1.20) grayscale(0.50)');
  });

  it('disabled and neutral filters are skipped', () => {
    const out = filterStackToCss([
      { id: '1', type: 'brightness', value: 100, enabled: true },
      { id: '2', type: 'contrast', value: 150, enabled: false },
      { id: '3', type: 'hueRotate', value: 0, enabled: true },
    ]);
    expect(out).toBe('none');
  });

  it('values are clamped', () => {
    const out = filterStackToCss([{ id: '1', type: 'saturate', value: 999, enabled: true }]);
    expect(out).toBe('saturate(3.00)');
  });
});

describe('proportional', () => {
  it('normalizes weights to percentages', () => {
    const slices = normalizeWeights([entry('a', '#111111', 3), entry('b', '#222222', 1)]);
    expect(slices[0].pct).toBe(75);
    expect(slices[1].pct).toBe(25);
  });

  it('all-zero weights distribute evenly', () => {
    const slices = normalizeWeights([entry('a', '#111111', 0), entry('b', '#222222', 0)]);
    expect(slices[0].pct).toBe(50);
    expect(slices[1].pct).toBe(50);
  });

  it('donutSlicePath produces valid arc commands', () => {
    const p = donutSlicePath(100, 100, 90, 50, 0, 25);
    expect(p).toMatch(/^M /);
    expect(p).toContain('A 90 90 0 0 1');
    expect(p).toContain('A 50 50 0 0 0');
    // 半圆用 large-arc 标志
    const half = donutSlicePath(100, 100, 90, 50, 0, 60);
    expect(half).toContain('A 90 90 0 1 1');
  });
});

describe('docSchema migration', () => {
  it('emptyDoc emits 1.3.0 with filterStack/mainView', () => {
    const doc = emptyDoc();
    expect(doc.meta.schemaVersion).toBe('1.3.0');
    expect(doc.filterStack).toEqual([]);
    expect(doc.viewState.mainView).toBe('wheel');
  });

  it('1.1.0 doc migrates: filters empty, mainView wheel', () => {
    const old = emptyDoc() as Record<string, unknown>;
    (old.meta as Record<string, unknown>).schemaVersion = '1.1.0';
    delete old.filterStack;
    (old.viewState as Record<string, unknown>).mainView = undefined;
    const parsed = docSchema.parse(old);
    expect(parsed.meta.schemaVersion).toBe('1.3.0');
    expect(parsed.filterStack).toEqual([]);
    expect(parsed.viewState.mainView).toBe('wheel');
  });

  it('1.0.0 doc migrates through both hops', () => {
    const old = emptyDoc() as Record<string, unknown>;
    (old.meta as Record<string, unknown>).schemaVersion = '1.0.0';
    delete old.filterStack;
    delete (old.viewState as Record<string, unknown>).groupBy;
    const parsed = docSchema.parse(old);
    expect(parsed.meta.schemaVersion).toBe('1.3.0');
    expect(parsed.viewState.groupBy).toBe('none');
    expect(parsed.viewState.mainView).toBe('wheel');
  });

  it('docSchema.parse(emptyDoc()) passes', () => {
    expect(() => docSchema.parse(emptyDoc())).not.toThrow();
  });
});
