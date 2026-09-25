import { basename, framesToSeconds } from '../shared/time'
import {
  LAYERS_TTL_MS,
  NAMES_TTL_MS,
  TIMELINE_SCAN_PER_TICK,
  VIDEO_TTL_MS
} from '../shared/poll'
import type { AppSettings, LayerOption, LiveState, TimelineOption } from '../shared/types'
import { EMPTY_LIVE_STATE, inferCountdownFlag, tcpFraming } from '../shared/types'
import { PixeraClient } from './pixeraClient'

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return null
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asHandle(value: unknown): number | string | null {
  if (typeof value === 'number' && Number.isFinite(value) && value !== 0) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  return null
}

function transportLabel(mode: unknown): LiveState['transport'] {
  if (mode === 1) return 'play'
  if (mode === 2) return 'pause'
  if (mode === 3) return 'stop'
  return 'unknown'
}

function widgetOn(settings: AppSettings, id: AppSettings['widgets'][number]['id']): boolean {
  return settings.widgets.some((widget) => widget.id === id && widget.enabled)
}

export class PixeraSession {
  private client = new PixeraClient()
  private settings: AppSettings
  private timelines: TimelineOption[] = []
  private layers: LayerOption[] = []
  private fps = 60
  private fpsByName = new Map<string, number>()
  private namesAt = 0
  private lastCountdown: number | null = null
  private cueStartSeconds: number | null = null
  private followedName = ''
  private layersFor = ''
  private layersAt = 0
  private timelineHandle: number | string | null = null
  private lastTransport: number | null = null
  private scanIndex = 0
  private skipClipQuery = false
  private videoAt = 0
  private lastMedia = { layerName: '', videoFile: '' }
  private cueNames = { cueName: '', nextCueName: '' }
  private compoundCueNames = false
  private triedCompoundCueNames = false
  private triedCountdownFlag = false
  private compoundCountdownFlag = false

  constructor(settings: AppSettings) {
    this.settings = settings
  }

  async connect(): Promise<{ apiRevision: number | null; projectName: string | null }> {
    const host = this.settings.host.trim()
    const framing = tcpFraming(this.settings.mode) || 'auto'
    const apiRevision = asNumber(await this.client.connect(host, this.settings.port, framing))
    if (apiRevision == null) {
      throw new Error(`Connected to ${host}:${this.settings.port} but Pixera did not return an API revision`)
    }
    this.resetCaches()
    return { apiRevision, projectName: null }
  }

  async close(): Promise<void> {
    await this.client.close()
  }

  isConnected(): boolean {
    return this.client.isConnected()
  }

  async poll(settings: AppSettings): Promise<Partial<LiveState>> {
    this.settings = settings
    await this.refreshNames()

    const timeline = await this.followActiveTimeline()
    if (!timeline) {
      return {
        timelines: this.timelines,
        layers: [],
        timelineName: '',
        layerName: '',
        videoFile: '',
        error: this.timelines.length ? 'No playing timeline found' : 'No timelines found in Pixera'
      }
    }

    if (this.followedName !== timeline.name) {
      this.followedName = timeline.name
      this.lastCountdown = null
      this.cueStartSeconds = null
      this.lastMedia = { layerName: '', videoFile: '' }
      this.cueNames = { cueName: '', nextCueName: '' }
      this.videoAt = 0
      this.layersFor = ''
      const cachedFps = this.fpsByName.get(timeline.name)
      if (cachedFps) {
        this.fps = cachedFps
      } else {
        const fps = asNumber(
          await this.safeCall('Pixera.Compound.getFpsOfTimeline', { name: timeline.name })
        )
        if (fps) {
          this.fps = fps
          this.fpsByName.set(timeline.name, fps)
        }
      }
    }

    const currentSeconds = asNumber(
      await this.safeCall('Pixera.Compound.getCurrentTimeOfTimelineInSeconds', { name: timeline.name })
    )
    const countdownFrames = asNumber(
      await this.safeCall('Pixera.Compound.getCurrentCountdownOfTimeline', { name: timeline.name })
    )
    const countdownSeconds =
      countdownFrames != null ? framesToSeconds(countdownFrames, this.fps) : null

    const jumped =
      this.cueStartSeconds == null ||
      (this.lastCountdown != null &&
        countdownSeconds != null &&
        countdownSeconds > this.lastCountdown + 0.4)
    if (currentSeconds != null && jumped) {
      this.cueStartSeconds = currentSeconds
      this.skipClipQuery = true
    }
    this.lastCountdown = countdownSeconds

    const media = widgetOn(settings, 'videoFile')
      ? await this.resolveVideo(timeline.name)
      : this.lastMedia

    await this.resolveCueNames(timeline.name, jumped, settings)
    const countdownFlag = await this.resolveCountdownFlag(
      transportLabel(this.lastTransport),
      countdownSeconds
    )

    return {
      timelines: this.timelines,
      layers: this.layers,
      timelineName: timeline.name,
      layerName: media.layerName,
      fps: this.fps,
      transport: transportLabel(this.lastTransport),
      videoFile: media.videoFile,
      cueName: this.cueNames.cueName,
      nextCueName: this.cueNames.nextCueName,
      timeToNextCueSeconds: countdownSeconds,
      countdownFlag,
      cueElapsedSeconds:
        currentSeconds != null && this.cueStartSeconds != null
          ? Math.max(0, currentSeconds - this.cueStartSeconds)
          : null,
      timelineSeconds: currentSeconds,
      error: null
    }
  }

