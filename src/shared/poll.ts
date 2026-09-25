import type { LiveState } from './types'

export const MIN_POLL_MS = 1200
export const DEFAULT_POLL_MS = 1500
export const IDLE_POLL_MS = 4000
export const NAMES_TTL_MS = 15000
export const VIDEO_TTL_MS = 8000
export const LAYERS_TTL_MS = 15000
export const TIMELINE_SCAN_PER_TICK = 2

export const POLL_CHOICES: { ms: number; label: string }[] = [
  { ms: 1200, label: '1.2 s — lightest allowed' },
  { ms: 1500, label: '1.5 s — default' },
  { ms: 2000, label: '2 s' },
  { ms: 3000, label: '3 s' },
  { ms: 4000, label: '4 s' }
]

export function snapPollMs(ms?: number): number {
  const n = Math.max(MIN_POLL_MS, Math.round(Number(ms) || DEFAULT_POLL_MS))
  return POLL_CHOICES.reduce((best, choice) =>
    Math.abs(choice.ms - n) < Math.abs(best.ms - n) ? choice : best
  ).ms
}

export function pollDelay(ms?: number, idle = false): number {
  const base = snapPollMs(ms)
  return idle ? Math.max(base, IDLE_POLL_MS) : base
}

export function interpolationMs(needsFrames: boolean): number {
  return needsFrames ? 100 : 250
}

export function liveFingerprint(state: Pick<
  LiveState,
  | 'status'
  | 'error'
  | 'timelineName'
  | 'layerName'
  | 'videoFile'
  | 'transport'
  | 'timeToNextCueSeconds'
  | 'cueElapsedSeconds'
  | 'timelineSeconds'
  | 'cueName'
  | 'nextCueName'
  | 'countdownFlag'
>): string {
  return [
    state.status,
    state.error || '',
    state.timelineName,
    state.layerName,
    state.videoFile,
    state.transport,
    Math.round((state.timeToNextCueSeconds ?? -1) * 10),
    Math.round((state.cueElapsedSeconds ?? -1) * 10),
    Math.round((state.timelineSeconds ?? -1) * 10),
    state.cueName,
    state.nextCueName,
    String(state.countdownFlag ?? '')
  ].join('|')
}
