import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  cloneSettings,
  DEFAULT_SETTINGS,
  DEFAULT_WIDGETS,
  clampTextSize,
  clampTimerSize,
  isAppearance,
  isOperatorChrome,
  isTimeFormat,
  normalizeHexColor,
  normalizeProfiles,
  type AppSettings,
  type DisplayWidget
} from '../shared/types'
import { snapPollMs } from '../shared/poll'

const FILE_NAME = 'settings.json'

function settingsPath(): string {
  return join(app.getPath('userData'), FILE_NAME)
}

function mergeWidgets(saved?: DisplayWidget[]): DisplayWidget[] {
  const byId = new Map((saved || []).map((widget) => [widget.id, widget]))
  return DEFAULT_WIDGETS.map((fallback) => ({
    id: fallback.id,
    enabled: byId.get(fallback.id)?.enabled ?? fallback.enabled
  }))
}

function withActiveProfile(settings: AppSettings): AppSettings {
  const active = settings.profiles.some((item) => item.id === settings.activeProfileId)
    ? settings.activeProfileId
    : settings.profiles[0]?.id || DEFAULT_SETTINGS.activeProfileId
  return { ...settings, activeProfileId: active }
}

function normalize(raw: Partial<AppSettings>): AppSettings {
  return withActiveProfile(
    cloneSettings({
      ...DEFAULT_SETTINGS,
      ...raw,
      widgets: mergeWidgets(raw.widgets),
      pollIntervalMs: snapPollMs(raw.pollIntervalMs),
      countdownColor: normalizeHexColor(String(raw.countdownColor ?? ''), DEFAULT_SETTINGS.countdownColor),
      countdownSizePx: clampTimerSize(Number(raw.countdownSizePx)),
      countdownWarnEnabled: raw.countdownWarnEnabled !== false,
      countdownWarnColor: normalizeHexColor(
        String(raw.countdownWarnColor ?? ''),
        DEFAULT_SETTINGS.countdownWarnColor
      ),
      countdownWarnSeconds:
        raw.countdownWarnSeconds == null
          ? DEFAULT_SETTINGS.countdownWarnSeconds
          : Math.max(0, Math.round(Number(raw.countdownWarnSeconds) || 0)),
      countdownWarnFormat: isTimeFormat(raw.countdownWarnFormat)
        ? raw.countdownWarnFormat
        : DEFAULT_SETTINGS.countdownWarnFormat,
      countdownWarnPulse: raw.countdownWarnPulse !== false,
      elapsedColor: normalizeHexColor(String(raw.elapsedColor ?? ''), DEFAULT_SETTINGS.elapsedColor),
      elapsedSizePx: clampTimerSize(Number(raw.elapsedSizePx)),
      layerSizePx: clampTextSize(Number(raw.layerSizePx), DEFAULT_SETTINGS.layerSizePx),
      videoSizePx: clampTextSize(Number(raw.videoSizePx), DEFAULT_SETTINGS.videoSizePx),
      outputEnabled: raw.outputEnabled !== false,
      outputPort: Math.min(65535, Math.max(1, Math.round(Number(raw.outputPort) || DEFAULT_SETTINGS.outputPort))),
      appearance: isAppearance(raw.appearance) ? raw.appearance : DEFAULT_SETTINGS.appearance,
      chrome: isOperatorChrome(raw.chrome) ? raw.chrome : DEFAULT_SETTINGS.chrome,
      heartbeatEnabled: raw.heartbeatEnabled === true,
      heartbeatPort: Math.min(
        65535,
        Math.max(1, Math.round(Number(raw.heartbeatPort) || DEFAULT_SETTINGS.heartbeatPort))
      ),
      heartbeatMulticast: String(raw.heartbeatMulticast || '').trim(),
      profiles: normalizeProfiles(raw.profiles),
      activeProfileId: String(raw.activeProfileId || '')
    })
  )
}

export function loadSettings(): AppSettings {
  try {
    const path = settingsPath()
    if (!existsSync(path)) return cloneSettings()
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<AppSettings>
    return normalize(parsed)
  } catch {
    return cloneSettings()
  }
}

export function saveSettings(settings: AppSettings): AppSettings {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const next = normalize(settings)
  writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf8')
  return next
}
