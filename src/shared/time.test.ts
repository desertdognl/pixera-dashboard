import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { basename, countdownTimeFormat, formatDuration, framesToSeconds, parseHmsf } from './time'

describe('formatDuration', () => {
  it('returns a placeholder for missing values', () => {
    assert.equal(formatDuration(null, 'auto'), '--:--')
    assert.equal(formatDuration(Number.NaN, 'hmsf'), '--:--')
  })

  it('uses MM:SS in auto when under an hour', () => {
    assert.equal(formatDuration(125, 'auto'), '02:05')
  })

  it('uses HH:MM:SS in auto when an hour or more', () => {
    assert.equal(formatDuration(3661, 'auto'), '01:01:01')
  })

  it('can show total minutes, hms, and frames', () => {
    assert.equal(formatDuration(125, 'mmss'), '02:05')
    assert.equal(formatDuration(125, 'hms'), '00:02:05')
    assert.equal(formatDuration(1.5, 'hmsf', 60), '00:00:01:30')
  })

  it('keeps a minus sign for negative remaining time', () => {
    assert.equal(formatDuration(-3, 'mmss'), '-00:03')
  })
})

describe('countdownTimeFormat', () => {
  it('keeps the normal format outside the warning window', () => {
    assert.equal(countdownTimeFormat(12, 'auto', true, 10, 'hmsf'), 'auto')
  })

  it('switches to the warning format in the last N seconds', () => {
    assert.equal(countdownTimeFormat(10, 'auto', true, 10, 'hmsf'), 'hmsf')
    assert.equal(countdownTimeFormat(0.4, 'mmss', true, 10, 'hmsf'), 'hmsf')
  })

  it('does not switch when the warning is disabled', () => {
    assert.equal(countdownTimeFormat(1, 'auto', false, 10, 'hmsf'), 'auto')
  })
})

describe('timecode helpers', () => {
  it('converts frames with a valid fps', () => {
    assert.equal(framesToSeconds(120, 60), 2)
    assert.equal(framesToSeconds(120, 0), 0)
  })

  it('parses HH:MM:SS:FF', () => {
    assert.equal(parseHmsf('00:01:02:30', 60), 62.5)
    assert.equal(parseHmsf('bad', 60), null)
  })

  it('returns the file name from a path', () => {
    assert.equal(basename('C:\\media\\clip.mov'), 'clip.mov')
    assert.equal(basename('/shows/a/Opening_Look_4K.mov'), 'Opening_Look_4K.mov')
  })
})
