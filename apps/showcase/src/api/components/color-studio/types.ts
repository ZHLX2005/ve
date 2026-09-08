// apps/showcase/src/api/components/color-studio/types.ts
//
// 域类型(组件与服务之间的共享契约)。canonical 定义在这里,
// 组件包通过 '@api/components/color-studio/types' 引用。

import { makeId } from '../../../../../../packages/react-components/src/color-studio/src/utils/id';

export type Hex = string; // '#RRGGBB',uppercase,with #

export type HarmonyType =
  | 'complementary'
  | 'triadic'
  | 'split-complementary'
  | 'analogous'
  | 'monochromatic';

export interface ColorEntry {
  id: string;
  hex: Hex;
  weight: number;
  locked: boolean;
  note: string;
  tags: string[];
  /** @deprecated v1.3.0 起废弃:调色板是唯一分组模型。字段仅为旧数据兼容保留。 */
  group?: string;
  derivedFrom?: { paletteId: string; rule: HarmonyType };
  createdAt: number;
  updatedAt: number;
}

/** v1.2.0:非破坏性滤镜配置。只存参数不改 hex,CSS filter 实时派生。 */
export type FilterType =
  | 'brightness'
  | 'contrast'
  | 'saturate'
  | 'hueRotate'
  | 'grayscale'
  | 'sepia'
  | 'invert';

export interface FilterConfig {
  id: string;
  type: FilterType;
  /** brightness/contrast/saturate: 0..300(100=中性);hueRotate: 0..360;
   *  grayscale/sepia/invert: 0..100(%) */
  value: number;
  enabled: boolean;
}

export interface PaletteHarmony {
  type: HarmonyType;
  anchorColorId: string;
  autoFill: boolean;
}

export interface Palette {
  id: string;
  name: string;
  colorIds: string[];
  harmony: PaletteHarmony | null;
  sortBy: 'manual' | 'hue' | 'brightness' | 'saturation';
  createdAt: number;
  updatedAt: number;
}

export interface PickHistoryItem {
  hex: Hex;
  source: 'wheel' | 'eyedropper' | 'image' | 'paste' | 'shortcut' | 'filter';
  pickedAt: number;
}

export interface ColorStudioViewState {
  leftPane: 'palettes' | 'picker' | 'history';
  showHarmony: boolean;
  selectedHarmony: HarmonyType | null;
  brightness: number;
  /** @deprecated v1.3.0 起废弃(分组概念移除)。仅为旧数据兼容保留。 */
  groupBy?: 'none' | 'group';
  /** v1.2.0:中央工作区视图(色盘 / 比例 / 笔刷) */
  mainView: 'wheel' | 'proportional' | 'brush';
  /** v1.3.0:当前选中的色卡(色盘/详情面板跟随);null = 回退活动板首色 */
  selectedColorId: string | null;
}

export interface ColorStudioDocument {
  meta: {
    /** v1.2.0 为当前版本;load 时旧文档由 docSchema 自动升级 */
    schemaVersion: '1.3.0';
    createdAt: number;
    updatedAt: number;
    authorEmail: string;
  };
  activePaletteId: string;
  palettes: Palette[];
  colorEntries: ColorEntry[];
  /** v1.2.0:非破坏性滤镜栈(有序、可开关) */
  filterStack: FilterConfig[];
  pickHistory: PickHistoryItem[];
  viewState: ColorStudioViewState;
}

/** Empty doc — used as load-fallback when KV missing or first-time user。 */
export function emptyDoc(authorEmail = '', now = Date.now()): ColorStudioDocument {
  const defaultPaletteId = makeId(now);
  const defaultAnchorId = makeId(now + 1);
  return {
    meta: {
      schemaVersion: '1.3.0',
      createdAt: now,
      updatedAt: now,
      authorEmail,
    },
    activePaletteId: defaultPaletteId,
    palettes: [
      {
        id: defaultPaletteId,
        name: '默认调色板',
        colorIds: [defaultAnchorId],
        harmony: null,
        sortBy: 'manual',
        createdAt: now,
        updatedAt: now,
      },
    ],
    colorEntries: [
      {
        id: defaultAnchorId,
        hex: '#3B82F6',
        weight: 1,
        locked: false,
        note: '',
        tags: [],
        createdAt: now,
        updatedAt: now,
      },
    ],
    filterStack: [],
    pickHistory: [],
    viewState: {
      leftPane: 'palettes',
      showHarmony: false,
      selectedHarmony: null,
      brightness: 100,
      mainView: 'wheel',
      selectedColorId: null,
    },
  };
}
