import { create } from 'zustand';

interface AppState {
    isCommandPaletteOpen: boolean;
    setCommandPaletteOpen: (isOpen: boolean) => void;
    toggleCommandPalette: () => void;
}

export const useAppStore = create<AppState>((set) => ({
    isCommandPaletteOpen: false,
    setCommandPaletteOpen: (isOpen) => set({ isCommandPaletteOpen: isOpen }),
    toggleCommandPalette: () => set((state) => ({ isCommandPaletteOpen: !state.isCommandPaletteOpen })),
}));
