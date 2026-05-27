import type { ElectronAPI } from "../../preload/index";

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export function useElectronAPI(): ElectronAPI {
  return window.electronAPI;
}
