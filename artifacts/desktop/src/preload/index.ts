import { contextBridge, ipcRenderer } from 'electron'

// Everything exposed to the renderer goes through this explicit allowlist.
// The renderer never gets direct access to Node or Electron internals
// (contextIsolation: true, nodeIntegration: false in src/main/index.ts) —
// this file is the only bridge between them.
const api = {
  window: {
    minimize: (): void => ipcRenderer.send('window:minimize'),
    maximize: (): void => ipcRenderer.send('window:maximize'),
    close: (): void => ipcRenderer.send('window:close'),
    setBackgroundColor: (color: string): void => ipcRenderer.send('window:set-background', color),
    isMaximized: (): boolean => ipcRenderer.sendSync('window:is-maximized'),
    onMaximizedChange: (cb: (maximized: boolean) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, maximized: boolean): void => cb(maximized)
      ipcRenderer.on('window:maximized-changed', listener)
      return () => ipcRenderer.removeListener('window:maximized-changed', listener)
    }
  },
  printer: {
    test: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('printer:test')
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
