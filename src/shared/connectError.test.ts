import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { formatPixeraConnectError } from './connectError'

describe('formatPixeraConnectError', () => {
  it('explains host unreachable without framing tips', () => {
    const err = Object.assign(new Error('connect EHOSTUNREACH 172.16.110.120:1400'), {
      code: 'EHOSTUNREACH'
    })
    const text = formatPixeraConnectError(err, '172.16.110.120', 1400)
    assert.match(text, /Local Network/i)
    assert.match(text, /Demo mode/)
    assert.doesNotMatch(text, /pxr1/)
  })

  it('explains connection refused with Access Input tips', () => {
    const err = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:1400'), {
      code: 'ECONNREFUSED'
    })
    const text = formatPixeraConnectError(err, '127.0.0.1', 1400)
    assert.match(text, /refused/i)
    assert.match(text, /Access Input/)
  })

  it('keeps framing tips when the socket is up but API revision fails', () => {
    const text = formatPixeraConnectError(
      new Error('Connected to 1.2.3.4:1400 but Pixera did not return an API revision'),
      '1.2.3.4',
      1400
    )
    assert.match(text, /pxr1/)
  })
})
