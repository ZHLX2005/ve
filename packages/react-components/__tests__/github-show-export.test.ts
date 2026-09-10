// @vitest-environment jsdom
// exportPdf:渲染到屏幕外容器、html2canvas 截图、jsPDF 分页下载、失败返回 false。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildPrintParts } from '../src/github-show/src/engine/printDoc';
import { exportPdf } from '../src/github-show/src/engine/exportPdf';
import { emptyDoc } from '@api/components/github-show/types';

const h = vi.hoisted(() => {
  const save = vi.fn();
  return {
    html2canvas: vi.fn(() =>
      Promise.resolve({ toDataURL: () => 'data:image/jpeg;base64,abc', width: 794, height: 1600 }),
    ),
    jsPDF: class {
      addPage() {}
      addImage() {}
      save(name: string) {
        save(name);
      }
    },
    save,
  };
});

vi.mock('html2canvas', () => ({ default: h.html2canvas }));
vi.mock('jspdf', () => ({ jsPDF: h.jsPDF }));

function parts() {
  const doc = emptyDoc('a@b.c', 1);
  doc.rows.push({
    id: 'r1',
    repoUrl: 'https://github.com/a/b',
    name: 'a/b',
    highlights: '亮点',
    insights: '启发',
    output: '',
    values: {},
    createdAt: 1,
    updatedAt: 1,
  });
  return buildPrintParts({ doc, generatedAt: '2026-09-10' });
}

beforeEach(() => {
  h.html2canvas.mockClear();
  h.save.mockClear();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('exportPdf', () => {
  it('renders parts into an offscreen container, screenshots and saves', async () => {
    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const ok = await exportPdf(parts(), 'github-show-2026-09-10.pdf');

    expect(ok).toBe(true);
    expect(appendSpy).toHaveBeenCalledTimes(1);
    appendSpy.mockRestore();
    expect(h.html2canvas).toHaveBeenCalledTimes(1);
    expect(h.save).toHaveBeenCalledWith('github-show-2026-09-10.pdf');
    // 容器已清理
    expect(document.querySelectorAll('div[aria-hidden]')).toHaveLength(0);
  });

  it('returns false when screenshot fails', async () => {
    h.html2canvas.mockRejectedValueOnce(new Error('render blocked'));
    const ok = await exportPdf(parts(), 'x.pdf');
    expect(ok).toBe(false);
    expect(h.save).not.toHaveBeenCalled();
    expect(document.querySelectorAll('div[aria-hidden]')).toHaveLength(0);
  });
});
