import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { interpolationMs, liveFingerprint, pollDelay, snapPollMs } from './poll'
import { EMPTY_LIVE_STATE } from './types'

describe('pollDelay', () => {
  it('never polls faster than 1.2s', () => {
    assert.equal(pollDelay(100), 1200)
    assert.equal(pollDelay(1500), 1500)
    assert.equal(pollDelay(undefined), 1500)
  })

  it('slows down when the UI is idle', () => {
    assert.equal(pollDelay(1500, true), 4000)
    assert.equal(pollDelay(4000, true), 4000)
  })

  it('snaps to an allowed interval and never below 1.2s', () => {
    assert.equal(pollDelay(1300), 1200)
    assert.equal(pollDelay(1800), 2000)
  })
})

describe('snapPollMs', () => {
  it('picks the nearest allowed interval', () => {
    assert.equal(snapPollMs(1199), 1200)
    assert.equal(snapPollMs(1300), 1200)
    assert.equal(snapPollMs(1800), 2000)
    assert.equal(snapPollMs(2600), 3000)
    assert.equal(snapPollMs(9999), 4000)
    assert.equal(snapPollMs(undefined), 1500)
  })
})

describe('interpolationMs', () => {
  it('ticks slower unless frames are shown', () => {
    assert.equal(interpolationMs(false), 250)
    assert.equal(interpolationMs(true), 100)
  })
})

describe('liveFingerprint', () => {
  it('ignores tiny time jitter inside the same tenth of a second', () => {
    const a = liveFingerprint({
      ...EMPTY_LIVE_STATE,
      transport: 'pause',
      timeToNextCueSeconds: 10.01,
      cueElapsedSeconds: 4.02
    })
    const b = liveFingerprint({
      ...EMPTY_LIVE_STATE,
      transport: 'pause',
      timeToNextCueSeconds: 10.04,
      cueElapsedSeconds: 4.04
    })
    assert.equal(a, b)
  })

  it('changes when transport or names change', () => {
    const paused = liveFingerprint({ ...EMPTY_LIVE_STATE, transport: 'pause', timelineName: 'MOVIE 1' })
    const playing = liveFingerprint({ ...EMPTY_LIVE_STATE, transport: 'play', timelineName: 'MOVIE 1' })
    const other = liveFingerprint({ ...EMPTY_LIVE_STATE, transport: 'pause', timelineName: 'MOVIE 2' })
    assert.notEqual(paused, playing)
    assert.notEqual(paused, other)
  })
})
