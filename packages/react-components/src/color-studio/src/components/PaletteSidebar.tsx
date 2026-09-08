// packages/react-components/src/color-studio/src/components/PaletteSidebar.tsx
//
// 调色板列表 + CRUD + 选 active + 上下移 + 色卡点击选中(色盘跟随)。
// v1.3.0:分组概念移除(调色板是唯一分组模型)。

import { useMemo, useState } from 'react';
import { useColorStudio } from '../state/useColorStudio';
import { ColorChip } from './ColorChip';
import { Icon } from './ui/Icon';
import { Btn } from './ui/Btn';
import { makeId } from '../utils/id';
import { resolveNewColorHex } from '../engine/colorMath';
import { addColorEntryAndSelect } from '../engine/wheelCommit';
import { useSelectedColor } from '../hooks/useSelectedColor';
import type { ColorEntry } from '../../../../../../apps/showcase/src/api/components/color-studio/types';

function nowTs() { return Date.now(); }

export function PaletteSidebar() {
  const { doc, setDoc } = useColorStudio();
  const { effectiveId, select } = useSelectedColor();
  const [newPaletteName, setNewPaletteName] = useState('');
  const [createMode, setCreateMode] = useState<'input' | null>(null);
  const [newColorHex, setNewColorHex] = useState('');

  const activePalette = doc.palettes.find((p) => p.id === doc.activePaletteId);
  const activeEntries = useMemo(() => {
    if (!activePalette) return [] as ColorEntry[];
    return activePalette.colorIds
      .map((cid) => doc.colorEntries.find((c) => c.id === cid))
      .filter((c): c is ColorEntry => !!c);
  }, [activePalette, doc.colorEntries]);

  const addPalette = () => {
    if (!newPaletteName.trim()) return;
    const id = makeId();
    setDoc((d) => ({
      ...d,
      palettes: [
        ...d.palettes,
        { id, name: newPaletteName.trim(), colorIds: [], harmony: null, sortBy: 'manual', createdAt: nowTs(), updatedAt: nowTs() },
      ],
      meta: { ...d.meta, updatedAt: nowTs() },
    }));
    setNewPaletteName('');
  };

  const setActive = (id: string) => {
    setDoc((d) => ({
      ...d,
      activePaletteId: id,
      // 切板后选中态失效,回退新板首色
      viewState: { ...d.viewState, selectedColorId: null },
      meta: { ...d.meta, updatedAt: nowTs() },
    }));
  };

  /** 新建颜色:加一个白色色卡并选中(空板白色画布 → 首色)。 */
  const createWhite = () => {
    setDoc((d) => addColorEntryAndSelect(d, '#FFFFFF', 'wheel'));
    setCreateMode(null);
  };

  /** 输入创建:解析输入新建并选中(空/无效 → 白色)。 */
  const createFromInput = () => {
    const hex = resolveNewColorHex(newColorHex);
    setDoc((d) => addColorEntryAndSelect(d, hex, 'wheel'));
    setNewColorHex('');
    setCreateMode(null);
  };

  const removeColor = (entryId: string) => {
    setDoc((d) => ({
      ...d,
      colorEntries: d.colorEntries.filter((c) => c.id !== entryId),
      palettes: d.palettes.map((p) => ({ ...p, colorIds: p.colorIds.filter((id) => id !== entryId), updatedAt: nowTs() })),
      viewState: d.viewState.selectedColorId === entryId
        ? { ...d.viewState, selectedColorId: null }
        : d.viewState,
      meta: { ...d.meta, updatedAt: nowTs() },
    }));
  };

  const toggleLock = (entryId: string) => {
    setDoc((d) => ({
      ...d,
      colorEntries: d.colorEntries.map((c) =>
        c.id === entryId ? { ...c, locked: !c.locked, updatedAt: nowTs() } : c,
      ),
      meta: { ...d.meta, updatedAt: nowTs() },
    }));
  };

  const moveColor = (entryId: string, dir: -1 | 1) => {
    setDoc((d) => ({
      ...d,
      palettes: d.palettes.map((p) => {
        if (p.id !== d.activePaletteId) return p;
        const idx = p.colorIds.indexOf(entryId);
        if (idx < 0) return p;
        const newIdx = idx + dir;
        if (newIdx < 0 || newIdx >= p.colorIds.length) return p;
        const next = [...p.colorIds];
        const tmp = next[idx] as string;
        const swap = next[newIdx] as string;
        next[idx] = swap;
        next[newIdx] = tmp;
        return { ...p, colorIds: next, updatedAt: nowTs() };
      }),
      meta: { ...d.meta, updatedAt: nowTs() },
    }));
  };

  return (
    <div className="sl-cs-palettes">
      <h3>调色板</h3>
      <ul className="sl-cs-palettes__list">
        {doc.palettes.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className={`sl-cs-palettes__name ${p.id === doc.activePaletteId ? 'is-active' : ''}`}
              onClick={() => setActive(p.id)}
            >{p.name}</button>
          </li>
        ))}
      </ul>
      <div className="sl-cs-palettes__add">
        <input
          className="sl-cs-input"
          placeholder="新板名称"
          value={newPaletteName}
          onChange={(e) => setNewPaletteName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addPalette(); }}
        />
        <Btn variant="secondary" size="sm" iconOnly icon="plus" onClick={addPalette} aria-label="新增调色板" />
      </div>

      <h4>当前板色</h4>
      <div className="sl-cs-palettes__create">
        <Btn variant="primary" size="sm" icon="plus" onClick={createWhite} title="新建一个白色色卡(空板白色画布 → 首色)">
          新建颜色
        </Btn>
        <Btn
          variant="secondary" size="sm" icon="palette"
          onClick={() => setCreateMode(createMode === 'input' ? null : 'input')}
          title="输入 hex/rgb/名字创建颜色"
        >
          输入创建
        </Btn>
      </div>
      {createMode === 'input' && (
        <div className="sl-cs-palettes__add-color">
          <input
            autoFocus
            className="sl-cs-input"
            placeholder="#FF5733 或 red(留空 → 白色)"
            value={newColorHex}
            onChange={(e) => setNewColorHex(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') createFromInput(); if (e.key === 'Escape') setCreateMode(null); }}
          />
          <Btn variant="primary" size="sm" icon="plus" onClick={createFromInput}>创建</Btn>
        </div>
      )}
      <ul className="sl-cs-palettes__colors">
        {activeEntries.map((e, i) => (
          <li key={e.id} className="sl-cs-palettes__color">
            <ColorChip
              entry={e}
              active={e.id === effectiveId}
              onClick={select}
              onRemove={removeColor}
              onToggleLock={toggleLock}
            />
            <button
              type="button"
              className="sl-cs-chip__act"
              onClick={() => moveColor(e.id, -1)}
              disabled={i === 0}
              aria-label="上移"
              title="上移"
            ><Icon name="chevronUp" size={12} /></button>
            <button
              type="button"
              className="sl-cs-chip__act"
              onClick={() => moveColor(e.id, 1)}
              disabled={i === activeEntries.length - 1}
              aria-label="下移"
              title="下移"
            ><Icon name="chevronDown" size={12} /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}
