import { app, shell, BrowserWindow, ipcMain, safeStorage } from 'electron'
import { readFile, writeFile, unlink, mkdir } from 'fs/promises'
import { join, dirname } from 'path'

const isDev = !app.isPackaged

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 560,
    show: false,
    frame: false,
    // Matches the renderer's dark-mode canvas (theme.ts) so the startup
    // flash isn't a different shade; the renderer updates this live on
    // theme toggle via window:set-background.
    backgroundColor: '#0A0E0D',
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Start maximized (a normal Windows "maximized" state, NOT fullscreen —
  // the taskbar stays visible and the window can be restored via the custom
  // title-bar button or the OS shortcuts). Resize/restore still work because
  // this is the real maximize() call, not setFullScreen().
  const notifyMaximized = (): void => {
    mainWindow.webContents.send('window:maximized-changed', mainWindow.isMaximized())
  }
  mainWindow.on('maximize', notifyMaximized)
  mainWindow.on('unmaximize', notifyMaximized)
  mainWindow.on('restore', notifyMaximized)

  mainWindow.on('ready-to-show', () => {
    mainWindow.maximize()
    mainWindow.show()
    notifyMaximized()
  })

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
ipcMain.on('window:is-maximized', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  event.returnValue = win ? win.isMaximized() : false
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

// Session token persistence via the OS keychain. On Windows this uses DPAPI
// (safeStorage), on macOS the Keychain, and on Linux a secret store when
// available — so the token never sits in plaintext in the renderer's
// localStorage where any XSS could read it. Falls back to a plain file only
// if no secure store exists (e.g. headless Linux), still outside the
// renderer's reach.
function tokenFilePath(): string {
  return join(app.getPath('userData'), 'pharma_token.bin')
}

async function readTokenFile(): Promise<string | null> {
  try {
    const raw = await readFile(tokenFilePath())
    if (raw.length === 0) return null
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf8')
  } catch {
    return null
  }
}

async function writeTokenFile(token: string | null): Promise<void> {
  const file = tokenFilePath()
  try {
    if (!token) {
      await unlink(file).catch(() => {})
      return
    }
    const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(token) : Buffer.from(token, 'utf8')
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, data, { mode: 0o600 })
  } catch {
    // best-effort — the token still lives in the renderer's memory for this run
  }
}

ipcMain.handle('token:load', () => readTokenFile())
ipcMain.handle('token:save', (_event, token: string | null) =>
  writeTokenFile(typeof token === 'string' && token.length > 0 ? token : null)
)

// Only allow one running instance. If the user launches the app again (e.g.
// from the shortcut or a second double-click), the new copy exits immediately
// and we instead focus/restore the already-open window instead of opening a
// duplicate. Without this, every launch spawns an extra window.
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      if (!win.isVisible()) win.show()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
