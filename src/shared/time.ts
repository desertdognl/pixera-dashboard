import type { TimeFormat } from './types'

export function framesToSeconds(frames: number, fps: number): number {
  if (!Number.isFinite(frames) || !Number.isFinite(fps) || fps <= 0) return 0
  return frames / fps
}

export function parseHmsf(value: string | null | undefined, fps: number): number | null {
  if (!value) return null
  const parts = value.trim().split(/[:;]/)
  if (parts.length < 3) return null
  const hours = Number(parts[0])
  const minutes = Number(parts[1])
  const seconds = Number(parts[2])
  const frames = parts.length > 3 ? Number(parts[3]) : 0
  if ([hours, minutes, seconds, frames].some((n) => Number.isNaN(n))) return null
  return hours * 3600 + minutes * 60 + seconds + framesToSeconds(frames, fps || 60)
}

export function formatDuration(totalSeconds: number | null, format: TimeFormat, fps = 60): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds)) return '--:--'
  const negative = totalSeconds < 0
  const abs = Math.max(0, Math.abs(totalSeconds))
  const hours = Math.floor(abs / 3600)
  const minutes = Math.floor((abs % 3600) / 60)
  const seconds = Math.floor(abs % 60)
  const frames = Math.floor((abs - Math.floor(abs)) * (fps || 60))
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  const ff = String(frames).padStart(2, '0')
  const hh = String(hours).padStart(2, '0')

  let body: string
  switch (format) {
    case 'mmss':
      body = `${String(hours * 60 + minutes).padStart(2, '0')}:${ss}`
      break
    case 'hms':
      body = `${hh}:${mm}:${ss}`
      break
    case 'hmsf':
      body = `${hh}:${mm}:${ss}:${ff}`
      break
    default:
      body = hours > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`
  }

  return negative ? `-${body}` : body
}

export function countdownTimeFormat(
  remainingSeconds: number | null,
  normal: TimeFormat,
  warnEnabled: boolean,
  warnSeconds: number,
  warnFormat: TimeFormat
): TimeFormat {
  if (
    warnEnabled &&
    remainingSeconds != null &&
    remainingSeconds <= Math.max(0, warnSeconds)
  ) {
    return warnFormat
  }
  return normal
}

export function basename(filePath: string): string {
  if (!filePath) return ''
  const cleaned = filePath.replace(/\\/g, '/')
  const name = cleaned.split('/').pop() || cleaned
  return name
}