  private resetCaches(): void {
    this.timelines = []
    this.layers = []
    this.fpsByName.clear()
    this.lastCountdown = null
    this.cueStartSeconds = null
    this.followedName = ''
    this.layersFor = ''
    this.layersAt = 0
    this.timelineHandle = null
    this.lastTransport = null
    this.scanIndex = 0
    this.skipClipQuery = false
    this.videoAt = 0
    this.lastMedia = { layerName: '', videoFile: '' }
    this.cueNames = { cueName: '', nextCueName: '' }
    this.compoundCueNames = false
    this.triedCompoundCueNames = false
    this.triedCountdownFlag = false
    this.compoundCountdownFlag = false
  }

  private async refreshNames(): Promise<void> {
    if (this.timelines.length && Date.now() - this.namesAt < NAMES_TTL_MS) return
    const names = await this.safeCall<string[]>('Pixera.Timelines.getTimelineNames')
    this.timelines = Array.isArray(names)
      ? names.map((name, index) => ({ name, handle: index + 1 }))
      : []
    this.namesAt = Date.now()
  }

  private async followActiveTimeline(): Promise<TimelineOption | null> {
    if (!this.timelines.length) return null

    if (this.followedName) {
      const current = this.timelines.find((item) => item.name === this.followedName)
      if (current) {
        this.lastTransport = await this.transportOf(current.name)
        if (this.lastTransport === 1) return current
      }
    }

    const others = this.timelines.filter((item) => item.name !== this.followedName)
    if (others.length) {
      const start = this.scanIndex % others.length
      const count = Math.min(TIMELINE_SCAN_PER_TICK, others.length)
      for (let i = 0; i < count; i += 1) {
        const timeline = others[(start + i) % others.length]
        const mode = await this.transportOf(timeline.name)
        if (mode === 1) {
          this.lastTransport = 1
          this.scanIndex = start + i + 1
          return timeline
        }
      }
      this.scanIndex = start + count
    }

    if (this.settings.timelineName) {
      const pinned = this.timelines.find((item) => item.name === this.settings.timelineName)
      if (pinned) return pinned
    }

    return this.timelines.find((item) => item.name === this.followedName) || this.timelines[0]
  }

  private async resolveCountdownFlag(
    transport: LiveState['transport'],
    remainingSeconds: number | null
  ): Promise<number | null> {
    if (!this.triedCountdownFlag) {
      this.triedCountdownFlag = true
      const flag = asNumber(
        await this.safeCall('Pixera.Compound.getCurrentCountdownFlagOfTimeline', {
          name: this.followedName
        })
      )
      if (flag === 1 || flag === 2) this.compoundCountdownFlag = true
      if (this.compoundCountdownFlag) return flag
    } else if (this.compoundCountdownFlag) {
      const flag = asNumber(
        await this.safeCall('Pixera.Compound.getCurrentCountdownFlagOfTimeline', {
          name: this.followedName
        })
      )
      if (flag === 1 || flag === 2) return flag
    }
    return inferCountdownFlag(transport, remainingSeconds)
  }

