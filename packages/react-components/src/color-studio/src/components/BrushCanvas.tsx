// packages/react-components/src/color-studio/src/components/BrushCanvas.tsx
//
// 叠加笔刷画布(perfect-freehand 平滑笔刷 + 双画布合成):
//   - 笔刷核心: perfect-freehand — 把整条笔迹的点集转成平滑闭合轮廓,
//     每次只以当前混合模式绘制一次,彻底消除旧实现"逐段 lineTo + 混合
//     模式"在段与段之间产生的接缝 / 断续感。
//   - 双画布: 显示层(实时合成结果) + 提交层(已提交笔迹,撤销快照来源)。
//     实时绘制时先以提交层铺底,再叠加当前整条笔迹,保证 multiply /
//     screen 等混合模式与背景正确融合,且笔迹自身保持连续。
//   - 采样插值: 指针移动距离超过阈值时线性补插采样点,快速移动不断线;
//     单点 / 两点笔迹由 perfect-freehand 自动补点成圆。
//   - 参数: 大小 / 不透明度;混合模式;撤销栈(位图快照,上限 20);清空。
//   - 画布像素可反向取色(Alt+点击 或 取色按钮)→ onPickColor。
// 画布内容不持久化(MVP:会话级;spec 已登记 IndexedDB 为后续)。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getStroke } from 'perfect-freehand';
import type { StrokeOptions } from 'perfect-freehand';
import { useColorStudio } from '../state/useColorStudio';
import { toHex } from '../engine/colorMath';
import { Btn } from './ui/Btn';
import { Icon } from './ui/Icon';

type BlendMode = 'source-over' | 'multiply' | 'screen' | 'overlay' | 'soft-light';

const BLEND_MODES: { value: BlendMode; label: string }[] = [
  { value: 'source-over', label: '正常' },
  { value: 'multiply', label: '正片叠底' },
  { value: 'screen', label: '滤色' },
  { value: 'overlay', label: '叠加' },
  { value: 'soft-light', label: '柔光' },
];

const CANVAS_W = 560;
const CANVAS_H = 360;
const MAX_UNDO = 20;
/** 相邻采样点最大间距(px),超过则线性插值补点,保证快速移动时笔迹连续 */
const SAMPLE_STEP = 4;
/** 单条笔迹采样点上限,防止超长笔迹拖慢 getStroke */
const MAX_POINTS = 2000;
/** 无压感设备时的基准笔压;配合 simulatePressure 按移动速度模拟粗细 */
const BASE_PRESSURE = 0.5;

const buildStrokeOptions = (size: number, last: boolean): StrokeOptions => ({
  size,
  thinning: 0.35,
  smoothing: 0.5,
  streamline: 0.5,
  simulatePressure: true,
  start: { cap: true },
  end: { cap: true },
  last,
});

