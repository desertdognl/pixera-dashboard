import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  EMPTY_OUTPUT_INFO,
  TEXT_SIZE_MAX,
  TEXT_SIZE_MIN,
  TIMER_SIZE_MAX,
  TIMER_SIZE_MIN,
  cloneSettings,
  clampTextSize,
  clampTimerSize,
  EMPTY_LIVE_STATE,
  MODE_HELP,
  MODE_LABELS,
  SITE_URL,
  TIME_FORMAT_LABELS,
  TIME_FORMATS,
  normalizeHexColor,
  themeCountdownColor,
  themeElapsedColor,
  VERSION_LABELS,
  WIDGET_LABELS,
  applyProfile,
  countdownKindLabel,
  newProfileId,
  saveActiveProfile,
  type AppSettings,
  type ConnectionMode,
  type LiveState,
  type OutputInfo,
  type TimeFormat,
  type WidgetId
} from '@shared/types'
import { countdownTimeFormat, formatDuration } from '@shared/time'
import { interpolationMs, POLL_CHOICES, snapPollMs } from '@shared/poll'
import { STAGE_DESIGN_WIDTH, fitStageScale } from '@shared/stageScale'
import { DemoEngine } from '@shared/demoEngine'
import { APP_VERSION } from '@shared/version'
import type { DiscoveredPixera } from '@shared/heartbeat'
import type { DashboardApi } from '../../preload/index'

function createLocalDashboard(): DashboardApi {
  const engine = new DemoEngine()
  let settings = cloneSettings()
  let live: LiveState = { ...EMPTY_LIVE_STATE }
  const stateListeners = new Set<(state: LiveState) => void>()
  const settingsListeners = new Set<(settings: AppSettings) => void>()
  let timer: number | null = null

  const emit = () => {
    for (const listener of stateListeners) listener(live)
  }

  const start = () => {
    if (timer) window.clearInterval(timer)
    live = engine.snapshot()
    emit()
    timer = window.setInterval(() => {
      live = engine.snapshot()
      emit()
    }, snapPollMs(settings.pollIntervalMs))
  }

  return {
    getSettings: async () => settings,
    getState: async () => live,
    getAppVersion: async () => APP_VERSION,
    saveSettings: async (next) => {
      settings = { ...next, pollIntervalMs: snapPollMs(next.pollIntervalMs) }
      if (timer) start()
      for (const listener of settingsListeners) listener(settings)
      return settings
    },
    connect: async () => {
      start()
      return live
    },
    disconnect: async () => {
      if (timer) window.clearInterval(timer)
      timer = null
      live = { ...EMPTY_LIVE_STATE, status: 'disconnected', updatedAt: Date.now() }
      emit()
      return live
    },
    setFullscreen: async (value) => {
      if (value) await document.documentElement.requestFullscreen?.()
      else if (document.fullscreenElement) await document.exitFullscreen()
      return !!document.fullscreenElement
    },
    openUrl: async (url) => {
      window.open(url, '_blank', 'noopener,noreferrer')
      return true
    },
    getOutputInfo: async () => EMPTY_OUTPUT_INFO,
    getDiscoveries: async () => [],
    onOutputInfo: () => () => undefined,
    onLiveState: (handler) => {
      stateListeners.add(handler)
      return () => stateListeners.delete(handler)
    },
    onSettings: (handler) => {
      settingsListeners.add(handler)
      return () => settingsListeners.delete(handler)
    },
    onDiscovery: () => () => undefined
  }
}

function createHttpDashboard(): DashboardApi {
  const stateListeners = new Set<(state: LiveState) => void>()
  const settingsListeners = new Set<(settings: AppSettings) => void>()
  const outputListeners = new Set<(info: OutputInfo) => void>()
  const source = new EventSource('/api/events')
  source.addEventListener('state', (event) => {
    const state = JSON.parse((event as MessageEvent).data) as LiveState
    for (const listener of stateListeners) listener(state)
  })
  source.addEventListener('settings', (event) => {
    const next = JSON.parse((event as MessageEvent).data) as AppSettings
    for (const listener of settingsListeners) listener(next)
  })
  return {
    getSettings: async () => (await fetch('/api/settings')).json(),
    getState: async () => (await fetch('/api/state')).json(),
    getAppVersion: async () => {
      const body = (await (await fetch('/api/version')).json()) as { version?: string }
      return body.version || APP_VERSION
    },
    getOutputInfo: async () => (await fetch('/api/output')).json(),
    getDiscoveries: async () => [],
    saveSettings: async (settings) => settings,
    connect: async () => (await fetch('/api/state')).json(),
    disconnect: async () => (await fetch('/api/state')).json(),
    setFullscreen: async (value) => {
      if (value) await document.documentElement.requestFullscreen?.()
      else if (document.fullscreenElement) await document.exitFullscreen()
      return !!document.fullscreenElement
    },
    openUrl: async (url) => {
      window.open(url, '_blank', 'noopener,noreferrer')
      return true
    },
    onLiveState: (handler) => {
      stateListeners.add(handler)
      return () => stateListeners.delete(handler)
    },
    onSettings: (handler) => {
      settingsListeners.add(handler)
      return () => settingsListeners.delete(handler)
    },
    onOutputInfo: (handler) => {
      outputListeners.add(handler)
      return () => outputListeners.delete(handler)
    },
    onDiscovery: () => () => undefined
  }
}

