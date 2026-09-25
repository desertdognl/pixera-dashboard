#!/usr/bin/env node
import net from 'node:net'
import dgram from 'node:dgram'

const PORT = Number(process.env.PIXERA_MOCK_PORT || 1400)
const HEARTBEAT_PORT = Number(process.env.PIXERA_HEARTBEAT_PORT || 1401)
const DELIMITER = '0xPX'

const state = {
  fps: 60,
  currentFrames: 1200,
  cueElapsed: 18,
  timeToNext: 42,
  cueIndex: 0
}

const cues = [
  { name: '1.01 House open', next: '1.02 Walk in', file: 'Opening_Look_4K.mov' },
  { name: '1.02 Walk in', next: '2.01 Speaker', file: 'Speaker_Loop_Main.mp4' },
  { name: '2.01 Speaker', next: '3.01 Band', file: 'Band_Intro_Wide.mov' }
]

setInterval(() => {
  state.currentFrames += 1
  state.cueElapsed += 1 / state.fps
  state.timeToNext -= 1 / state.fps
  if (state.timeToNext <= 0) {
    state.cueIndex = (state.cueIndex + 1) % cues.length
    state.timeToNext = 30 + state.cueIndex * 8
    state.cueElapsed = 0
  }
}, 1000 / state.fps)

function result(id, value) {
  return JSON.stringify({ jsonrpc: '2.0', id, result: value }) + DELIMITER
}

function handle(message) {
  const method = message.method
  const id = message.id
  const cue = cues[state.cueIndex]
  switch (method) {
    case 'Pixera.Utility.getApiRevision':
      return result(id, 441)
    case 'Pixera.Compound.getProjectName':
    case 'Pixera.Session.getProjectName':
      return result(id, 'Mock Show')
    case 'Pixera.Timelines.getTimelineNames':
      return result(id, ['Show Timeline'])
    case 'Pixera.Timelines.getTimelineFromName':
      return result(id, 1001)
    case 'Pixera.Timelines.getTimelines':
      return result(id, [1001])
    case 'Pixera.Timelines.Timeline.getName':
      return result(id, 'Show Timeline')
    case 'Pixera.Timelines.Timeline.getFps':
      return result(id, state.fps)
    case 'Pixera.Timelines.Timeline.getCurrentTime':
      return result(id, Math.round(state.currentFrames))
    case 'Pixera.Timelines.Timeline.getTransportMode':
      return result(id, 1)
    case 'Pixera.Timelines.Timeline.getLayerNames':
      return result(id, ['Main Content'])
    case 'Pixera.Timelines.Timeline.getLayers':
      return result(id, [2001])
    case 'Pixera.Timelines.Layer.getName':
      return result(id, 'Main Content')
    case 'Pixera.Compound.getFpsOfTimeline':
      return result(id, state.fps)
    case 'Pixera.Compound.getTransportModeOnTimeline':
      return result(id, 1)
    case 'Pixera.Compound.getCurrentTimeOfTimelineInSeconds':
      return result(id, state.currentFrames / state.fps)
    case 'Pixera.Compound.getResourceAssignedToLayer':
      return result(id, `Media/${cue.file}`)
    case 'Pixera.Compound.getCurrentCountdownOfTimeline':
      return result(id, Math.round(state.timeToNext * state.fps))
    case 'Pixera.Compound.getCurrentCountdownFlagOfTimeline':
      return result(id, state.timeToNext <= 8 ? 2 : 1)
    case 'Pixera.Compound.getCurrentCueNameOnTimeline':
      return result(id, cue.name)
    case 'Pixera.Compound.getNextCueNameOnTimeline':
      return result(id, cue.next)
    case 'Pixera.Compound.getCurrentCountdownHMSFOfTimeline': {
      const total = Math.max(0, state.timeToNext)
      const m = String(Math.floor(total / 60)).padStart(2, '0')
      const s = String(Math.floor(total % 60)).padStart(2, '0')
      const f = String(Math.floor((total % 1) * state.fps)).padStart(2, '0')
      return result(id, `00:${m}:${s}:${f}`)
    }
    case 'Pixera.Timelines.Timeline.getCuePrevious':
      return result(id, 3001)
    case 'Pixera.Timelines.Timeline.getCueNext':
      return result(id, 3002)
    case 'Pixera.Timelines.Cue.getName':
      return result(id, message.params?.handle === 3002 ? cue.next : cue.name)
    case 'Pixera.Timelines.Cue.getTime':
      return result(id, state.currentFrames - state.cueElapsed * state.fps)
    case 'Pixera.Timelines.Layer.getClipCurrent':
      return result(id, 4001)
    case 'Pixera.Timelines.Clip.getAssignedResourceName':
      return result(id, cue.file)
    default:
      return result(id, null)
  }
}

const server = net.createServer((socket) => {
  let buffer = ''
  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8')
    let index
    while ((index = buffer.indexOf(DELIMITER)) >= 0) {
      const raw = buffer.slice(0, index)
      buffer = buffer.slice(index + DELIMITER.length)
      if (!raw.trim()) continue
      try {
        const message = JSON.parse(raw)
        socket.write(handle(message))
      } catch (error) {
        console.error('Bad JSON from client', error)
      }
    }
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Mock Pixera JSON/TCP (dl) listening on 127.0.0.1:${PORT}`)
})

const heartbeat = dgram.createSocket('udp4')
setInterval(() => {
  const payload = Buffer.from(
    JSON.stringify([
      { type: 'protocol', ip: '127.0.0.1', port: PORT, protocol: 'JSON/TCP (dl)' },
      {
        type: 'liveSystemHeartbeats',
        heartbeats: [{ ip: '127.0.0.1', isLocal: true, name: 'Mock Pixera' }]
      }
    ])
  )
  heartbeat.send(payload, HEARTBEAT_PORT, '127.0.0.1')
}, 1000)
console.log(`Mock Pixera heartbeat UDP → 127.0.0.1:${HEARTBEAT_PORT}`)