export function BrushCanvas({ onPickColor }: { onPickColor?: (hex: string) => void }) {
  const { doc } = useColorStudio();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** 提交层:已提交笔迹的离屏画布,撤销 / 清空都以它为基准 */
  const commitRef = useRef<HTMLCanvasElement | null>(null);
  const undoStackRef = useRef<string[]>([]);
  const drawingRef = useRef(false);
  /** 当前笔迹的全部采样点 [x, y, pressure] */
  const strokePointsRef = useRef<number[][]>([]);
  const [blend, setBlend] = useState<BlendMode>('multiply');
  const [size, setSize] = useState(16);
  const [opacity, setOpacity] = useState(80);
  const [pickMode, setPickMode] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [hoverHex, setHoverHex] = useState<string | null>(null);

  // 笔刷色:活动板 anchor
  const palette = doc.palettes.find((p) => p.id === doc.activePaletteId);
  const brushHex = useMemo(() => {
    const anchorId = palette?.colorIds[0];
    return doc.colorEntries.find((c) => c.id === anchorId)?.hex ?? '#000000';
  }, [doc.colorEntries, palette]);

  const ctx = () => canvasRef.current?.getContext('2d') ?? null;
  const commitCtx = () => commitRef.current?.getContext('2d') ?? null;

  const pushUndo = useCallback(() => {
    const commit = commitRef.current;
    if (!commit) return;
    const stack = undoStackRef.current;
    stack.push(commit.toDataURL());
    if (stack.length > MAX_UNDO) stack.shift();
    setCanUndo(true);
  }, []);

  const undo = useCallback(() => {
    const canvas = canvasRef.current;
    const context = ctx();
    const commit = commitRef.current;
    const commitContext = commitCtx();
    const snap = undoStackRef.current.pop();
    if (!canvas || !context || !commit || !commitContext || !snap) return;
    const img = new Image();
    img.onload = () => {
      commitContext.globalCompositeOperation = 'source-over';
      commitContext.globalAlpha = 1;
      commitContext.clearRect(0, 0, commit.width, commit.height);
      commitContext.drawImage(img, 0, 0);
      // 同步显示层
      context.globalCompositeOperation = 'source-over';
      context.globalAlpha = 1;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(commit, 0, 0);
    };
    img.src = snap;
    setCanUndo(undoStackRef.current.length > 0);
  }, []);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    const context = ctx();
    const commit = commitRef.current;
    const commitContext = commitCtx();
    if (!canvas || !context || !commit || !commitContext) return;
    pushUndo();
    strokePointsRef.current = [];
    drawingRef.current = false;
    commitContext.globalCompositeOperation = 'source-over';
    commitContext.globalAlpha = 1;
    commitContext.clearRect(0, 0, commit.width, commit.height);
    commitContext.fillStyle = '#FFFFFF';
    commitContext.fillRect(0, 0, commit.width, commit.height);
    context.globalCompositeOperation = 'source-over';
    context.globalAlpha = 1;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(commit, 0, 0);
  }, [pushUndo]);

  const toCanvasXY = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  /** 显示层 = 提交层内容 + 当前整条笔迹(以当前混合模式一次绘制) */
  const renderLiveStroke = useCallback(
    (last: boolean) => {
      const canvas = canvasRef.current;
      const context = ctx();
      const commit = commitRef.current;
      if (!canvas || !context || !commit) return;
      context.globalCompositeOperation = 'source-over';
      context.globalAlpha = 1;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(commit, 0, 0);
      const points = strokePointsRef.current;
      if (points.length === 0) return;
      const outline = getStroke(points, buildStrokeOptions(size, last));
      if (outline.length < 3) return;
      context.globalCompositeOperation = blend;
      context.globalAlpha = opacity / 100;
      context.fillStyle = brushHex;
      context.beginPath();
      context.moveTo(outline[0][0], outline[0][1]);
      for (let i = 1; i < outline.length; i += 1) context.lineTo(outline[i][0], outline[i][1]);
      context.closePath();
      context.fill();
    },
    [blend, opacity, size, brushHex],
  );

  /** 采样插值:与上一点距离超过 SAMPLE_STEP 时补点,保证采样密度 */
  const pushPoint = useCallback((x: number, y: number) => {
    const pts = strokePointsRef.current;
    const lastPt = pts[pts.length - 1];
    if (pts.length >= MAX_POINTS) {
      // 超上限:仅让末点跟随指针,避免 getStroke 因点数过多而变慢
      if (lastPt) {
        lastPt[0] = x;
        lastPt[1] = y;
      }
      return;
    }
    if (!lastPt) {
      pts.push([x, y, BASE_PRESSURE]);
      return;
    }
    const dx = x - lastPt[0];
    const dy = y - lastPt[1];
    const dist = Math.hypot(dx, dy);
    if (dist <= 0) return;
    if (dist > SAMPLE_STEP) {
      const steps = Math.ceil(dist / SAMPLE_STEP);
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps;
        pts.push([lastPt[0] + dx * t, lastPt[1] + dy * t, BASE_PRESSURE]);
      }
    } else {
      pts.push([x, y, BASE_PRESSURE]);
    }
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = toCanvasXY(e);
    if (pickMode || e.altKey) {
      // 反向取色
      const context = ctx()!;
      const px = context.getImageData(Math.round(x), Math.round(y), 1, 1).data;
      const hex = toHex({ mode: 'rgb', r: px[0] / 255, g: px[1] / 255, b: px[2] / 255 });
      onPickColor?.(hex);
      return;
    }
    pushUndo();
    drawingRef.current = true;
    strokePointsRef.current = [];
    pushPoint(x, y);
    renderLiveStroke(false);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = toCanvasXY(e);
    if (pickMode) {
      const context = ctx();
      if (context) {
        const px = context.getImageData(Math.round(x), Math.round(y), 1, 1).data;
        setHoverHex(toHex({ mode: 'rgb', r: px[0] / 255, g: px[1] / 255, b: px[2] / 255 }));
      }
      return;
    }
    if (!drawingRef.current) return;
    pushPoint(x, y);
    renderLiveStroke(false);
  };

  /** 结束当前笔迹:以收尾模式重绘一次,再把合成结果提交到提交层 */
  const finishStroke = useCallback(() => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    renderLiveStroke(true);
    const canvas = canvasRef.current;
    const commit = commitRef.current;
    const commitContext = commitCtx();
    if (canvas && commit && commitContext) {
      commitContext.globalCompositeOperation = 'source-over';
      commitContext.globalAlpha = 1;
      commitContext.clearRect(0, 0, commit.width, commit.height);
      commitContext.drawImage(canvas, 0, 0);
    }
    strokePointsRef.current = [];
  }, [renderLiveStroke]);

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    finishStroke();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  // 初始化:显示层与提交层均铺白底
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const commit = document.createElement('canvas');
    commit.width = canvas.width;
    commit.height = canvas.height;
    const commitContext = commit.getContext('2d');
    if (commitContext) {
      commitContext.fillStyle = '#FFFFFF';
      commitContext.fillRect(0, 0, commit.width, commit.height);
    }
    commitRef.current = commit;
    const context = ctx();
    if (context) {
      context.fillStyle = '#FFFFFF';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    return () => {
      commitRef.current = null;
      strokePointsRef.current = [];
      drawingRef.current = false;
    };
  }, []);

  return (
    <div className="sl-cs-brush">
      <div className="sl-cs-brush__toolbar">
        <div className="sl-cs-brush__modes">
          {BLEND_MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              className={`sl-cs-btn sl-cs-btn--sm sl-cs-btn--ghost ${blend === m.value ? 'is-active' : ''}`}
              onClick={() => setBlend(m.value)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <label className="sl-cs-brush__param">
          <span>大小</span>
          <input type="range" min={2} max={64} value={size} onChange={(e) => setSize(Number(e.target.value))} />
          <code>{size}</code>
        </label>
        <label className="sl-cs-brush__param">
          <span>不透明度</span>
          <input type="range" min={5} max={100} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
          <code>{opacity}%</code>
        </label>
        <span className="sl-cs-brush__color">
          <span className="sl-cs-brush__chip" style={{ backgroundColor: brushHex }} />
          <code>{brushHex}</code>
        </span>
        <div className="sl-cs-brush__actions">
          <Btn
            variant={pickMode ? 'primary' : 'secondary'}
            size="sm"
            icon="eyedropper"
            onClick={() => setPickMode((v) => !v)}
            title="从画布取色(或按住 Alt 点击)"
          >
            取色
          </Btn>
          <Btn variant="secondary" size="sm" icon="undo" disabled={!canUndo} onClick={undo} title="撤销">
            撤销
          </Btn>
          <Btn variant="danger" size="sm" icon="trash" onClick={clear} title="清空画布">
            清空
          </Btn>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className={`sl-cs-brush__canvas ${pickMode ? 'is-picking' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => {
          setHoverHex(null);
          if (drawingRef.current) finishStroke();
        }}
        aria-label="笔刷画布"
      />
      <p className="sl-cs-brush__hint">
        <Icon name="brush" size={11} />
        {pickMode
          ? (hoverHex ? `取色:${hoverHex}` : '点击画布取色')
          : `笔刷色跟随活动板首色;按住 Alt 点击画布可反向取色${hoverHex ? ` · ${hoverHex}` : ''}`}
      </p>
    </div>
  );
}