const outputPath = window.location.pathname.replace(/\/+$/, '')
const isConfidence = Boolean(
  document.documentElement.dataset.confidence === '1' ||
    outputPath === '/confidence' ||
    /(?:\?|&)confidence=1(?:&|$)/.test(window.location.search)
)
const isOutput = Boolean(
  window.__PIXERA_OUTPUT__ ||
    document.documentElement.dataset.output === '1' ||
    outputPath === '/timer' ||
    isConfidence ||
    /(?:\?|&)output=1(?:&|$)/.test(window.location.search)
)
if (isOutput) document.documentElement.dataset.output = '1'
if (isConfidence) document.documentElement.dataset.confidence = '1'
const dashboard = window.dashboard ?? (isOutput ? createHttpDashboard() : createLocalDashboard())

const statusLabel: Record<LiveState['status'], string> = {
  connected: 'Connected',
  connecting: 'Connecting',
  disconnected: 'Disconnected',
  error: 'Error'
}

function ColorField({
  id,
  label,
  value,
  fallback,
  onChange
}: {
  id: string
  label: string
  value: string
  fallback: string
  onChange: (value: string) => void
}) {
  const picker = normalizeHexColor(value, fallback)
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="color-row">
        <input
          id={id}
          type="color"
          value={picker}
          onChange={(event) => onChange(event.target.value)}
        />
        <input
          aria-label={`${label} hex`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </div>
  )
}

function useStageScale(layoutKey: string) {
  const hostRef = useRef<HTMLElement | null>(null)
  const boardRef = useRef<HTMLDivElement | null>(null)
  const [fit, setFit] = useState({ scale: 1, width: STAGE_DESIGN_WIDTH, height: 1 })

  useLayoutEffect(() => {
    const host = hostRef.current
    const board = boardRef.current
    if (!host || !board) return

    const update = () => {
      const style = getComputedStyle(host)
      const padX = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight)
      const padY = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)
      const availableWidth = host.clientWidth - padX
      const availableHeight = host.clientHeight - padY
      const prevTransform = board.style.transform
      board.style.transform = 'none'
      const boardWidth = Math.max(board.scrollWidth, board.offsetWidth, 1)
      const boardHeight = Math.max(board.scrollHeight, board.offsetHeight, 1)
      board.style.transform = prevTransform
      const scale = fitStageScale(availableWidth, availableHeight, boardWidth, boardHeight)
      const width = Math.round(boardWidth * scale)
      const height = Math.round(boardHeight * scale)
      setFit((current) => {
        if (
          Math.abs(current.scale - scale) < 0.001 &&
          current.width === width &&
          current.height === height
        ) {
          return current
        }
        return { scale, width, height }
      })
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(host)
    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)
    document.addEventListener('fullscreenchange', update)
    void document.fonts?.ready.then(update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('resize', update)
      document.removeEventListener('fullscreenchange', update)
    }
  }, [layoutKey])

  return { hostRef, boardRef, fit }
}

function BrandLink({
  src,
  alt,
  className
}: {
  src: string
  alt: string
  className: string
}) {
  return (
    <a
      className={className}
      href={SITE_URL}
      title="desertdog.nl"
      onClick={(event) => {
        event.preventDefault()
        void dashboard.openUrl(SITE_URL)
      }}
    >
      <img src={src} alt={alt} />
    </a>
  )
}

function TransportIcon({ mode }: { mode: LiveState['transport'] }) {
  const label = mode === 'play' ? 'Play' : mode === 'pause' ? 'Pause' : mode === 'stop' ? 'Stop' : 'Unknown'
  return (
    <div className={`transport transport-${mode}`} title={label} aria-label={`Transport ${label}`}>
      <svg viewBox="0 0 48 48" aria-hidden="true">
        {mode === 'play' ? <polygon points="18,13 18,35 36,24" /> : null}
        {mode === 'pause' ? (
          <>
            <rect x="15" y="13" width="6.5" height="22" rx="1.6" />
            <rect x="26.5" y="13" width="6.5" height="22" rx="1.6" />
          </>
        ) : null}
        {mode === 'stop' ? <rect x="15" y="15" width="18" height="18" rx="3" /> : null}
        {mode === 'unknown' ? <circle cx="24" cy="24" r="5.5" /> : null}
      </svg>
    </div>
  )
}

function TimeFormatSelect({
  id,
  label,
  value,
  onChange,
  help
}: {
  id: string
  label: string
  value: TimeFormat
  onChange: (value: TimeFormat) => void
  help?: string
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as TimeFormat)}
      >
        {TIME_FORMATS.map((format) => (
          <option key={format} value={format}>
            {TIME_FORMAT_LABELS[format]}
          </option>
        ))}
      </select>
      {help ? <p className="help">{help}</p> : null}
    </div>
  )
}

function SizeField({
  id,
  label,
  value,
  onChange,
  min = TIMER_SIZE_MIN,
  max = TIMER_SIZE_MAX
}: {
  id: string
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="size-row">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          value={Math.min(max, Math.max(min, Number(value) || min))}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </div>
    </div>
  )
}

