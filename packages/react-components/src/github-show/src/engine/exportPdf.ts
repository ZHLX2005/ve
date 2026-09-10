// src/engine/exportPdf.ts —— 直接下载 PDF 文件(jsPDF + html2canvas)。
//
// 与 iframe 打印(print.ts)不同,这里产出真正的 .pdf 文件下载:
//   1. buildPrintParts 生成的 body + CSS 渲染到屏幕外容器(主文档,绕开 Shadow DOM)
//   2. html2canvas 把容器截成位图 —— 中文无需嵌入字体,样式所见即所得
//   3. jsPDF 按 A4 分页 addImage,直接 doc.save() 下载
// html2canvas / jspdf 均为动态导入,导出时才拉取,不增加组件首屏体积。
// 失败返回 false,调用方降级为浏览器打印。

import type { PrintDocParts } from './printDoc';

const PAGE_W = 210; // A4 宽 mm
const PAGE_H = 297; // A4 高 mm
const MARGIN = 10; // 页边距 mm

function waitForImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'));
  return Promise.all(
    imgs.map((img) => {
      if (typeof img.decode === 'function') {
        return img.decode().catch(() => undefined);
      }
      return Promise.resolve(undefined);
    }),
  ).then(() => undefined);
}

/**
 * 生成并下载 PDF。返回 true = 已下载;false = 失败(调用方决定降级策略)。
 */
export async function exportPdf(parts: PrintDocParts, fileName: string): Promise<boolean> {
  const container = document.createElement('div');
  container.setAttribute('aria-hidden', 'true');
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.style.width = '794px'; // ≈ A4 @96dpi 内容宽
  container.style.background = '#ffffff';
  container.style.zIndex = '-1';
  container.innerHTML = `<style>${parts.cssText}</style>${parts.bodyHtml}`;
  document.body.appendChild(container);

  try {
    await waitForImages(container);
    // 双 rAF:等布局与字体排完再截图
    await new Promise<void>((resolve) => {
      const raf: typeof requestAnimationFrame =
        typeof requestAnimationFrame !== 'undefined'
          ? requestAnimationFrame
          : (cb: FrameRequestCallback) => window.setTimeout(() => cb(Date.now()), 16);
      raf(() => raf(() => resolve()));
    });

    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ]);

    const canvas = await html2canvas(container, {
      scale: 2,
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const contentW = PAGE_W - MARGIN * 2;
    // 位图总高(mm),按宽度等比换算
    const contentH = (canvas.height / canvas.width) * contentW;

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const step = PAGE_H - MARGIN * 2;
    let offset = 0;
    let page = 1;
    while (offset < contentH - 1) {
      if (page > 1) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', MARGIN, MARGIN - offset, contentW, contentH);
      offset += step;
      page += 1;
    }
    pdf.save(fileName);
    return true;
  } catch {
    return false;
  } finally {
    if (container.parentNode) container.parentNode.removeChild(container);
  }
}
