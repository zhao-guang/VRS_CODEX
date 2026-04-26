import { create } from 'zustand';

type FilterState = {
  networkKeyword: string;
  siteKeyword: string;
  setNetworkKeyword: (value: string) => void;
  setSiteKeyword: (value: string) => void;
};

export const useFilterStore = create<FilterState>((set) => ({
  networkKeyword: '',
  siteKeyword: '',
  setNetworkKeyword: (value) => set({ networkKeyword: value }),
  setSiteKeyword: (value) => set({ siteKeyword: value }),
}));
