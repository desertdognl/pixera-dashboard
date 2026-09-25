import type { ConnectionMode } from './types'

export const DEFAULT_HEARTBEAT_PORT = 1401

export interface DiscoveredPixera {
  id: string
  ip: string
  port: number
  protocol: string
  mode: ConnectionMode
  name: string
  seenAt: number
}

function asIp(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asPort(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return null
  const port = Math.round(n)
  if (port < 1 || port > 65535) return null
  return port
}

export function protocolToMode(protocol: string): ConnectionMode | null {
  const p = protocol.toLowerCase()
  if (p.includes('http') || p.includes('osc') || p.includes('udp') || p.includes('binary')) return null
  if (p.includes('dl') || p.includes('0xpx')) return 'json-tcp-dl'
  if (p.includes('json/tcp') || p.includes('json-tcp') || p.includes('pxr1')) return 'json-tcp'
  return null
}

function protocolEntry(raw: Record<string, unknown>, seenAt: number, name = ''): DiscoveredPixera | null {
  const ip = asIp(raw.ip)
  const port = asPort(raw.port)
  const protocol = typeof raw.protocol === 'string' ? raw.protocol.trim() : ''
  if (!ip || port == null || !protocol) return null
  const mode = protocolToMode(protocol)
  if (!mode) return null
  return {
    id: `${ip}:${port}:${mode}`,
    ip,
    port,
    protocol,
    mode,
    name: name || ip,
    seenAt
  }
}

function collect(
  node: unknown,
  seenAt: number,
  into: DiscoveredPixera[],
  names: Map<string, string>
): void {
  if (Array.isArray(node)) {
    for (const item of node) collect(item, seenAt, into, names)
    return
  }
  if (!node || typeof node !== 'object') return
  const raw = node as Record<string, unknown>
  const type = typeof raw.type === 'string' ? raw.type : ''

  if (type === 'liveSystemHeartbeats' && Array.isArray(raw.heartbeats)) {
    for (const beat of raw.heartbeats) {
      if (!beat || typeof beat !== 'object') continue
      const hb = beat as Record<string, unknown>
      const ip = asIp(hb.ip)
      const name = asIp(hb.name)
      if (ip && name) names.set(ip, name)
      collect(hb, seenAt, into, names)
    }
  }

  if (type === 'protocol' || raw.protocol) {
    const found = protocolEntry(raw, seenAt, names.get(asIp(raw.ip)) || '')
    if (found) into.push(found)
  }

  if (Array.isArray(raw.protocols)) collect(raw.protocols, seenAt, into, names)
}

export function parseHeartbeat(raw: string | Buffer, seenAt = Date.now()): DiscoveredPixera[] {
  const text = typeof raw === 'string' ? raw.trim() : raw.toString('utf8').trim()
  if (!text) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return []
  }
  const found: DiscoveredPixera[] = []
  const names = new Map<string, string>()
  collect(parsed, seenAt, found, names)
  const byId = new Map<string, DiscoveredPixera>()
  for (const item of found) {
    const named = names.get(item.ip)
    const next = named && (item.name === item.ip || !item.name) ? { ...item, name: named } : item
    const prev = byId.get(next.id)
    if (!prev || (next.name && next.name !== next.ip && prev.name === prev.ip)) byId.set(next.id, next)
  }
  return [...byId.values()]
}

export function mergeDiscoveries(
  current: DiscoveredPixera[],
  incoming: DiscoveredPixera[],
  now = Date.now(),
  ttlMs = 8000
): DiscoveredPixera[] {
  const byId = new Map<string, DiscoveredPixera>()
  for (const item of current) {
    if (now - item.seenAt <= ttlMs) byId.set(item.id, item)
  }
  for (const item of incoming) byId.set(item.id, item)
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name) || a.ip.localeCompare(b.ip) || a.port - b.port)
}
