// src/hooks/useLoginModal.ts —— host LoginModal 触发入口(React 端)。

import { useSyncExternalStore } from 'react';
import {
  subscribeLoginModal,
  getLoginModalSnapshot,
  openLoginModal,
  closeLoginModal,
} from '@/shared/useLoginModal';

export function useLoginModal(): { isOpen: boolean; open: () => void; close: () => void } {
  const isOpen = useSyncExternalStore(subscribeLoginModal, getLoginModalSnapshot, getLoginModalSnapshot);
  return { isOpen, open: openLoginModal, close: closeLoginModal };
}
