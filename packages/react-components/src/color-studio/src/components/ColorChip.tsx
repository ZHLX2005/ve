// packages/react-components/src/color-studio/src/components/ColorChip.tsx
//
// 单色小卡:色块 + hex + 锁定切换 + 删除。
// 点击整卡 = 选中(色盘/详情跟随)。派生条目带角标。

import { Icon } from './ui/Icon';
import type { ColorEntry } from '../../../../../../apps/showcase/src/api/components/color-studio/types';

interface Props {
  entry: ColorEntry;
  onRemove?: (id: string) => void;
  onToggleLock?: (id: string) => void;
  onClick?: (id: string) => void;
  active?: boolean;
}

export function ColorChip({ entry, onRemove, onToggleLock, onClick, active }: Props) {
  return (
    <div
      className={`sl-cs-chip ${active ? 'is-active' : ''}`}
      onClick={() => onClick?.(entry.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(entry.id); }
      }}
      title={`选中 ${entry.hex}(色盘跟随)`}
    >
      <span
        className="sl-cs-chip__swatch"
        style={{ backgroundColor: entry.hex }}
        aria-hidden="true"
      >
        {entry.derivedFrom && <span className="sl-cs-chip__derived" aria-hidden="true" />}
      </span>
      <code className="sl-cs-chip__hex">{entry.hex}</code>
      <div className="sl-cs-chip__actions" onClick={(e) => e.stopPropagation()}>
        {onToggleLock && (
          <button
            type="button"
            className="sl-cs-chip__act"
            onClick={() => onToggleLock(entry.id)}
            aria-label={entry.locked ? '解锁' : '锁定'}
            title={entry.locked ? '解锁' : '锁定'}
          >
            <Icon name={entry.locked ? 'lock' : 'lockOpen'} size={12} />
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            className="sl-cs-chip__act"
            onClick={() => onRemove(entry.id)}
            aria-label="删除"
            title="删除"
          >
            <Icon name="close" size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
