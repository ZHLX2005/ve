// src/engine/print.ts —— 把 buildPrintHtml 生成的 HTML 送进隐藏 iframe 打印。
//
// 为什么用 iframe 而不是直接 window.print():
//   - 组件跑在 ShadowRoot 里,直接打印会带上 Host 的 fixed/overflow 容器样式
//   - iframe 自包含(内联 CSS),打印输出与屏幕样式完全隔离,PDF 版面稳定
// 打印结束自动移除 iframe,不留残留。

/**
 * 打印一段自包含 HTML。返回 Promise,打印对话框关闭后 resolve。
 * 某些浏览器(如部分移动端)不支持 iframe.print(),此时降级为新窗口打印。
 */
export function printHtml(html: string): Promise<void> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    frame.style.visibility = 'hidden';
    document.body.appendChild(frame);

    const cleanup = () => {
      setTimeout(() => {
        if (frame.parentNode) frame.parentNode.removeChild(frame);
      }, 0);
      resolve();
    };

    frame.onload = () => {
      try {
        const win = frame.contentWindow;
        if (!win) {
          cleanup();
          return;
        }
        const doc = win.document;
        doc.open();
        doc.write(html);
        doc.close();
        // 等渲染完成后打印(部分浏览器需要下一帧)
        win.focus();
        setTimeout(() => {
          win.print();
          cleanup();
        }, 120);
      } catch {
        // 兜底:新窗口打印
        const w = window.open('', '_blank', 'noopener');
        if (w) {
          w.document.write(html);
          w.document.close();
          w.focus();
          w.print();
        }
        cleanup();
      }
    };

    // 一些情况下 onload 不会触发,超时兜底移除
    setTimeout(() => {
      if (frame.parentNode) frame.parentNode.removeChild(frame);
      resolve();
    }, 30_000);
  });
}
