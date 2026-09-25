export type PixeraVersion = '25' | '26'
export type ConnectionMode = 'demo' | 'json-tcp-auto' | 'json-tcp-dl' | 'json-tcp'
export type TimeFormat = 'auto' | 'mmss' | 'hms' | 'hmsf'
export type Appearance = 'dark' | 'light'
export type OperatorChrome = 'normal' | 'night'

export type WidgetId =
  | 'layerName'
  | 'videoFile'
  | 'timeToNextCue'
  | 'cueElapsed'
  | 'cueName'
  | 'nextCueName'
  | 'timelineTimecode'
  | 'countdownKind'

export interface ConnectionProfile {
  id: string
  name: string
  host: string
  port: number
  mode: ConnectionMode
}

export interface DisplayWidget {
  id: WidgetId
  enabled: boolean
}

export interface AppSettings {
  version: PixeraVersion
  host: string
  port: number
  mode: ConnectionMode
  timelineName: string
  layerName: string
  pollIntervalMs: number
  timeFormat: TimeFormat
  countdownWarnFormat: TimeFormat
  alwaysOnTop: boolean
  widgets: DisplayWidget[]
  countdownColor: string
  countdownSizePx: number
  countdownWarnEnabled: boolean
  countdownWarnColor: string
  countdownWarnSeconds: number
  countdownWarnPulse: boolean
  elapsedColor: string
  elapsedSizePx: number
  layerSizePx: number
  videoSizePx: number
  outputEnabled: boolean
  outputPort: number
  appearance: Appearance
  chrome: OperatorChrome
  heartbeatEnabled: boolean
  heartbeatPort: number
  heartbeatMulticast: string
  profiles: ConnectionProfile[]
  activeProfileId: string
}

export const DEFAULT_WIDGETS: DisplayWidget[] = [
  { id: 'layerName', enabled: true },
  { id: 'videoFile', enabled: true },
  { id: 'timeToNextCue', enabled: true },
  { id: 'cueElapsed', enabled: true },
  { id: 'cueName', enabled: false },
  { id: 'nextCueName', enabled: false },
  { id: 'timelineTimecode', enabled: false },
  { id: 'countdownKind', enabled: false }
]

export const DEFAULT_SETTINGS: AppSettings = {
  version: '25',
  host: '127.0.0.1',
  port: 1400,
  mode: 'demo',
  timelineName: '',
  layerName: '',
  pollIntervalMs: 1500,
  timeFormat: 'auto',
  countdownWarnFormat: 'hmsf',
  alwaysOnTop: false,
  widgets: DEFAULT_WIDGETS,
  countdownColor: '#ffffff',
  countdownSizePx: 96,
  countdownWarnEnabled: true,
  countdownWarnColor: '#ff5d5d',
  countdownWarnSeconds: 10,
  countdownWarnPulse: true,
  elapsedColor: '#6ee7ff',
  elapsedSizePx: 96,
  layerSizePx: 56,
  videoSizePx: 28,
  outputEnabled: true,
  outputPort: 8010,
  appearance: 'dark',
  chrome: 'normal',
  heartbeatEnabled: false,
  heartbeatPort: 1401,
  heartbeatMulticast: '',
  profiles: [
    { id: 'hall-1', name: 'Profile 1', host: '127.0.0.1', port: 1400, mode: 'demo' }
  ],
  activeProfileId: 'hall-1'
}

export function newProfileId(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function normalizeProfiles(saved?: ConnectionProfile[]): ConnectionProfile[] {
  const list = Array.isArray(saved) ? saved : []
  const cleaned = list
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      id: String(item.id || newProfileId()),
      name: String(item.name || 'Profile').trim() || 'Profile',
      host: String(item.host || '').trim() || '127.0.0.1',
      port: Math.min(65535, Math.max(1, Math.round(Number(item.port) || 1400))),
      mode:
        item.mode === 'demo' ||
        item.mode === 'json-tcp' ||
        item.mode === 'json-tcp-dl' ||
        item.mode === 'json-tcp-auto'
          ? item.mode
          : 'json-tcp-auto'
    }))
  return cleaned.length ? cleaned : DEFAULT_SETTINGS.profiles.map((item) => ({ ...item }))
}

