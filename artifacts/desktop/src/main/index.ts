import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'

const isDev = !app.isPackaged

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    frame: false,
    // Matches the renderer's dark-mode canvas (theme.ts) so the startup
    // flash isn't a different shade; the renderer updates this live on
    // theme toggle via window:set-background.
    backgroundColor: '#0A0E0D',
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  // Open real links in the OS browser, not inside the app window.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// frame: false removes native window controls on every OS, so the
// renderer's custom title bar sends these instead. Registered once at
// module scope (not inside createWindow) and resolved via the event's
// sender, so this stays correct even if a window is recreated — e.g. on
// macOS, clicking the dock icon after closing all windows fires
// app.on('activate') again, which would otherwise stack duplicate
// listeners and cause each click to fire multiple times.
ipcMain.on('window:minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize()
})
ipcMain.on('window:maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  if (win.isMaximized()) win.unmaximize()
  else win.maximize()
})
ipcMain.on('window:close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close()
})

// The renderer owns the theme (dark/light toggle), so it pushes the active
// canvas color here — otherwise the native window background stays the
// dark startup value and shows through when resizing or toggling to light.
ipcMain.on('window:set-background', (event, color: string) => {
  if (typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)) {
    BrowserWindow.fromWebContents(event.sender)?.setBackgroundColor(color)
  }
})

// Hardware handlers are intentionally stubbed for now. Real printer/scanner
// integration (e.g. node-thermal-printer for ESC/POS printers) plugs in
// here later — the renderer already calls this exact IPC channel via
// window.api.printer.test(), so wiring a real printer later doesn't
// require any renderer changes.
ipcMain.handle('printer:test', async () => {
  await new Promise((resolve) => setTimeout(resolve, 600))
  return { ok: true }
})

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
