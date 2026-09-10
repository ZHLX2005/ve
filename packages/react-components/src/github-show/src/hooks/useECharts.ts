// src/hooks/useECharts.ts —— 展示视图的 ECharts 生命周期封装。
//
// 按需注册(bar + pie + grid + tooltip + legend + canvas),避免整包体积;
// 组件挂在 ShadowRoot 里,echarts.init 对 shadow 内元素正常工作(china-map 已验证)。

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, PieChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';

echarts.use([BarChart, PieChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

export function useECharts(option: EChartsCoreOption | null) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let chart: echarts.ECharts | null = null;
    try {
      chart = echarts.init(el);
    } catch {
      return; // 环境不支持 canvas(如部分测试环境)→ 静默降级,不阻塞展示
    }
    chartRef.current = chart;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => chart.resize()) : null;
    if (ro) ro.observe(el);
    return () => {
      if (ro) ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (chartRef.current && option) {
      chartRef.current.setOption(option, true);
    }
  }, [option]);

  return { containerRef, chartRef };
}
