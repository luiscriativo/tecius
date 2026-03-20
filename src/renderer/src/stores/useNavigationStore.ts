import { create } from 'zustand'
import type { NavigationItem } from '../types/chronicler'

interface NavigationState {
  stack: NavigationItem[]
  push: (item: NavigationItem) => void
  pop: () => NavigationItem | undefined
  reset: (item: NavigationItem) => void
  current: () => NavigationItem | undefined
}

export const useNavigationStore = create<NavigationState>()((set, get) => ({
  stack: [],
  push: (item) => set((s) => ({ stack: [...s.stack, item] })),
  pop: () => {
    const { stack } = get()
    if (stack.length <= 1) return undefined
    const prev = stack[stack.length - 2]
    set({ stack: stack.slice(0, -1) })
    return prev
  },
  reset: (item) => set({ stack: [item] }),
  current: () => {
    const { stack } = get()
    return stack[stack.length - 1]
  },
}))