  private async resolveCueNames(timelineName: string, jumped: boolean, settings: AppSettings): Promise<void> {
    const want = widgetOn(settings, 'cueName') || widgetOn(settings, 'nextCueName')
    if (!want) return
    if (!jumped && (this.cueNames.cueName || this.cueNames.nextCueName)) return

    if (!this.triedCompoundCueNames) {
      this.triedCompoundCueNames = true
      const current = asString(
        await this.safeCall('Pixera.Compound.getCurrentCueNameOnTimeline', { timelineName })
      )
      const next = asString(
        await this.safeCall('Pixera.Compound.getNextCueNameOnTimeline', { timelineName })
      )
      if (current || next) {
        this.compoundCueNames = true
        this.cueNames = { cueName: current, nextCueName: next }
        return
      }
    } else if (this.compoundCueNames) {
      this.cueNames = {
        cueName: asString(
          await this.safeCall('Pixera.Compound.getCurrentCueNameOnTimeline', { timelineName })
        ),
        nextCueName: asString(
          await this.safeCall('Pixera.Compound.getNextCueNameOnTimeline', { timelineName })
        )
      }
      return
    }

    const handle =
      this.timelineHandle ||
      asHandle(await this.safeCall('Pixera.Timelines.getTimelineFromName', { name: timelineName }))
    if (handle == null) return
    this.timelineHandle = handle
    const prev = asHandle(await this.safeCall('Pixera.Timelines.Timeline.getCuePrevious', { handle }))
    const next = asHandle(await this.safeCall('Pixera.Timelines.Timeline.getCueNext', { handle }))
    const cueName = prev
      ? asString(await this.safeCall('Pixera.Timelines.Cue.getName', { handle: prev }))
      : this.cueNames.cueName
    const nextCueName = next
      ? asString(await this.safeCall('Pixera.Timelines.Cue.getName', { handle: next }))
      : this.cueNames.nextCueName
    this.cueNames = { cueName, nextCueName }
  }

  private async refreshLayers(timelineName: string): Promise<void> {
    if (this.layersFor === timelineName && Date.now() - this.layersAt < LAYERS_TTL_MS) return
    this.layersFor = timelineName
    this.layersAt = Date.now()
    this.timelineHandle =
      asHandle(await this.safeCall('Pixera.Timelines.getTimelineFromName', { name: timelineName })) ||
      timelineName
    const names = await this.safeCall<string[]>('Pixera.Timelines.Timeline.getLayerNames', {
      handle: this.timelineHandle
    })
    const layerNames = Array.isArray(names) && names.length ? names.filter(Boolean) : ['Layer 1']
    this.layers = layerNames.slice(0, 8).map((name, index) => ({ name, handle: index + 1 }))
  }

  private async resolveVideo(timelineName: string): Promise<{ layerName: string; videoFile: string }> {
    const skipClip = this.skipClipQuery
    this.skipClipQuery = false

    if (this.lastMedia.videoFile && Date.now() - this.videoAt < VIDEO_TTL_MS) {
      return this.lastMedia
    }

    await this.refreshLayers(timelineName)
    const preferred = this.settings.layerName.trim()
    const layer = preferred || this.layers[0]?.name || 'Layer 1'
    const assigned = await this.resourceOf(timelineName, layer)
    if (assigned) {
      this.lastMedia = { layerName: layer, videoFile: assigned }
      this.videoAt = Date.now()
      return this.lastMedia
    }

    if (skipClip) {
      return this.lastMedia.layerName ? this.lastMedia : { ...this.lastMedia, layerName: layer }
    }

    const fromClip = await this.clipCurrentName(timelineName, layer)
    this.lastMedia = {
      layerName: layer,
      videoFile: fromClip || this.lastMedia.videoFile
    }
    this.videoAt = Date.now()
    return this.lastMedia
  }

  private async resourceOf(timelineName: string, layerName: string): Promise<string> {
    const resource = asString(
      await this.safeCall('Pixera.Compound.getResourceAssignedToLayer', {
        layerPath: `${timelineName}.${layerName}`
      })
    )
    return resource ? basename(resource) : ''
  }

  private async clipCurrentName(timelineName: string, layerName: string): Promise<string> {
    const handle = `${timelineName}.${layerName}`
    const current = asHandle(
      await this.safeCall('Pixera.Timelines.Layer.getClipCurrent', { handle, offset: 0 })
    )
    if (current == null) return ''
    const resource = asString(
      await this.safeCall('Pixera.Timelines.Clip.getAssignedResourceName', { handle: current })
    )
    return resource ? basename(resource) : ''
  }

  private async transportOf(name: string): Promise<number | null> {
    return asNumber(
      await this.safeCall('Pixera.Compound.getTransportModeOnTimeline', { timelineName: name })
    )
  }

  private async safeCall<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T | null> {
    try {
      return await this.client.call<T>(method, params, 2500)
    } catch {
      return null
    }
  }
}

export function withLiveDefaults(partial: Partial<LiveState>, status: LiveState['status']): LiveState {
  return {
    ...EMPTY_LIVE_STATE,
    ...partial,
    status,
    updatedAt: Date.now()
  }
}
