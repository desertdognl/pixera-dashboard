import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { tcpFraming, applyProfile, inferCountdownFlag, countdownKindLabel, normalizeProfiles, DEFAULT_SETTINGS } from './types'

describe('tcpFraming', () => {
  it('does not open a socket in demo', () => {
    assert.equal(tcpFraming('demo'), null)
  })

  it('maps each JSON/TCP mode to a packet style', () => {
    assert.equal(tcpFraming('json-tcp-auto'), 'auto')
    assert.equal(tcpFraming('json-tcp'), 'pxr1')
    assert.equal(tcpFraming('json-tcp-dl'), 'delimiter')
  })
})

describe('connection profiles', () => {
  it('falls back to Profile 1 when nothing was saved', () => {
    const profiles = normalizeProfiles(undefined)
    assert.equal(profiles.length, 1)
    assert.equal(profiles[0].name, 'Profile 1')
  })

  it('applies a profile onto host, port, and mode', () => {
    const settings = applyProfile(
      {
        ...DEFAULT_SETTINGS,
        profiles: [
          { id: 'a', name: 'Arena', host: '192.168.10.20', port: 1400, mode: 'json-tcp' }
        ],
        activeProfileId: 'hall-1'
      },
      'a'
    )
    assert.equal(settings.host, '192.168.10.20')
    assert.equal(settings.mode, 'json-tcp')
    assert.equal(settings.activeProfileId, 'a')
  })
})

describe('countdown kind', () => {
  it('treats a playing countdown as cue and a paused one as wait', () => {
    assert.equal(inferCountdownFlag('play', 12), 1)
    assert.equal(inferCountdownFlag('pause', 4), 2)
    assert.equal(inferCountdownFlag('play', 0), null)
    assert.equal(countdownKindLabel(1), 'Cue countdown')
    assert.equal(countdownKindLabel(2), 'Wait')
  })
})
