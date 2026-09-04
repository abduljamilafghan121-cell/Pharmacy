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
    test: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('printer:test'),
    // Opens a dedicated (hidden-to-human) print window in the main process,
    // loads the supplied HTML, triggers the native print dialog, then closes.
    // This avoids window.open(), which Electron's setWindowOpenHandler denies.
    print: (html: string, title = 'Print'): Promise<void> =>
      ipcRenderer.invoke('printer:print', html, title)
  },
  token: {
    // Loads the saved session token from the OS secure store (safeStorage in
    // the main process — DPAPI on Windows). Never stored in localStorage.
    load: (): Promise<string | null> => ipcRenderer.invoke('token:load'),
    // Saves or clears it; null deletes the stored token.
    save: (token: string | null): Promise<void> => ipcRenderer.invoke('token:save', token)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