function SettingsGroup({
  id,
  title,
  summary,
  defaultOpen = false,
  children
}: {
  id: string
  title: string
  summary?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const storageKey = `pixera-settings-${id}`
  const [open, setOpen] = useState(() => {
    try {
      const saved = sessionStorage.getItem(storageKey)
      if (saved === '1') return true
      if (saved === '0') return false
    } catch {
      /* ignore */
    }
    return defaultOpen
  })

  return (
    <details
      className={open ? 'settings-group is-open' : 'settings-group'}
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open
        if (next === open) return
        setOpen(next)
        try {
          sessionStorage.setItem(storageKey, next ? '1' : '0')
        } catch {
          /* ignore */
        }
      }}
    >
      <summary>
        <span className="settings-group-title">{title}</span>
        {summary ? <span className="settings-group-summary">{summary}</span> : null}
        <span className="settings-group-chevron" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </summary>
      <div className="settings-group-body">{children}</div>
    </details>
  )
}

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(() => cloneSettings())
  const [live, setLive] = useState<LiveState>(EMPTY_LIVE_STATE)
  const [draft, setDraft] = useState<AppSettings>(() => cloneSettings())
  const [open, setOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [appVersion, setAppVersion] = useState(APP_VERSION)
  const [outputInfo, setOutputInfo] = useState<OutputInfo>(EMPTY_OUTPUT_INFO)
  const [discoveries, setDiscoveries] = useState<DiscoveredPixera[]>([])
  const [hallName, setHallName] = useState('Profile 1')

  useEffect(() => {
    const offState = dashboard.onLiveState(setLive)
    const offSettings = dashboard.onSettings((value) => {
      setSettings(value)
      setDraft(value)
      setHallName(value.profiles.find((item) => item.id === value.activeProfileId)?.name || 'Profile 1')
    })
    const offOutput = dashboard.onOutputInfo(setOutputInfo)
    const offDiscovery = dashboard.onDiscovery?.(setDiscoveries)
    void (async () => {
      const [nextSettings, nextState, version, output] = await Promise.all([
        dashboard.getSettings(),
        dashboard.getState(),
        dashboard.getAppVersion(),
        dashboard.getOutputInfo()
      ])
      setSettings(nextSettings)
      setDraft(nextSettings)
      setHallName(
        nextSettings.profiles?.find((item) => item.id === nextSettings.activeProfileId)?.name || 'Profile 1'
      )
      setLive(nextState)
      setAppVersion(version)
      setOutputInfo(output)
      if (dashboard.getDiscoveries) setDiscoveries(await dashboard.getDiscoveries())
      if (!isOutput && nextSettings.mode === 'demo' && nextState.status !== 'connected') {
        await dashboard.connect()
        setOpen(false)
      }
    })()
    return () => {
      offState()
      offSettings()
      offOutput()
      offDiscovery?.()
    }
  }, [])

  useEffect(() => {
    if (live.status !== 'connected') return
    const needsFrames =
      draft.timeFormat === 'hmsf' ||
      (draft.countdownWarnEnabled && (draft.countdownWarnFormat || 'hmsf') === 'hmsf')
    const tick = () => {
      if (document.hidden) return
      setNow(Date.now())
    }
    const timer = window.setInterval(tick, interpolationMs(needsFrames))
    const onVis = () => {
      if (!document.hidden) setNow(Date.now())
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [live.status, draft.timeFormat, draft.countdownWarnEnabled, draft.countdownWarnFormat])

  useEffect(() => {
    const theme = draft.appearance === 'light' ? 'light' : 'dark'
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    if (!isOutput) document.documentElement.dataset.chrome = draft.chrome === 'night' ? 'night' : 'normal'
    else delete document.documentElement.dataset.chrome
  }, [draft.appearance, draft.chrome])

  const interpolated = useMemo(() => {
    if (live.status !== 'connected' || live.transport !== 'play' || !live.updatedAt) return live
    const delta = Math.max(0, (now - live.updatedAt) / 1000)
    return {
      ...live,
      timeToNextCueSeconds:
        live.timeToNextCueSeconds == null ? null : Math.max(0, live.timeToNextCueSeconds - delta),
      cueElapsedSeconds:
        live.cueElapsedSeconds == null ? null : live.cueElapsedSeconds + delta,
      timelineSeconds: live.timelineSeconds == null ? null : live.timelineSeconds + delta
    }
  }, [live, now])

  const enabled = draft.widgets.filter((widget) => widget.enabled)
  const countdownUrgent =
    draft.countdownWarnEnabled &&
    interpolated.timeToNextCueSeconds != null &&
    interpolated.timeToNextCueSeconds <= Math.max(0, draft.countdownWarnSeconds)
  const appearance = draft.appearance === 'light' ? 'light' : 'dark'
  const hall = (draft.profiles || []).find((item) => item.id === draft.activeProfileId)
  const enabledCount = draft.widgets.filter((widget) => widget.enabled).length
  const { hostRef, boardRef, fit } = useStageScale(
    [
      live.status,
      enabledCount,
      draft.countdownSizePx,
      draft.elapsedSizePx,
      draft.layerSizePx,
      draft.videoSizePx,
      isOutput ? 'embed' : 'app'
    ].join(':')
  )
  const countdownColor = countdownUrgent
    ? normalizeHexColor(draft.countdownWarnColor, '#ff5d5d')
    : themeCountdownColor(draft.countdownColor, appearance)
  const countdownFormat = countdownTimeFormat(
    interpolated.timeToNextCueSeconds,
    draft.timeFormat,
    draft.countdownWarnEnabled,
    draft.countdownWarnSeconds,
    draft.countdownWarnFormat || 'hmsf'
  )
  const elapsedColor = themeElapsedColor(draft.elapsedColor, appearance)

  async function persist(next: AppSettings) {
    const saved = await dashboard.saveSettings({
      ...next,
      pollIntervalMs: snapPollMs(next.pollIntervalMs)
    })
    setSettings(saved)
    setDraft(saved)
    setOutputInfo(await dashboard.getOutputInfo())
  }

  async function saveAndConnect() {
    await persist(saveActiveProfile({ ...draft, host: draft.host.trim() }, hallName))
    await dashboard.connect()
    setOpen(false)
  }

  if (isConfidence) {
    return (
      <div className="app embed confidence-app">
        <main className="confidence-stage">
          <div
            className={`confidence-countdown ${countdownUrgent ? 'warn' : ''} ${countdownUrgent && draft.countdownWarnPulse !== false ? 'pulse' : ''}`}
          >
            <div
              className="value"
              style={{
                color: countdownColor,
                fontSize: `${clampTimerSize(draft.countdownSizePx)}px`
              }}
            >
              {live.status === 'connected'
                ? formatDuration(
                    interpolated.timeToNextCueSeconds,
                    countdownFormat,
                    interpolated.fps
                  )
                : '—'}
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className={`app ${isOutput ? 'embed' : ''}`}>
      {isOutput ? null : (
      <header className="topbar">
        <div className="brand">
          <BrandLink className="brand-mark" src="./icon.png" alt="Desert Dog" />
          <div>
            <h1>Pixera Dashboard</h1>
            <p>v{appVersion}</p>
          </div>
        </div>
        <div className="status-cluster">
          <span className="pill">
            <span className={`dot ${live.status}`} />
            {statusLabel[live.status]}
          </span>
        </div>
        <div className="toolbar">
          {live.status === 'connected' ? null : (
            <button className="primary" onClick={() => void saveAndConnect()}>
              Connect
            </button>
          )}
          <button
            className="ghost"
            onClick={async () => {
              const next = !fullscreen
              await dashboard.setFullscreen(next)
              setFullscreen(next)
            }}
          >
            {fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          </button>
          <button className="ghost" onClick={() => setOpen(true)}>
            Settings
          </button>
        </div>
      </header>
      )}

      {live.error ? <div className="error-banner">{live.error}</div> : null}

      <main className="stage" ref={hostRef}>
        <div className="stage-fit" style={{ width: fit.width, height: fit.height }}>
        <div
          className="stage-board"
          ref={boardRef}
          style={{ transform: `scale(${fit.scale})` }}
        >
        {live.status !== 'connected' ? (
          <div className="empty">
            <p className="kicker">Showcaller</p>
            <h2>Connect to Pixera or start Demo mode</h2>
            <p>Use Settings to choose version, IP, port and the fields shown on this dashboard.</p>
          </div>
        ) : (
          <>
            {enabled.some((widget) => widget.id === 'layerName') ? (
              <section className="video-name">
                <p className="kicker">Running layer</p>
                <h2
                  style={{
                    fontSize: `${clampTextSize(draft.layerSizePx, 56)}px`
                  }}
                >
                  {interpolated.timelineName || interpolated.layerName || 'No layer'}
                </h2>
              </section>
            ) : null}

            {enabled.some((widget) => widget.id === 'videoFile') ? (
              <section className={enabled.some((widget) => widget.id === 'layerName') ? 'video-file' : 'video-name'}>
                <p className="kicker">Running video</p>
                {enabled.some((widget) => widget.id === 'layerName') ? (
                  <h3 style={{ fontSize: `${clampTextSize(draft.videoSizePx, 28)}px` }}>
                    {interpolated.videoFile || 'No clip'}
                  </h3>
                ) : (
                  <h2 style={{ fontSize: `${clampTextSize(draft.videoSizePx, 28)}px` }}>
                    {interpolated.videoFile || 'No clip'}
                  </h2>
                )}
              </section>
            ) : null}

            <section className="metrics">
              {enabled.map((widget) => {
                if (widget.id === 'layerName' || widget.id === 'videoFile') return null
                if (widget.id === 'cueName' || widget.id === 'nextCueName') return null
                if (widget.id === 'timeToNextCue') {
                  return (
                    <article
                      className={`metric hero ${countdownUrgent ? 'warn' : ''} ${countdownUrgent && draft.countdownWarnPulse !== false ? 'pulse' : ''}`}
                      key={widget.id}
                    >
                      <p className="kicker">
                        {interpolated.countdownFlag === 2 ? 'Wait remaining' : 'Time to next cue'}
                      </p>
                      <div
                        className="value"
                        style={{
                          color: countdownColor,
                          fontSize: `${clampTimerSize(draft.countdownSizePx)}px`
                        }}
                      >
                        {formatDuration(
                          interpolated.timeToNextCueSeconds,
                          countdownFormat,
                          interpolated.fps
                        )}
                      </div>
                    </article>
                  )
                }
                if (widget.id === 'cueElapsed') {
                  return (
                    <article className="metric elapsed" key={widget.id}>
                      <p className="kicker">Cue running</p>
                      <div
                        className="value"
                        style={{
                          color: elapsedColor,
                          fontSize: `${clampTimerSize(draft.elapsedSizePx)}px`
                        }}
                      >
                        {formatDuration(
                          interpolated.cueElapsedSeconds,
                          draft.timeFormat,
                          interpolated.fps
                        )}
                      </div>
                    </article>
                  )
                }
                if (widget.id === 'timelineTimecode') {
                  return (
                    <article className="metric" key={widget.id}>
                      <p className="kicker">{WIDGET_LABELS.timelineTimecode}</p>
                      <div className="value" style={{ fontSize: 48 }}>
                        {formatDuration(
                          interpolated.timelineSeconds,
                          draft.timeFormat,
                          interpolated.fps
                        )}
                      </div>
                    </article>
                  )
                }
                if (widget.id === 'countdownKind') {
                  return (
                    <article className="metric" key={widget.id}>
                      <p className="kicker">{WIDGET_LABELS.countdownKind}</p>
                      <div className="value" style={{ fontSize: 36, letterSpacing: 0 }}>
                        {countdownKindLabel(interpolated.countdownFlag)}
                      </div>
                    </article>
                  )
                }
                return (
                  <article className="metric" key={widget.id}>
                    <p className="kicker">{WIDGET_LABELS[widget.id]}</p>
                    <div className="value" style={{ fontSize: 36, letterSpacing: 0 }}>
                      {widget.id === 'nextCueName'
                        ? interpolated.nextCueName || '—'
                        : interpolated.cueName || '—'}
                    </div>
                  </article>
                )
              })}
            </section>

            <div className="names">
              <TransportIcon mode={interpolated.transport} />
              {enabled.some((widget) => widget.id === 'cueName') ? (
                <span>
                  Cue <strong>{interpolated.cueName || '—'}</strong>
                </span>
              ) : null}
              {enabled.some((widget) => widget.id === 'nextCueName') ? (
                <span>
                  Next <strong>{interpolated.nextCueName || '—'}</strong>
                </span>
              ) : null}
            </div>
          </>
        )}
        </div>
        </div>
      </main>

      {isOutput ? null : (
        <BrandLink className="corner-logo" src="./logo_full_white.png" alt="Desert Dog" />
      )}

      {open && !isOutput ? (
        <div className="drawer-backdrop" onClick={() => setOpen(false)}>
          <aside className="drawer" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-scroll">
            <h2>Settings</h2>
            <p className="help">
              TCP client to Pixera API Input. Keep polling light. Demo never opens a socket.
            </p>

            <SettingsGroup
              id="connect"
              title="Connect"
              defaultOpen
              summary={`${MODE_LABELS[draft.mode]} · ${draft.host}:${draft.port}`}
            >
              <div className="field">
                <label htmlFor="version">Pixera version</label>
                <select
                  id="version"
                  value={draft.version}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      version: event.target.value as AppSettings['version']
                    }))
                  }
                >
                  <option value="25">{VERSION_LABELS['25']}</option>
                  <option value="26">{VERSION_LABELS['26']}</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="mode">Mode</label>
                <select
                  id="mode"
                  value={draft.mode}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      mode: event.target.value as AppSettings['mode']
                    }))
                  }
                >
                  <option value="demo">{MODE_LABELS.demo}</option>
                  <option value="json-tcp-auto">{MODE_LABELS['json-tcp-auto']}</option>
                  <option value="json-tcp">{MODE_LABELS['json-tcp']}</option>
                  <option value="json-tcp-dl">{MODE_LABELS['json-tcp-dl']}</option>
                </select>
                <p className="help">{MODE_HELP[draft.mode]}</p>
              </div>
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="host">IP address</label>
                  <input
                    id="host"
                    value={draft.host}
                    disabled={draft.mode === 'demo'}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, host: event.target.value }))
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="port">Port</label>
                  <input
                    id="port"
                    type="number"
                    min={1}
                    max={65535}
                    value={draft.port}
                    disabled={draft.mode === 'demo'}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        port: Number(event.target.value) || 1400
                      }))
                    }
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="poll-interval">Poll interval</label>
                <select
                  id="poll-interval"
                  value={snapPollMs(draft.pollIntervalMs)}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      pollIntervalMs: snapPollMs(Number(event.target.value))
                    }))
                  }
                >
                  {POLL_CHOICES.map((choice) => (
                    <option key={choice.ms} value={choice.ms}>
                      {choice.label}
                    </option>
                  ))}
                </select>
                <p className="help">
                  How often to ask Pixera for a new snapshot. Never faster than 1.2 s. On-screen
                  timers still tick locally between polls. Demo uses the same interval.
                </p>
              </div>
            </SettingsGroup>

            <SettingsGroup
              id="sources"
              title="Sources"
              summary={
                draft.timelineName || draft.layerName
                  ? `${draft.timelineName || 'Follow playing'} · ${draft.layerName || 'Auto layer'}`
                  : 'Follow playing timeline, auto video layer'
              }
            >
              <div className="field">
                <label htmlFor="timeline">Timeline</label>
                <select
                  id="timeline"
                  value={draft.timelineName}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, timelineName: event.target.value }))
                  }
                >
                  <option value="">Follow playing timeline</option>
                  {live.timelines.map((timeline) => (
                    <option key={timeline.handle} value={timeline.name}>
                      {timeline.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="layer">Layer for video file</label>
                <select
                  id="layer"
                  value={draft.layerName}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, layerName: event.target.value }))
                  }
                >
                  <option value="">Auto / first layer with a clip</option>
                  {live.layers.map((layer) => (
                    <option key={layer.handle} value={layer.name}>
                      {layer.name}
                    </option>
                  ))}
                </select>
                <p className="help">
                  A timeline can have several layers, each with a different file. Auto uses the
                  first layer that has a clip. Pin one here if you always want that layer’s file.
                </p>
              </div>
            </SettingsGroup>

            <SettingsGroup
              id="display"
              title="What to show"
              defaultOpen
              summary={`${enabledCount} field${enabledCount === 1 ? '' : 's'} · ${TIME_FORMAT_LABELS[draft.timeFormat]}`}
            >
              {(Object.keys(WIDGET_LABELS) as WidgetId[]).map((id) => {
                const widget = draft.widgets.find((item) => item.id === id)
                return (
                  <div className="check" key={id}>
                    <label htmlFor={`widget-${id}`}>{WIDGET_LABELS[id]}</label>
                    <input
                      id={`widget-${id}`}
                      type="checkbox"
                      checked={widget?.enabled ?? false}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          widgets: current.widgets.map((item) =>
                            item.id === id ? { ...item, enabled: event.target.checked } : item
                          )
                        }))
                      }
                    />
                  </div>
                )
              })}
              <p className="help">
                Timeline timecode uses the time already in the poll. Wait vs cue countdown is inferred
                from play vs pause, unless Pixera returns a flag. Current cue name and Next cue name
                show next to play/pause at the bottom. Cue names are read only when a cue jumps —
                never by walking every clip or cue handle.
              </p>
              <TimeFormatSelect
                id="format"
                label="Time format"
                value={draft.timeFormat}
                onChange={(timeFormat) => setDraft((current) => ({ ...current, timeFormat }))}
                help="Used for cue running, and for time to next cue until the last-seconds window."
              />
            </SettingsGroup>

            <SettingsGroup
              id="timers"
              title="Timers"
              summary={`Countdown ${draft.countdownSizePx}px · last ${draft.countdownWarnSeconds}s${draft.countdownWarnPulse !== false ? ' flash' : ''}`}
            >
              <p className="help">Changes preview on the dashboard. Click Save to keep them.</p>
              <SizeField
                id="layer-size"
                label="Running layer size"
                value={draft.layerSizePx}
                min={TEXT_SIZE_MIN}
                max={TEXT_SIZE_MAX}
                onChange={(layerSizePx) => setDraft((current) => ({ ...current, layerSizePx }))}
              />
              <SizeField
                id="video-size"
                label="Running video size"
                value={draft.videoSizePx}
                min={TEXT_SIZE_MIN}
                max={TEXT_SIZE_MAX}
                onChange={(videoSizePx) => setDraft((current) => ({ ...current, videoSizePx }))}
              />
              <ColorField
                id="countdown-color"
                label="Countdown color"
                value={draft.countdownColor}
                fallback="#ffffff"
                onChange={(countdownColor) => setDraft((current) => ({ ...current, countdownColor }))}
              />
              <SizeField
                id="countdown-size"
                label="Countdown size"
                value={draft.countdownSizePx}
                onChange={(countdownSizePx) => setDraft((current) => ({ ...current, countdownSizePx }))}
              />
              <div className="check">
                <label htmlFor="countdown-warn">Warning color in last seconds</label>
                <input
                  id="countdown-warn"
                  type="checkbox"
                  checked={draft.countdownWarnEnabled}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      countdownWarnEnabled: event.target.checked
                    }))
                  }
                />
              </div>
              {draft.countdownWarnEnabled ? (
                <>
                  <ColorField
                    id="countdown-warn-color"
                    label="Warning color"
                    value={draft.countdownWarnColor}
                    fallback="#ff5d5d"
                    onChange={(countdownWarnColor) =>
                      setDraft((current) => ({ ...current, countdownWarnColor }))
                    }
                  />
                  <div className="field">
                    <label htmlFor="countdown-warn-seconds">Switch in last seconds</label>
                    <input
                      id="countdown-warn-seconds"
                      type="number"
                      min={0}
                      max={600}
                      value={draft.countdownWarnSeconds}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          countdownWarnSeconds: Math.max(0, Number(event.target.value) || 0)
                        }))
                      }
                    />
                    <p className="help">
                      Example: 10 turns the countdown red for the last 10 seconds. Pick HH:MM:SS:FF
                      below if you want frames in that window.
                    </p>
                  </div>
                  <TimeFormatSelect
                    id="countdown-warn-format"
                    label="Last-seconds time format"
                    value={draft.countdownWarnFormat || 'hmsf'}
                    onChange={(countdownWarnFormat) =>
                      setDraft((current) => ({ ...current, countdownWarnFormat }))
                    }
                    help="Only used in the last N seconds. HH:MM:SS:FF shows frames (FF)."
                  />
                  <div className="check">
                    <label htmlFor="countdown-warn-pulse">Flash in last seconds</label>
                    <input
                      id="countdown-warn-pulse"
                      type="checkbox"
                      checked={draft.countdownWarnPulse !== false}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          countdownWarnPulse: event.target.checked
                        }))
                      }
                    />
                  </div>
                  <p className="help">
                    Pulses the countdown on this screen and on the browser output. Local only — no extra
                    Pixera traffic.
                  </p>
                </>
              ) : null}
              <ColorField
                id="elapsed-color"
                label="Cue running color"
                value={draft.elapsedColor}
                fallback="#6ee7ff"
                onChange={(elapsedColor) => setDraft((current) => ({ ...current, elapsedColor }))}
              />
              <SizeField
                id="elapsed-size"
                label="Cue running size"
                value={draft.elapsedSizePx}
                onChange={(elapsedSizePx) => setDraft((current) => ({ ...current, elapsedSizePx }))}
              />
            </SettingsGroup>

            <SettingsGroup
              id="look"
              title="Look"
              summary={`${appearance === 'light' ? 'Light' : 'Dark'}${draft.chrome === 'night' ? ' · night' : ''}${draft.alwaysOnTop ? ' · on top' : ''}`}
            >
              <div className="field">
                <label>Appearance</label>
                <div className="theme-toggle" role="group" aria-label="Appearance">
                  <button
                    type="button"
                    className={appearance === 'dark' ? 'primary' : 'ghost'}
                    onClick={() => {
                      const next = { ...draft, appearance: 'dark' as const }
                      setDraft(next)
                      void persist(next)
                    }}
                  >
                    Dark
                  </button>
                  <button
                    type="button"
                    className={appearance === 'light' ? 'primary' : 'ghost'}
                    onClick={() => {
                      const next = { ...draft, appearance: 'light' as const }
                      setDraft(next)
                      void persist(next)
                    }}
                  >
                    Light
                  </button>
                </div>
                <p className="help">Applies to this window and to the browser output.</p>
              </div>
              <div className="check">
                <label htmlFor="night">Night mode (dim chrome)</label>
                <input
                  id="night"
                  type="checkbox"
                  checked={draft.chrome === 'night'}
                  onChange={(event) => {
                    const next = { ...draft, chrome: event.target.checked ? ('night' as const) : ('normal' as const) }
                    setDraft(next)
                    void persist(next)
                  }}
                />
              </div>
              <p className="help">Dims the top bar and corner logo. The timer itself and the browser embed stay full brightness.</p>
              <div className="check">
                <label htmlFor="aot">Always on top</label>
                <input
                  id="aot"
                  type="checkbox"
                  checked={draft.alwaysOnTop}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, alwaysOnTop: event.target.checked }))
                  }
                />
              </div>
            </SettingsGroup>

            <SettingsGroup
              id="output"
              title="Browser output"
              summary={
                draft.outputEnabled
                  ? `:${draft.outputPort}/timer · /confidence`
                  : 'Off'
              }
            >
              <p className="help">
                Keep this app running. Same port, two paths: <strong>/timer</strong> (full board) and{' '}
                <strong>/confidence</strong> (countdown only). Neither shows Settings.
              </p>
              <div className="check">
                <label htmlFor="output-enabled">Enable browser output</label>
                <input
                  id="output-enabled"
                  type="checkbox"
                  checked={draft.outputEnabled}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, outputEnabled: event.target.checked }))
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="output-port">Browser port</label>
                <input
                  id="output-port"
                  type="number"
                  min={1}
                  max={65535}
                  value={draft.outputPort}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      outputPort: Number(event.target.value) || 8010
                    }))
                  }
                />
              </div>
              {outputInfo.error ? <p className="help output-error">{outputInfo.error}</p> : null}
              {outputInfo.enabled &&
              (outputInfo.urls.length || (outputInfo.confidenceUrls || []).length) ? (
                <div className="output-urls">
                  <p className="kicker">Full timer (/timer)</p>
                  {outputInfo.urls.map((url) => (
                    <button
                      type="button"
                      className="output-url"
                      key={url}
                      onClick={() => void navigator.clipboard?.writeText(url)}
                      title="Copy address"
                    >
                      {url}
                    </button>
                  ))}
                  <p className="kicker">Confidence — countdown only (/confidence)</p>
                  {(outputInfo.confidenceUrls || []).map((url) => (
                    <button
                      type="button"
                      className="output-url"
                      key={url}
                      onClick={() => void navigator.clipboard?.writeText(url)}
                      title="Copy address"
                    >
                      {url}
                    </button>
                  ))}
                  <p className="help">
                    Use the LAN address (not 127.0.0.1) from another computer or from Pixera. Click
                    an address to copy it. This Mac can use http://127.0.0.1:{outputInfo.port}/timer
                    or /confidence.
                  </p>
                </div>
              ) : (
                <p className="help">Save to start the browser output and show the addresses here.</p>
              )}
            </SettingsGroup>

            <SettingsGroup
              id="profiles"
              title="Profiles"
              summary={
                hall
                  ? `${hall.name}${draft.heartbeatEnabled ? ' · heartbeat on' : ''}`
                  : 'Save connection presets'
              }
            >
              <div className="field">
                <label htmlFor="profile">Profile</label>
                <select
                  id="profile"
                  value={draft.activeProfileId}
                  onChange={(event) => {
                    const next = applyProfile(draft, event.target.value)
                    setDraft(next)
                    setHallName(
                      next.profiles.find((item) => item.id === next.activeProfileId)?.name || 'Profile'
                    )
                  }}
                >
                  {(draft.profiles || []).map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name} · {profile.host}:{profile.port}
                    </option>
                  ))}
                </select>
                <p className="help">
                  Save one profile per venue, then switch without retyping IP and port.
                </p>
              </div>
              <div className="field">
                <label htmlFor="profile-name">Profile name</label>
                <input
                  id="profile-name"
                  value={hallName}
                  onChange={(event) => setHallName(event.target.value)}
                />
              </div>
              <div className="theme-toggle">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setDraft((current) => saveActiveProfile(current, hallName))}
                >
                  Save this profile
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    const created = {
                      id: newProfileId(),
                      name: hallName.trim() || `Profile ${draft.profiles.length + 1}`,
                      host: draft.host.trim() || '127.0.0.1',
                      port: draft.port,
                      mode: draft.mode
                    }
                    setDraft((current) => ({
                      ...current,
                      profiles: [...current.profiles, created],
                      activeProfileId: created.id
                    }))
                  }}
                >
                  Add profile
                </button>
              </div>
              {draft.profiles.length > 1 ? (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    const rest = draft.profiles.filter((item) => item.id !== draft.activeProfileId)
                    const nextId = rest[0]?.id
                    if (!nextId) return
                    const next = applyProfile({ ...draft, profiles: rest }, nextId)
                    setDraft(next)
                    setHallName(
                      next.profiles.find((item) => item.id === next.activeProfileId)?.name || 'Profile'
                    )
                  }}
                >
                  Delete this profile
                </button>
              ) : null}
              <div className="check">
                <label htmlFor="heartbeat">Listen for Pixera heartbeat</label>
                <input
                  id="heartbeat"
                  type="checkbox"
                  checked={draft.heartbeatEnabled}
                  onChange={(event) => {
                    const next = { ...draft, heartbeatEnabled: event.target.checked }
                    setDraft(next)
                    void persist(next)
                  }}
                />
              </div>
              {draft.heartbeatEnabled ? (
                <>
                  <div className="grid-2">
                    <div className="field">
                      <label htmlFor="hb-port">Heartbeat UDP port</label>
                      <input
                        id="hb-port"
                        type="number"
                        min={1}
                        max={65535}
                        value={draft.heartbeatPort}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            heartbeatPort: Number(event.target.value) || 1401
                          }))
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="hb-mcast">Multicast (optional)</label>
                      <input
                        id="hb-mcast"
                        value={draft.heartbeatMulticast}
                        placeholder="224.0.2.20"
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            heartbeatMulticast: event.target.value
                          }))
                        }
                      />
                    </div>
                  </div>
                  <p className="help">
                    Match Pixera Settings → API → Heartbeat. This only listens for Pixera’s own UDP
                    JSON; it does not scan the LAN. Click a found system to fill IP, port, and mode.
                    Save after changing the UDP port.
                  </p>
                  {discoveries.length ? (
                    <div className="discoveries">
                      {discoveries.map((item) => (
                        <button
                          type="button"
                          className="output-url"
                          key={item.id}
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              host: item.ip,
                              port: item.port,
                              mode: item.mode
                            }))
                          }
                        >
                          {item.name} · {item.ip}:{item.port} · {item.protocol}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="help">Waiting for a heartbeat. `npm run mock` sends one to 127.0.0.1:1401.</p>
                  )}
                </>
              ) : null}
            </SettingsGroup>

            <SettingsGroup id="help" title="Pixera setup help" summary="Modes, API Input, API Output">
              <div className="setup-card">
                <p className="kicker">Which mode?</p>
                <ul>
                  {(Object.keys(MODE_LABELS) as ConnectionMode[]).map((mode) => (
                    <li key={mode}>
                      <strong>{MODE_LABELS[mode]}:</strong> {MODE_HELP[mode]}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="setup-card">
                <p className="kicker">Pixera API Access Input</p>
                <ul>
                  <li>
                    <strong>JSON/TCP on 1400:</strong> this port is live. Companion uses it too.
                    In this app pick <strong>Pixera JSON/TCP (auto)</strong> or{' '}
                    <strong>JSON/TCP (pxr1 header)</strong>, then Save and connect. Demo never talks
                    to Pixera, even if an IP is stored.
                  </li>
                  <li>
                    <strong>Adapter:</strong> Pixera’s own network card / IP, for example
                    192.168.10.20. Enter that same IP in this app. Use 127.0.0.1 only if the
                    dashboard runs on the Pixera computer.
                  </li>
                  <li>
                    <strong>Destination IP:</strong> leave empty, 0.0.0.0, or the same as Adapter.
                    Do not enter this Mac’s IP.
                  </li>
                  <li>
                    <strong>HTTP/TCP on port 0:</strong> that access is off. Pixera disables a port
                    when it is 0. Leave it at 0.
                  </li>
                </ul>
                <p className="kicker">Pixera API Access Output</p>
                <p className="help">
                  Leave unused, or port 0. Output is only for Pixera sending cue data out. This
                  dashboard only reads live state.
                </p>
                <p className="help">Restart Pixera after changing the API tab.</p>
              </div>
            </SettingsGroup>
            <BrandLink className="settings-logo" src="./logo_full_white.png" alt="Desert Dog" />
            </div>

            <div className="drawer-footer">
            <div className="drawer-actions">
              <button className="primary" onClick={() => void saveAndConnect()}>
                Save and connect
              </button>
              {live.status === 'connected' ? (
                <button
                  className="ghost"
                  onClick={async () => {
                    await dashboard.disconnect()
                  }}
                >
                  Disconnect
                </button>
              ) : null}
              <button className="ghost" onClick={() => void persist(draft)}>
                Save
              </button>
              <button className="ghost" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <p className="help drawer-version">Pixera Dashboard v{appVersion}</p>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  )
}
