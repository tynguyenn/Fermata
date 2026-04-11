import { create } from 'zustand'

interface AppState {
  currentSheet: string | null
  setCurrentSheet: (id: string | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  currentSheet: null,
  setCurrentSheet: (id) => set({ currentSheet: id }),
}))
