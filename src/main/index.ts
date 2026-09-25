import { app, BrowserWindow, ipcMain, nativeImage, screen, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { APP_VERSION } from '../shared/version'
import { EMPTY_LIVE_STATE, SITE_URL, cloneSettings, type AppSettings, type LiveState } from '../shared/types'
import { formatPixeraConnectError } from '../shared/connectError'
import { liveFingerprint, pollDelay } from '../shared/poll'
import { DemoEngine } from '../shared/demoEngine'
import { PixeraSession, withLiveDefaults } from './pixeraSession'
import { loadSettings, saveSettings } from './settingsStore'
import { OutputServer } from './outputServer'
import { HeartbeatListener } from './heartbeatListener'

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null
let settings: AppSettings = cloneSettings()
let live: LiveState = { ...EMPTY_LIVE_STATE }
let session: PixeraSession | null = null
let demo: DemoEngine | null = null
let pollTimer: NodeJS.Timeout | null = null
let polling = false
let lastFingerprint = ''
const output = new OutputServer({
  getState: () => live,
  getSettings: () => settings
})
const heartbeat = new HeartbeatListener((items) => {
  mainWindow?.webContents.send('discoveries', items)
})

/** Full-bleed square art — fine for in-window chrome / Windows, not for the macOS Dock. */
function windowIconPath(): string {
  return isDev
    ? join(process.cwd(), 'resources/icon.png')
    : join(__dirname, '../renderer/icon.png')
}

/**
 * Packaged macOS must keep the Dock on CFBundleIconFile (icon.icns: squircle + 100px inset).
 * Calling dock.setIcon(icon.png) replaces that with a full-bleed square — looks larger/sharper
 * only while the app is open. In dev, set the macOS geometry PNG so local runs match.
 */
function applyMacDockIcon(): void {
  if (process.platform !== 'darwin' || !app.dock) return
  if (!isDev) return
  const macosPng = join(process.cwd(), 'resources/icon-macos.png')
  const icns = join(process.cwd(), 'resources/icon.icns')
  const path = existsSync(macosPng) ? macosPng : existsSync(icns) ? icns : ''
  if (!path) return
  try {
    const image = nativeImage.createFromPath(path)
    if (!image.isEmpty()) app.dock.setIcon(image)
  } catch {
    /* ignore missing icon while developing */
  }
}

function windowBackground(appearance: AppSettings['appearance']): string {
  return appearance === 'light' ? '#f3f5f8' : '#0b0f14'
}

function createWindow(): void {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  mainWindow = new BrowserWindow({
    width: Math.min(1280, width),
    height: Math.min(800, height),
    minWidth: 640,
    minHeight: 420,
    show: false,
    backgroundColor: windowBackground(settings.appearance),
    title: `Pixera Dashboard v${APP_VERSION}`,
    autoHideMenuBar: true,
    ...(process.platform === 'darwin' ? {} : { icon: windowIconPath() }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    mainWindow?.setAlwaysOnTop(settings.alwaysOnTop)
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function emitState(force = false): void {
  const next = liveFingerprint(live)
  if (!force && next === lastFingerprint) return
  lastFingerprint = next
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('live-state', live)
  }
  output.broadcast('state', live)
}

function emitSettings(): void {
  mainWindow?.webContents.send('settings', settings)
  output.broadcast('settings', settings)
}

function emitOutputInfo(): void {
  mainWindow?.webContents.send('output-info', output.getInfo())
}

async function syncHeartbeat(): Promise<void> {
  if (settings.heartbeatEnabled) {
    await heartbeat.start(settings.heartbeatPort, settings.heartbeatMulticast)
  } else {
    await heartbeat.stop()
  }
}

async function startOutput(): Promise<void> {
  await output.start({
    enabled: settings.outputEnabled,
    port: settings.outputPort,
    staticRoot: join(__dirname, '../renderer'),
    devProxyUrl: isDev ? process.env.ELECTRON_RENDERER_URL : undefined
  })
  emitOutputInfo()
}

function stopPolling(): void {
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = null
  polling = false
}

async function disconnect(message?: string): Promise<void> {
  stopPolling()
  if (session) {
    await session.close()
    session = null
  }
  demo = null
  live = {
    ...EMPTY_LIVE_STATE,
    status: message ? 'error' : 'disconnected',
    error: message || null,
    updatedAt: Date.now()
  }
  emitState(true)
}

async function tick(): Promise<void> {
  if (polling) return
  polling = true
  try {
    if (settings.mode === 'demo') {
      if (!demo) demo = new DemoEngine()
      const snapshot = demo.snapshot()
      live = {
        ...snapshot,
        timelineName: settings.timelineName || snapshot.timelineName,
        layerName: settings.layerName || snapshot.layerName
      }
      emitState()
      return
    }

    if (!session?.isConnected()) {
      live = withLiveDefaults({ error: 'Not connected to Pixera' }, 'disconnected')
      emitState()
      return
    }

    const partial = await session.poll(settings)
    live = withLiveDefaults(
      {
        ...live,
        ...partial,
        apiRevision: live.apiRevision,
        projectName: live.projectName
      },
      'connected'
    )
    emitState()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await disconnect(message)
  } finally {
    polling = false
    const keepGoing = settings.mode === 'demo' || session?.isConnected()
    if (!keepGoing) return
    const idle =
      (!mainWindow ||
        mainWindow.isDestroyed() ||
        mainWindow.isMinimized() ||
        !mainWindow.isVisible()) &&
      output.clientCount() === 0
    pollTimer = setTimeout(() => {
      void tick()
    }, pollDelay(settings.pollIntervalMs, idle))
  }
}

async function connect(): Promise<void> {
  stopPolling()
  if (session) {
    await session.close()
    session = null
  }
  demo = null
  live = withLiveDefaults({ error: null }, 'connecting')
  emitState(true)

  if (settings.mode === 'demo') {
    demo = new DemoEngine()
    live = demo.snapshot()
    emitState()
    void tick()
    return
  }

  try {
    session = new PixeraSession(settings)
    const info = await session.connect()
    live = withLiveDefaults(
      {
        apiRevision: info.apiRevision,
        projectName: info.projectName,
        error: null
      },
      'connected'
    )
    emitState()
    void tick()
  } catch (error) {
    await disconnect(formatPixeraConnectError(error, settings.host, settings.port))
  }
}

app.whenReady().then(() => {
  settings = loadSettings()
  app.setName('Pixera Dashboard')
  applyMacDockIcon()

  ipcMain.handle('get-settings', () => settings)
  ipcMain.handle('get-state', () => live)
  ipcMain.handle('get-app-version', () => app.getVersion() || APP_VERSION)
  ipcMain.handle('get-output-info', () => output.getInfo())
  ipcMain.handle('get-discoveries', () => heartbeat.list())
  ipcMain.handle('save-settings', async (_event, next: AppSettings) => {
    const portChanged = next.outputPort !== settings.outputPort || next.outputEnabled !== settings.outputEnabled
    const heartbeatChanged =
      next.heartbeatEnabled !== settings.heartbeatEnabled ||
      next.heartbeatPort !== settings.heartbeatPort ||
      next.heartbeatMulticast !== settings.heartbeatMulticast
    settings = saveSettings(next)
    mainWindow?.setAlwaysOnTop(settings.alwaysOnTop)
    mainWindow?.setBackgroundColor(windowBackground(settings.appearance))
    emitSettings()
    if (portChanged) await startOutput()
    else emitOutputInfo()
    if (heartbeatChanged) await syncHeartbeat()
    return settings
  })
  ipcMain.handle('connect', async () => {
    await connect()
    return live
  })
  ipcMain.handle('disconnect', async () => {
    await disconnect()
    return live
  })
  ipcMain.handle('set-fullscreen', (_event, value: boolean) => {
    mainWindow?.setFullScreen(value)
    return mainWindow?.isFullScreen() ?? false
  })
  ipcMain.handle('open-url', async (_event, url: string) => {
    if (typeof url !== 'string' || !url.startsWith(SITE_URL)) return false
    await shell.openExternal(url)
    return true
  })

  createWindow()
  void startOutput()
  void syncHeartbeat()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopPolling()
  void session?.close()
  void output.stop()
  void heartbeat.stop()
})