export function applyProfile(settings: AppSettings, id: string): AppSettings {
  const profile = settings.profiles.find((item) => item.id === id)
  if (!profile) return settings
  return {
    ...settings,
    activeProfileId: profile.id,
    host: profile.host,
    port: profile.port,
    mode: profile.mode
  }
}

export function saveActiveProfile(settings: AppSettings, name?: string): AppSettings {
  const profiles = settings.profiles.length
    ? settings.profiles
    : [{ id: newProfileId(), name: 'Profile 1', host: settings.host, port: settings.port, mode: settings.mode }]
  const activeId = profiles.some((item) => item.id === settings.activeProfileId)
    ? settings.activeProfileId
    : profiles[0].id
  const next = profiles.map((item) =>
    item.id === activeId
      ? {
          ...item,
          name: (name ?? item.name).trim() || item.name,
          host: settings.host.trim() || item.host,
          port: settings.port,
          mode: settings.mode
        }
      : item
  )
  return { ...settings, profiles: next, activeProfileId: activeId }
}

export function cloneSettings(settings: AppSettings = DEFAULT_SETTINGS): AppSettings {
  return {
    ...settings,
    widgets: settings.widgets.map((widget) => ({ ...widget })),
    profiles: (settings.profiles || []).map((profile) => ({ ...profile }))
  }
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface TimelineOption {
  name: string
  handle: number
}

export interface LayerOption {
  name: string
  handle: number
}

export interface LiveState {
  status: ConnectionStatus
  error: string | null
  apiRevision: number | null
  projectName: string | null
  timelineName: string
  layerName: string
  timelines: TimelineOption[]
  layers: LayerOption[]
  transport: 'play' | 'pause' | 'stop' | 'unknown'
  fps: number
  videoFile: string
  cueName: string
  nextCueName: string
  timeToNextCueSeconds: number | null
  cueElapsedSeconds: number | null
  timelineSeconds: number | null
  countdownFlag: number | null
  updatedAt: number
}

export const EMPTY_LIVE_STATE: LiveState = {
  status: 'disconnected',
  error: null,
  apiRevision: null,
  projectName: null,
  timelineName: '',
  layerName: '',
  timelines: [],
  layers: [],
  transport: 'unknown',
  fps: 60,
  videoFile: '',
  cueName: '',
  nextCueName: '',
  timeToNextCueSeconds: null,
  cueElapsedSeconds: null,
  timelineSeconds: null,
  countdownFlag: null,
  updatedAt: 0
}

export const WIDGET_LABELS: Record<WidgetId, string> = {
  layerName: 'Running layer',
  videoFile: 'Running video file',
  timeToNextCue: 'Time to next cue',
  cueElapsed: 'Cue running time',
  cueName: 'Current cue name',
  nextCueName: 'Next cue name',
  timelineTimecode: 'Timeline timecode',
  countdownKind: 'Wait vs cue countdown'
}

export const VERSION_LABELS: Record<PixeraVersion, string> = {
  '25': 'Pixera 25.x',
  '26': 'Pixera 26.x'
}

export const MODE_LABELS: Record<ConnectionMode, string> = {
  demo: 'Demo (no Pixera needed)',
  'json-tcp-auto': 'Pixera JSON/TCP (auto)',
  'json-tcp': 'JSON/TCP (pxr1 header)',
  'json-tcp-dl': 'JSON/TCP (dl / 0xPX)'
}

export const MODE_HELP: Record<ConnectionMode, string> = {
  demo: 'Fake show on this computer. Ignores IP and port and never opens a TCP socket. Use this to check layout, colours, and time formats.',
  'json-tcp-auto':
    'Recommended for a real Pixera. Connects to the JSON/TCP port (usually 1400, same as Companion) and tries the usual pxr1 header first, then the older 0xPX (dl) suffix if that does not answer.',
  'json-tcp':
    'Force Pixera 25+ JSON/TCP framing: each packet starts with the four bytes “pxr1”. Match this to Access Input protocol JSON/TCP (not dl).',
  'json-tcp-dl':
    'Force the older JSON/TCP (dl) framing: each JSON message ends with the text 0xPX. Only use this if Pixera’s protocol is specifically JSON/TCP (dl).'
}

export function tcpFraming(mode: ConnectionMode): 'auto' | 'pxr1' | 'delimiter' | null {
  if (mode === 'demo') return null
  if (mode === 'json-tcp-dl') return 'delimiter'
  if (mode === 'json-tcp') return 'pxr1'
  return 'auto'
}

export const TIME_FORMAT_LABELS: Record<TimeFormat, string> = {
  auto: 'Auto',
  mmss: 'MM:SS',
  hms: 'HH:MM:SS',
  hmsf: 'HH:MM:SS:FF'
}

export const TIME_FORMATS: TimeFormat[] = ['auto', 'mmss', 'hms', 'hmsf']

export function isTimeFormat(value: unknown): value is TimeFormat {
  return value === 'auto' || value === 'mmss' || value === 'hms' || value === 'hmsf'
}

export function isAppearance(value: unknown): value is Appearance {
  return value === 'dark' || value === 'light'
}

export function isOperatorChrome(value: unknown): value is OperatorChrome {
  return value === 'normal' || value === 'night'
}

export function countdownKindLabel(flag: number | null | undefined): string {
  if (flag === 2) return 'Wait'
  if (flag === 1) return 'Cue countdown'
  return '—'
}

export function inferCountdownFlag(
  transport: LiveState['transport'],
  remainingSeconds: number | null
): number | null {
  if (remainingSeconds == null || remainingSeconds <= 0) return null
  if (transport === 'pause' || transport === 'stop') return 2
  if (transport === 'play') return 1
  return null
}

export const SITE_URL = 'https://desertdog.nl'

export const TIMER_SIZE_MIN = 32
export const TIMER_SIZE_MAX = 200
export const TEXT_SIZE_MIN = 12
export const TEXT_SIZE_MAX = 200

export function clampSize(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

export function clampTimerSize(value: number): number {
  return clampSize(value, TIMER_SIZE_MIN, TIMER_SIZE_MAX, DEFAULT_SETTINGS.countdownSizePx)
}

export function clampTextSize(value: number, fallback: number): number {
  return clampSize(value, TEXT_SIZE_MIN, TEXT_SIZE_MAX, fallback)
}

export interface OutputInfo {
  enabled: boolean
  port: number
  /** Full showcaller timer embeds (`/timer`). */
  urls: string[]
  /** Countdown-only confidence embeds (`/confidence`). */
  confidenceUrls: string[]
  error: string | null
}

export const EMPTY_OUTPUT_INFO: OutputInfo = {
  enabled: false,
  port: 8010,
  urls: [],
  confidenceUrls: [],
  error: null
}

export function normalizeHexColor(value: string, fallback: string): string {
  const hex = value.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex.toLowerCase()
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    const [, r, g, b] = hex
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  return fallback
}

export function themeCountdownColor(color: string, appearance: Appearance): string {
  const hex = normalizeHexColor(color, DEFAULT_SETTINGS.countdownColor)
  if (appearance === 'light' && hex === '#ffffff') return '#12161c'
  return hex
}

export function themeElapsedColor(color: string, appearance: Appearance): string {
  const hex = normalizeHexColor(color, DEFAULT_SETTINGS.elapsedColor)
  if (appearance === 'light' && hex === '#6ee7ff') return '#0a7d9a'
  return hex
}
