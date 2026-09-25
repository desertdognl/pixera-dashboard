import dgram from 'node:dgram'
import { mergeDiscoveries, parseHeartbeat, type DiscoveredPixera } from '../shared/heartbeat'

export class HeartbeatListener {
  private socket: dgram.Socket | null = null
  private items: DiscoveredPixera[] = []
  private error: string | null = null
  private onChange: (items: DiscoveredPixera[], error: string | null) => void

  constructor(onChange: (items: DiscoveredPixera[], error: string | null) => void) {
    this.onChange = onChange
  }

  list(): DiscoveredPixera[] {
    return this.items
  }

  lastError(): string | null {
    return this.error
  }

  async start(port: number, multicast = ''): Promise<string | null> {
    await this.stop()
    this.error = null
    const bindPort = Math.min(65535, Math.max(1, Math.round(port) || 1401))
    const group = multicast.trim()
    await new Promise<void>((resolve) => {
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
      socket.on('error', (err) => {
        this.error = err.message
        this.onChange(this.items, this.error)
        resolve()
      })
      socket.on('message', (msg) => {
        this.items = mergeDiscoveries(this.items, parseHeartbeat(msg))
        this.onChange(this.items, this.error)
      })
      socket.bind(bindPort, '0.0.0.0', () => {
        this.socket = socket
        this.error = null
        if (group && isMulticast(group)) {
          try {
            socket.addMembership(group)
          } catch (error) {
            this.error = error instanceof Error ? error.message : String(error)
          }
        }
        this.onChange(this.items, this.error)
        resolve()
      })
    })
    return this.error
  }

  async stop(): Promise<void> {
    const socket = this.socket
    this.socket = null
    this.items = []
    if (!socket) return
    await new Promise<void>((resolve) => {
      socket.close(() => resolve())
    })
  }
}

function isMulticast(ip: string): boolean {
  const first = Number(ip.split('.')[0])
  return first >= 224 && first <= 239
}
