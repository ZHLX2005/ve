// src/engine/print.ts —— 把 buildPrintHtml 生成的 HTML 送进屏幕外 iframe 打印。
//
// 为什么不用隐藏 iframe:display:none / visibility:hidden / 0 尺寸的 iframe
// 在 Chrome 中要么不触发 load 事件(导出一直转圈),要么 print() 输出空白页 ——
// 这是"导出 PDF 无反应"的常见根因。
//
// 本实现:
//   - srcdoc 直接内联完整 HTML:无 doc.write 时序问题,内容加载即渲染
//   - 屏幕外定位(translateX(-120%))、真实可见尺寸,iframe 正常加载与渲染
//   - 先挂 onload 再插入 DOM,避免错过 load 事件
//   - 双 requestAnimationFrame + 延时,等字体与布局排完再 print
//   - 打印后延迟移除 iframe;Safari / 异常环境降级为新窗口打印
//   - 30s 超时兜底,任何路径都 resolve,不阻塞 UI

function isSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

/** 降级路径:新窗口写入并打印。返回是否成功弹出。 */
function printInNewWindow(html: string): boolean {
  try {
    const w = window.open('', '_blank');
    if (!w) return false;
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
    return true;
  } catch {
    return false;
  }
}

export function printHtml(html: string): Promise<void> {
  return new Promise((resolve) => {
    // Safari 对 iframe.contentWindow.print() 支持不稳定,直接走新窗口
    if (isSafari()) {
      if (!printInNewWindow(html)) {
        window.alert?.('浏览器拦截了打印窗口,请允许弹窗后重试。');
      }
      resolve();
      return;
    }

    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.title = 'pdf-export-frame';
    frame.style.position = 'fixed';
    frame.style.left = '0';
    frame.style.top = '0';
    frame.style.width = '794px';
    frame.style.minHeight = '1123px';
    frame.style.border = '0';
    frame.style.pointerEvents = 'none';
    frame.style.zIndex = '-1';
    frame.style.transform = 'translateX(-120%)';

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      // 打印对话框通常已打开,延迟移除避免打断打印
      window.setTimeout(() => {
        if (frame.parentNode) frame.parentNode.removeChild(frame);
      }, 1000);
      resolve();
    };

    frame.onload = () => {
      if (settled) return;
      try {
        const win = frame.contentWindow;
        if (!win) {
          printInNewWindow(html);
          finish();
          return;
        }

        const run = () => {
          if (settled) return;
          try {
            win.focus();
            win.print();
          } catch {
            printInNewWindow(html);
          }
          finish();
        };

        // 双 rAF + 延时,确保 iframe 内样式与字体重排完成
        const raf: typeof requestAnimationFrame =
          typeof requestAnimationFrame !== 'undefined'
            ? requestAnimationFrame
            : (cb: FrameRequestCallback) => window.setTimeout(() => cb(Date.now()), 16);
        raf(() => raf(() => window.setTimeout(run, 180)));
      } catch {
        printInNewWindow(html);
        finish();
      }
    };

    // srcdoc 内联完整 HTML:内容随 iframe 一起加载渲染,无 doc.write 时序问题
    frame.srcdoc = html;
    // 先挂 onload,再插入 DOM(避免错过同步 load)
    document.body.appendChild(frame);

    // 超时兜底:某些环境 onload 不触发,不让 UI 一直转圈
    window.setTimeout(finish, 30_000);
  });
}
