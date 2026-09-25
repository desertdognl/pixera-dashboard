import { basename } from './time'
import type { LiveState } from './types'
import { EMPTY_LIVE_STATE } from './types'

const VIDEO_FILES = [
  'Opening_Look_4K.mov',
  'Speaker_Loop_Main.mp4',
  'Band_Intro_Wide.mov',
  'IMAG_Fill_Left.mp4',
  'Logo_Sting.mov'
]

const CUES = [
  { name: '1.01 House open', next: '1.02 Walk in', file: VIDEO_FILES[0] },
  { name: '1.02 Walk in', next: '2.01 Speaker', file: VIDEO_FILES[1] },
  { name: '2.01 Speaker', next: '3.01 Band', file: VIDEO_FILES[2] },
  { name: '3.01 Band', next: '4.01 Logo', file: VIDEO_FILES[3] },
  { name: '4.01 Logo', next: '1.01 House open', file: VIDEO_FILES[4] }
]

export class DemoEngine {
  private cueIndex = 0
  private cueElapsed = 12
  private timeToNext = 22
  private started = Date.now()

  snapshot(): LiveState {
    const now = Date.now()
    const dt = Math.min(0.25, (now - this.started) / 1000)
    this.started = now
    this.cueElapsed += dt
    this.timeToNext -= dt
    if (this.timeToNext <= 0) {
      this.cueIndex = (this.cueIndex + 1) % CUES.length
      this.timeToNext = 35 + (this.cueIndex * 11) % 50
      this.cueElapsed = 0
    }

    const cue = CUES[this.cueIndex]
    return {
      ...EMPTY_LIVE_STATE,
      status: 'connected',
      error: null,
      apiRevision: 441,
      projectName: 'Demo Show',
      timelineName: 'Show Timeline',
      layerName: 'Main Content',
      timelines: [
        { name: 'Show Timeline', handle: 1 },
        { name: 'Overlay', handle: 2 }
      ],
      layers: [
        { name: 'Main Content', handle: 11 },
        { name: 'IMAG', handle: 12 }
      ],
      transport: 'play',
      fps: 60,
      videoFile: basename(cue.file),
      cueName: cue.name,
      nextCueName: cue.next,
      timeToNextCueSeconds: this.timeToNext,
      cueElapsedSeconds: this.cueElapsed,
      timelineSeconds: this.cueIndex * 90 + this.cueElapsed,
      countdownFlag: this.timeToNext <= 8 ? 2 : 1,
      updatedAt: now
    }
  }
}
