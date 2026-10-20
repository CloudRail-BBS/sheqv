'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { CapabilityState } from '@/lib/capabilities';

const Ctx = createContext<CapabilityState | null>(null);

export function CapProvider({ state, children }: { state: CapabilityState; children: ReactNode }) {
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

/** 客户端只读消费，不重新判定 */
export function useCap(): CapabilityState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCap 必须在 CapProvider 内使用');
  return v;
}
