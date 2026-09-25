import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, LiveState, OutputInfo } from '../shared/types'
import type { DiscoveredPixera } from '../shared/heartbeat'

export interface DashboardApi {
  getSettings: () => Promise<AppSettings>
  getState: () => Promise<LiveState>
  getAppVersion: () => Promise<string>
  getOutputInfo: () => Promise<OutputInfo>
  saveSettings: (settings: AppSettings) => Promise<AppSettings>
  connect: () => Promise<LiveState>
  disconnect: () => Promise<LiveState>
  setFullscreen: (value: boolean) => Promise<boolean>
  openUrl: (url: string) => Promise<boolean>
  getDiscoveries: () => Promise<DiscoveredPixera[]>
  onLiveState: (handler: (state: LiveState) => void) => () => void
  onSettings: (handler: (settings: AppSettings) => void) => () => void
  onOutputInfo: (handler: (info: OutputInfo) => void) => () => void
  onDiscovery: (handler: (items: DiscoveredPixera[]) => void) => () => void
}

const api: DashboardApi = {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  getState: () => ipcRenderer.invoke('get-state'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getOutputInfo: () => ipcRenderer.invoke('get-output-info'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  connect: () => ipcRenderer.invoke('connect'),
  disconnect: () => ipcRenderer.invoke('disconnect'),
  setFullscreen: (value) => ipcRenderer.invoke('set-fullscreen', value),
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  getDiscoveries: () => ipcRenderer.invoke('get-discoveries'),
  onLiveState: (handler) => {
    const listener = (_event: unknown, state: LiveState) => handler(state)
    ipcRenderer.on('live-state', listener)
    return () => ipcRenderer.removeListener('live-state', listener)
  },
  onSettings: (handler) => {
    const listener = (_event: unknown, next: AppSettings) => handler(next)
    ipcRenderer.on('settings', listener)
    return () => ipcRenderer.removeListener('settings', listener)
  },
  onOutputInfo: (handler) => {
    const listener = (_event: unknown, info: OutputInfo) => handler(info)
    ipcRenderer.on('output-info', listener)
    return () => ipcRenderer.removeListener('output-info', listener)
  },
  onDiscovery: (handler) => {
    const listener = (_event: unknown, items: DiscoveredPixera[]) => handler(items)
    ipcRenderer.on('discoveries', listener)
    return () => ipcRenderer.removeListener('discoveries', listener)
  }
}

contextBridge.exposeInMainWorld('dashboard', api)
