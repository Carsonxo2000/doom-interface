export type Status = 'run' | 'ok' | 'err' | 'deny'

export type Blip = {
  id: string
  tool: string
  target: string
  isAgent: boolean
  status: Status
  t0: number
  t1?: number
}

export type Meta = {
  calls: number
  errors: number
  turns: number
  byCat: Record<string, number>
  files: { path: string; op: 'R' | 'W' }[]
  isThinking: boolean
  turnStart?: number
}

declare module 'claude-code' {
  interface PluginState {
    'doom-interface': { feed: Blip[]; meta: Meta; tick: number }
  }
}
