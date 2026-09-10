// @vitest-environment jsdom
// printHtml 的 iframe 打印行为:屏幕外可见 iframe、srcdoc 内联、print 调用、清理与降级。

import { describe, it, expect, vi, afterEach } from 'vitest';
import { printHtml } from '../src/github-show/src/engine/print';

const SAMPLE_HTML = '<!doctype html><html><body><h1>PDF</h1></body></html>';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

function setupPrintMock(frame: HTMLIFrameElement): ReturnType<typeof vi.fn> {
  const win = frame.contentWindow;
  const mock = vi.fn();
  if (win) {
    Object.defineProperty(win, 'print', { value: mock, configurable: true, writable: true });
  }
  return mock;
}

describe('printHtml', () => {
  it('creates an offscreen iframe with srcdoc and prints', async () => {
    const promise = printHtml(SAMPLE_HTML);

    const frames = Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe'));
    expect(frames).toHaveLength(1);
    const frame = frames[0];
    // 内容随 srcdoc 内联,无需 doc.write
    expect(frame.srcdoc).toContain('<h1>PDF</h1>');
    // 不是隐藏 iframe:有真实尺寸、可见、位于屏幕外
    expect(frame.style.width).toBe('794px');
    expect(frame.style.minHeight).toBe('1123px');
    expect(frame.style.visibility).not.toBe('hidden');
    expect(frame.style.display).not.toBe('none');
    expect(frame.style.transform).toContain('translateX');

    const printMock = setupPrintMock(frame);
    frame.dispatchEvent(new Event('load'));

    await promise;
    expect(printMock).toHaveBeenCalledTimes(1);

    // 打印后延迟清理
    await new Promise((r) => setTimeout(r, 1100));
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
  });

  it('falls back to a new window when iframe print throws', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const promise = printHtml(SAMPLE_HTML);

    const frame = document.querySelector('iframe');
    expect(frame).not.toBeNull();
    if (frame) {
      const win = frame.contentWindow;
      if (win) {
        Object.defineProperty(win, 'print', {
          value: vi.fn(() => {
            throw new Error('print blocked');
          }),
          configurable: true,
        });
      }
      frame.dispatchEvent(new Event('load'));
    }

    await promise;
    // iframe print 抛错 → 降级 window.open(被拦截返回 null 也不崩)
    expect(openSpy).toHaveBeenCalled();
  });
});
