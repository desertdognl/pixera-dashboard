export const STAGE_DESIGN_WIDTH = 1180
export const STAGE_SCALE_MIN = 0.1
export const STAGE_SCALE_MAX = 1.35
export const STAGE_FIT = 0.98

export function fitStageScale(
  availableWidth: number,
  availableHeight: number,
  boardWidth: number,
  boardHeight: number,
  options?: { min?: number; max?: number; fit?: number }
): number {
  const min = options?.min ?? STAGE_SCALE_MIN
  const max = options?.max ?? STAGE_SCALE_MAX
  const fit = options?.fit ?? STAGE_FIT
  if (availableWidth <= 0 || availableHeight <= 0 || boardWidth <= 0 || boardHeight <= 0) {
    return 1
  }
  const next = Math.min((availableWidth / boardWidth) * fit, (availableHeight / boardHeight) * fit, max)
  return Math.max(min, next)
}
