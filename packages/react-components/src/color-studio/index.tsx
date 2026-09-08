// packages/react-components/src/color-studio/index.tsx
//
// 顶层组件:ColorStudioProvider + 三视图切换(色盘/比例/笔刷)+
// 右栏(取色/全局色/滤镜/快捷键)+ 导出弹窗 + 全局快捷键。

import './index.css';
import { useMemo, useState } from 'react';
import { ColorStudioProvider } from './src/state/ColorStudioProvider';
import { useColorStudio } from './src/state/useColorStudio';
import { ColorWheel } from './src/components/ColorWheel';
import { ColorDetailPanel } from './src/components/ColorDetailPanel';
import { PaletteSidebar } from './src/components/PaletteSidebar';
import { QuickAddBar } from './src/components/QuickAddBar';
import { PickerPanel } from './src/components/PickerPanel';
import { HistoryStrip } from './src/components/HistoryStrip';
import { ShortcutEditor } from './src/components/ShortcutEditor';
import { ExportModal } from './src/components/ExportModal';
import { ImportModal } from './src/components/ImportModal';
import { CookbookPage } from './src/components/CookbookPage';
import { ProportionalView } from './src/components/ProportionalView';
import { FilterPanel } from './src/components/FilterPanel';
import { BrushCanvas } from './src/components/BrushCanvas';
import { Btn } from './src/components/ui/Btn';
import { Icon, type IconName } from './src/components/ui/Icon';
import { useKeyboardShortcuts } from './src/hooks/useKeyboardShortcuts';
import { useShortcutPrefs } from './src/hooks/useShortcutPrefs';
import { useAutoFillEffect } from './src/hooks/useHarmony';
import { addEntryToActivePalette } from './src/utils/paletteActions';
import { mergePalettesIntoDoc } from './src/engine/importMerge';
import type { ImportParseResult } from './src/engine/importParser';
import { parseUserInput } from './src/engine/colorMath';

const MAIN_VIEWS: { value: 'wheel' | 'proportional' | 'brush'; label: string; icon: IconName }[] = [
  { value: 'wheel', label: '色盘', icon: 'palette' },
  { value: 'proportional', label: '比例', icon: 'group' },
  { value: 'brush', label: '笔刷', icon: 'brush' },
];

export default function ColorStudio() {
  return (
    <ColorStudioProvider>
      <Shell />
    </ColorStudioProvider>
  );
}

function Shell() {
  const { doc, setDoc, status, authState } = useColorStudio();
  const { prefs, ready, setKey, setCopyFormat, resetAll } = useShortcutPrefs();
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [cookbookOpen, setCookbookOpen] = useState(false);
  // C 键复制用首选格式
  useKeyboardShortcuts({ shortcuts: prefs.shortcuts, copyFormat: prefs.preferredCopyFormat });
  useAutoFillEffect();

  const mainView = doc.viewState.mainView ?? 'wheel';

  const setMainView = (view: 'wheel' | 'proportional' | 'brush') => {
    setDoc((d) => ({
      ...d,
      viewState: { ...d.viewState, mainView: view },
      meta: { ...d.meta, updatedAt: Date.now() },
    }));
  };

  const addPickedColor = (hex: string) => {
    if (!parseUserInput(hex)) return;
    setDoc((d) => addEntryToActivePalette(d, hex, 'eyedropper'));
  };

  // 导入:解析结果 → 增量合并 → 统计供弹窗展示。
  // 先基于当前 doc 纯函数计算(拿 stats),再一次性 setDoc。
  // 注意:不依赖 setDoc updater 的同步执行时序,避免并发渲染下 stats 为空。
  const handleImport = (result: ImportParseResult) => {
    const merged = mergePalettesIntoDoc(doc, result);
    setDoc(merged.doc);
    return merged.stats;
  };

  // 当前活动调色板及其颜色(喂给 ImportModal 做「AI 增量提示词」)
  const activePaletteForImport = useMemo(() => {
    const p = doc.palettes.find((p) => p.id === doc.activePaletteId);
    if (!p) return null;
    const colors = p.colorIds
      .map((cid) => doc.colorEntries.find((c) => c.id === cid))
      .filter((c): c is NonNullable<typeof c> => !!c);
    return { palette: p, colors };
  }, [doc]);

  return (
    <div className="sl-cs">
      <header className="sl-cs__header">
        <h2>Color Studio</h2>
        <span className={`sl-cs__status sl-cs__status--${status}`}>
          {status === 'saving' ? '保存中...' : status === 'synced' ? '已同步' : status}
        </span>
        <span className="sl-cs__auth">{authState === 'logged-in' ? '已登录' : '未登录'}</span>
        <div className="sl-cs__header-actions">
          <Btn variant="secondary" size="sm" icon="book" onClick={() => setCookbookOpen(true)}>
            案例
          </Btn>
          <Btn variant="secondary" size="sm" icon="upload" onClick={() => setImportOpen(true)}>
            导入
          </Btn>
          <Btn variant="secondary" size="sm" icon="download" onClick={() => setExportOpen(true)}>
            导出
          </Btn>
        </div>
      </header>
      <aside className="sl-cs__left">
        <PaletteSidebar />
      </aside>
      <main className="sl-cs__main">
        <nav className="sl-cs__viewnav" role="tablist" aria-label="工作区视图">
          {MAIN_VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              role="tab"
              aria-selected={mainView === v.value}
              className={`sl-cs-btn sl-cs-btn--sm sl-cs-btn--ghost ${mainView === v.value ? 'is-active' : ''}`}
              onClick={() => setMainView(v.value)}
            >
              <Icon name={v.icon} size={13} /> {v.label}
            </button>
          ))}
        </nav>
        {mainView === 'wheel' && (
          <>
            <section className="sl-cs__wheel"><ColorWheel /></section>
            <section className="sl-cs__detail">
              <ColorDetailPanel
                preferredFormat={prefs.preferredCopyFormat}
                onPreferredFormatChange={setCopyFormat}
              />
            </section>
            <section className="sl-cs__history"><HistoryStrip /></section>
          </>
        )}
        {mainView === 'proportional' && (
          <section className="sl-cs__propwrap"><ProportionalView /></section>
        )}
        {mainView === 'brush' && (
          <section className="sl-cs__brushwrap"><BrushCanvas onPickColor={addPickedColor} /></section>
        )}
      </main>
      <aside className="sl-cs__right">
        <PickerPanel />
        <FilterPanel />
        <ShortcutEditor prefs={prefs} ready={ready} setKey={setKey} resetAll={resetAll} />
      </aside>
      <footer className="sl-cs__bottom"><QuickAddBar /></footer>
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} />
      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={handleImport}
        activePalette={activePaletteForImport}
      />
      <CookbookPage open={cookbookOpen} onClose={() => setCookbookOpen(false)} />
    </div>
  );
}
