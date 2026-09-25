import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { STAGE_SCALE_MAX, fitStageScale } from './stageScale'

describe('fitStageScale', () => {
  it('scales down so a tall board fits under the topbar', () => {
    const scale = fitStageScale(1920, 900, 1180, 980)
    assert.ok(scale * 980 <= 900)
    assert.ok(scale < 1)
  })

  it('does not use a 700px design height when the board is taller', () => {
    const actual = fitStageScale(1600, 1000, 1180, 950)
    const naive = Math.min(1600 / 1180, 1000 / 700, STAGE_SCALE_MAX)
    assert.ok(actual * 950 <= 1000)
    assert.ok(actual < naive)
  })

  it('never scales larger than the available box', () => {
    const scale = fitStageScale(800, 420, 1180, 900, { max: 1.35, fit: 1 })
    assert.ok(scale * 900 <= 420)
    assert.ok(scale * 1180 <= 800)
  })

  it('caps upscaling', () => {
    assert.equal(fitStageScale(4000, 3000, 1180, 400), STAGE_SCALE_MAX)
  })

  it('returns 1 when sizes are missing', () => {
    assert.equal(fitStageScale(0, 800, 1180, 700), 1)
    assert.equal(fitStageScale(800, 800, 0, 700), 1)
  })
})
