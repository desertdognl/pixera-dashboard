import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mergeDiscoveries, parseHeartbeat, protocolToMode } from './heartbeat'

const SAMPLE = JSON.stringify([
  { type: 'protocol', ip: '172.18.84.225', port: 1400, protocol: 'JSON/TCP' },
  {
    type: 'liveSystemHeartbeats',
    heartbeats: [
      { ip: '172.18.84.225', isLocal: true, name: 'Local' },
      { ip: '172.18.84.223', isLocal: false, name: '17N01' }
    ]
  }
])

describe('protocolToMode', () => {
  it('maps JSON/TCP variants and ignores send-only protocols', () => {
    assert.equal(protocolToMode('JSON/TCP'), 'json-tcp')
    assert.equal(protocolToMode('JSON/TCP (dl)'), 'json-tcp-dl')
    assert.equal(protocolToMode('OSC/UDP'), null)
    assert.equal(protocolToMode('HTTP/TCP'), null)
  })
})

describe('parseHeartbeat', () => {
  it('reads Pixera heartbeat JSON and keeps JSON/TCP entries', () => {
    const found = parseHeartbeat(SAMPLE, 1000)
    assert.equal(found.length, 1)
    assert.equal(found[0].ip, '172.18.84.225')
    assert.equal(found[0].port, 1400)
    assert.equal(found[0].mode, 'json-tcp')
    assert.equal(found[0].name, 'Local')
  })

  it('returns nothing for garbage', () => {
    assert.deepEqual(parseHeartbeat('not json'), [])
    assert.deepEqual(parseHeartbeat(''), [])
  })
})

describe('mergeDiscoveries', () => {
  it('drops stale entries and updates seenAt', () => {
    const first = parseHeartbeat(SAMPLE, 1000)
    const later = mergeDiscoveries(first, [], 10000, 8000)
    assert.equal(later.length, 0)
    const kept = mergeDiscoveries(first, parseHeartbeat(SAMPLE, 1500), 1500, 8000)
    assert.equal(kept[0].seenAt, 1500)
  })
})
