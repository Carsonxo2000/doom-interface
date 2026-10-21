import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Blip, Meta, Status } from '../types'

const PANE = 'doom-interface'
const TITLE = 'D.O.O.M.'

const EMPTY: Meta = { calls: 0, errors: 0, turns: 0, byCat: {}, files: [], isThinking: false }
const feed = atom({ plugin: 'doom-interface', key: 'feed' } as const, [] as Blip[])
const meta = atom({ plugin: 'doom-interface', key: 'meta' } as const, EMPTY)
const tick = atom({ plugin: 'doom-interface', key: 'tick' } as const, 0)

// Doom's palette: cloak green, phosphor glow, gunmetal and molten slag.
const GREEN = '#4ade80'
const GLOW = '#86efac'
const CLOAK = '#14532d'
const STEEL = '#9aa3ab'
const IRON = '#3a4148'
const DIM = '#5b6b60'
const MOLTEN = '#ff5a1f'

// Each tool feeds one of six systems, drawn as arc gauges round the core.
type Cat = { key: string; label: string; color: string; angle: number }
const CATS: Cat[] = [
  { key: 'read', label: 'SCRY', color: '#6ee7b7', angle: -50 },
  { key: 'write', label: 'FORGE', color: '#a3e635', angle: 0 },
  { key: 'exec', label: 'COMMAND', color: GREEN, angle: 50 },
  { key: 'web', label: 'REACH', color: '#2dd4bf', angle: 130 },
  { key: 'agent', label: 'LEGION', color: '#bbf7d0', angle: 180 },
  { key: 'mcp', label: 'CONDUIT', color: '#bef264', angle: 230 },
]
const CAT_OF: Record<string, string> = {
  Read: 'read', Grep: 'read', Glob: 'read', LS: 'read', ToolSearch: 'read',
  Edit: 'write', Write: 'write', NotebookEdit: 'write', MultiEdit: 'write',
  Bash: 'exec', Monitor: 'exec', TaskStop: 'exec',
  WebFetch: 'web', WebSearch: 'web',
  Agent: 'agent', Task: 'agent', Skill: 'agent', Workflow: 'agent', SendMessage: 'agent',
}
const catOf = (tool: string): Cat => {
  const key = CAT_OF[tool] ?? (tool.startsWith('mcp__') ? 'mcp' : 'agent')
  return CATS.find(c => c.key === key) ?? CATS[5]!
}

const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

const shortTool = (tool: string) =>
  tool.startsWith('mcp__') ? tool.split('__').slice(1).join(':') : tool

const str = (v: unknown) => (typeof v === 'string' ? v : '')

const targetOf = (tool: string, args: Record<string, unknown>): string => {
  const path = str(args.file_path) || str(args.notebook_path)
  if (path) return path.split('/').slice(-2).join('/')
  const pick =
    str(args.command) || str(args.pattern) || str(args.url) || str(args.query) ||
    str(args.description) || str(args.skill) || str(args.prompt)
  if (pick) return pick.replace(/\s+/g, ' ').trim()
  const first = Object.values(args).find(v => typeof v === 'string')
  return typeof first === 'string' ? first.replace(/\s+/g, ' ').trim() : ''
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const pad = (s: string, n: number) => clip(s, n).padEnd(n)
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const hash = (s: string) => {
  let x = 0
  for (const ch of s) x = (x * 31 + ch.charCodeAt(0)) | 0
  return Math.abs(x)
}
const dur = (b: Blip, now: number) => {
  const ms = (b.t1 ?? now) - b.t0
  return ms < 1000 ? `${ms}ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60_000)}m${Math.floor((ms % 60_000) / 1000)}s`
}
const clock = (t: number) => {
  const d = new Date(t)
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':')
}
const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
const glyph = (s: Status) => (s === 'run' ? '◌' : s === 'ok' ? '✓' : s === 'err' ? '✗' : '⊘')

// Calls started per 5s bucket over the last minute.
const spark = (list: Blip[], now: number) => {
  const buckets = new Array<number>(12).fill(0)
  for (const b of list) {
    const i = 11 - Math.floor((now - b.t0) / 5000)
    if (i >= 0 && i < 12) buckets[i]! += 1
  }
  return buckets
}

const statusLine = (m: Meta, running: Blip[]) =>
  running.length > 0
    ? `DOOM COMMANDS · ${shortTool(running[running.length - 1]!.tool).toUpperCase()}`
    : m.isThinking
      ? 'DOOM CONTEMPLATES'
      : 'DOOM AWAITS'

const f = (n: number) => n.toFixed(1)

function hudSvg(list: Blip[], m: Meta, now: number): string {
  const W = 440
  const H = 330
  const cx = 220
  const cy = 166
  const running = list.filter(b => b.status === 'run')
  const isBusy = running.length > 0 || m.isThinking
  const pt = (deg: number, r: number) => {
    const a = (deg * Math.PI) / 180
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as const
  }
  const arc = (r: number, a0: number, a1: number) => {
    const [x0, y0] = pt(a0, r)
    const [x1, y1] = pt(a1, r)
    return `M${f(x0)} ${f(y0)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${f(x1)} ${f(y1)}`
  }
  // Negative begin keeps an animation's phase steady across redraws.
  const phase = (ms: number) => `-${((now % ms) / 1000).toFixed(2)}s`
  const spin = (ms: number, ccw = false) =>
    `<animateTransform attributeName="transform" type="rotate" from="${ccw ? 360 : 0} ${cx} ${cy}" to="${ccw ? 0 : 360} ${cx} ${cy}" dur="${ms / 1000}s" begin="${phase(ms)}" repeatCount="indefinite"/>`
  const speed = (idle: number, busy: number) => (isBusy ? busy : idle)
  const out: string[] = []

  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" font-family="ui-monospace,SFMono-Regular,Menlo,monospace">`,
    `<defs>`,
    `<radialGradient id="bg" cx="50%" cy="50%" r="70%"><stop offset="0" stop-color="#052414"/><stop offset="0.6" stop-color="#020c06"/><stop offset="1" stop-color="#000302"/></radialGradient>`,
    `<radialGradient id="core" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#f0fff5"/><stop offset="0.35" stop-color="${GLOW}"/><stop offset="0.7" stop-color="${GREEN}" stop-opacity="0.45"/><stop offset="1" stop-color="${GREEN}" stop-opacity="0"/></radialGradient>`,
    `<pattern id="hex" width="17.32" height="30" patternUnits="userSpaceOnUse"><path d="M0 5L8.66 0L17.32 5V15L8.66 20L0 15ZM8.66 20V30" fill="none" stroke="${GREEN}" stroke-width="0.5" opacity="0.09"/></pattern>`,
    `<pattern id="sl" width="4" height="3" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="${GREEN}" opacity="0.035"/></pattern>`,
    `<linearGradient id="scan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${GREEN}" stop-opacity="0"/><stop offset="1" stop-color="${GREEN}" stop-opacity="0.12"/></linearGradient>`,
    `<filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="1.8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`,
    `<filter id="hot" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`,
    `</defs>`,
    `<rect width="${W}" height="${H}" fill="url(#bg)"/>`,
    `<rect width="${W}" height="${H}" fill="url(#hex)"/>`,
    // A holographic scan band that rolls down the glass.
    `<rect x="0" y="-40" width="${W}" height="40" fill="url(#scan)"><animate attributeName="y" from="-40" to="${H}" dur="7s" begin="${phase(7000)}" repeatCount="indefinite"/></rect>`,
  )

  // Corner brackets and the header rule.
  const k = 16
  out.push(
    `<g fill="none" stroke="${GREEN}" stroke-width="1.2" opacity="0.8">`,
    `<path d="M6 ${6 + k}V6H${6 + k}M${W - 6 - k} 6H${W - 6}V${6 + k}M${W - 6} ${H - 6 - k}V${H - 6}H${W - 6 - k}M${6 + k} ${H - 6}H6V${H - 6 - k}"/>`,
    `</g>`,
    `<path d="M14 48H150L158 54H${W - 158}L${W - 150} 48H${W - 14}" fill="none" stroke="${GREEN}" stroke-width="0.6" opacity="0.5"/>`,
  )
  for (let x = 166; x <= W - 166; x += 6) out.push(`<line x1="${x}" y1="54" x2="${x}" y2="${x % 30 === 4 ? 59 : 56.5}" stroke="${GREEN}" stroke-width="0.5" opacity="0.5"/>`)

  // Header: the system's name, its state and the clock.
  const status = statusLine(m, running)
  const elapsed = m.turnStart !== undefined && isBusy ? `T+${mmss(now - m.turnStart)}` : '--:--'
  out.push(
    `<text x="16" y="29" font-family="'Helvetica Neue',Arial,sans-serif" font-size="17" font-weight="300" letter-spacing="6" fill="${GLOW}" filter="url(#glow)">D.O.O.M.</text>`,
    `<text x="17" y="40" font-size="5" letter-spacing="1.4" fill="${DIM}">DIGITAL OPERATIONS &amp; ORCHESTRATION MATRIX</text>`,
    `<text x="${W - 16}" y="27" text-anchor="end" font-size="11" letter-spacing="2" fill="${GLOW}" filter="url(#glow)">${elapsed}</text>`,
    `<text x="${W - 16}" y="40" text-anchor="end" font-size="5.5" letter-spacing="1.4" fill="${isBusy ? GLOW : DIM}">SYS ▪ ${isBusy ? 'ENGAGED' : 'STANDBY'} ▪ DECREE ${String(m.turns).padStart(3, '0')}</text>`,
  )

  // Outer reticle: degree ticks and a dotted orbit with two hunting arcs.
  out.push(`<circle cx="${cx}" cy="${cy}" r="84" fill="none" stroke="${GREEN}" stroke-width="0.4" opacity="0.3"/>`)
  for (let d = 0; d < 360; d += 5) {
    const [x1, y1] = pt(d, 84)
    const [x2, y2] = pt(d, d % 45 === 0 ? 90 : 86.5)
    out.push(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${GREEN}" stroke-width="${d % 45 === 0 ? 0.9 : 0.4}" opacity="${d % 45 === 0 ? 0.8 : 0.35}"/>`)
  }
  out.push(
    `<circle cx="${cx}" cy="${cy}" r="74" fill="none" stroke="${GREEN}" stroke-width="0.8" stroke-dasharray="0.8 3.2" opacity="0.6"/>`,
    `<g fill="none" stroke="${GLOW}" stroke-width="1.4" filter="url(#glow)"><path d="${arc(74, 0, 34)}"/><path d="${arc(74, 180, 214)}"/>${spin(speed(18000, 5000))}</g>`,
  )
  if (isBusy) {
    out.push(
      `<g fill="none" stroke="${GREEN}" stroke-width="2" opacity="0.7"><path d="${arc(79, 0, 110)}" stroke-dasharray="1.5 2.5"/>${spin(3200, true)}</g>`,
    )
  }

  // The six systems: arc gauges, each filled by its share of the work.
  const peakCat = Math.max(1, ...CATS.map(c => m.byCat[c.key] ?? 0))
  const span = 44
  for (const c of CATS) {
    const n = m.byCat[c.key] ?? 0
    const live = running.some(b => catOf(b.tool).key === c.key)
    const a0 = c.angle - span / 2
    const a1 = c.angle + span / 2
    out.push(
      `<path d="${arc(60, a0, a1)}" fill="none" stroke="#0d3b1f" stroke-width="8"/>`,
      `<path d="${arc(53, a0, a1)}" fill="none" stroke="${c.color}" stroke-width="0.6" opacity="0.45"/>`,
    )
    if (n > 0) {
      out.push(`<path d="${arc(60, a0, a0 + Math.max(2, (span * n) / peakCat))}" fill="none" stroke="${c.color}" stroke-width="8" opacity="0.8"${live ? '' : ' filter="url(#glow)"'}/>`)
    }
    for (let s = 1; s < 8; s++) {
      const [x1, y1] = pt(a0 + (span * s) / 8, 56)
      const [x2, y2] = pt(a0 + (span * s) / 8, 64)
      out.push(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="#020c06" stroke-width="0.9"/>`)
    }
    if (live) {
      out.push(
        `<path d="${arc(60, a0, a1)}" fill="none" stroke="#e8fff0" stroke-width="8" stroke-dasharray="3 3" filter="url(#hot)" opacity="0.9">`,
        `<animate attributeName="stroke-dashoffset" from="12" to="0" dur="0.4s" repeatCount="indefinite"/></path>`,
      )
    }

    // A callout line out to the system's readout.
    const isRight = Math.cos((c.angle * Math.PI) / 180) > 0
    const [p1x, p1y] = pt(c.angle, 65)
    const [p2x, p2y] = pt(c.angle, 96)
    const xEnd = isRight ? cx + 128 : cx - 128
    const tx = isRight ? xEnd + 4 : xEnd - 4
    const anchor = isRight ? 'start' : 'end'
    const latest = [...list].reverse().find(b => catOf(b.tool).key === c.key)
    const sub = live ? '▶ EXECUTING' : latest ? clip(latest.target || shortTool(latest.tool), 22) : 'STANDBY'
    out.push(
      `<path d="M${f(p1x)} ${f(p1y)}L${f(p2x)} ${f(p2y)}H${xEnd}" fill="none" stroke="${c.color}" stroke-width="0.7" opacity="${n > 0 || live ? 0.85 : 0.35}"/>`,
      `<circle cx="${f(p1x)}" cy="${f(p1y)}" r="1.6" fill="${c.color}"/>`,
      `<rect x="${isRight ? xEnd : xEnd - 3}" y="${f(p2y - 1.5)}" width="3" height="3" fill="${c.color}"/>`,
      `<text x="${tx}" y="${f(p2y - 2)}" text-anchor="${anchor}" font-size="7.5" letter-spacing="1.6" font-weight="700" fill="${c.color}" opacity="${n > 0 || live ? 1 : 0.5}"${live ? ' filter="url(#glow)"' : ''}>${isRight ? `${c.label} <tspan fill="${GLOW}">${String(n).padStart(2, '0')}</tspan>` : `<tspan fill="${GLOW}">${String(n).padStart(2, '0')}</tspan> ${c.label}`}${live ? '<animate attributeName="opacity" values="1;0.4;1" dur="0.9s" repeatCount="indefinite"/>' : ''}</text>`,
      `<text x="${tx}" y="${f(p2y + 7)}" text-anchor="${anchor}" font-size="5" letter-spacing="0.6" fill="${live ? GLOW : DIM}">${esc(sub)}</text>`,
    )
  }

  // Failures flare where they happened.
  const recent = list.filter(b => b.status !== 'run').slice(-12)
  recent.forEach((b, i) => {
    const c = catOf(b.tool)
    const [x, y] = pt(c.angle + ((hash(b.id) % 40) - 20), 46)
    const op = (0.25 + (0.75 * (i + 1)) / recent.length).toFixed(2)
    out.push(b.status === 'ok'
      ? `<circle cx="${f(x)}" cy="${f(y)}" r="1.2" fill="${c.color}" opacity="${op}"/>`
      : `<path d="M${f(x - 2.5)} ${f(y - 2.5)}l5 5m0 -5l-5 5" stroke="${MOLTEN}" stroke-width="1" opacity="${op}" filter="url(#glow)"/>`)
  })

  // Inner rings: a counter-turning tick ring and three sweeping arcs.
  const ticks: string[] = []
  for (let d = 0; d < 360; d += 6) {
    const [x1, y1] = pt(d, 40)
    const [x2, y2] = pt(d, d % 30 === 0 ? 44.5 : 42.5)
    ticks.push(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`)
  }
  out.push(
    `<g stroke="${GREEN}" stroke-width="0.6" opacity="0.6">${ticks.join('')}${spin(speed(40000, 12000), true)}</g>`,
    `<circle cx="${cx}" cy="${cy}" r="33" fill="none" stroke="${GREEN}" stroke-width="0.5" opacity="0.4"/>`,
    `<g fill="none" stroke="${GREEN}" stroke-width="1.6" opacity="0.9"><path d="${arc(33, 0, 60)}"/><path d="${arc(33, 120, 180)}"/><path d="${arc(33, 240, 300)}"/>${spin(speed(9000, 2600))}</g>`,
  )

  // The reactor core: ten coils round a white-hot heart.
  const heat = running.length > 0 ? catOf(running[running.length - 1]!.tool).color : GREEN
  out.push(`<circle cx="${cx}" cy="${cy}" r="30" fill="url(#core)" opacity="${isBusy ? 0.55 : 0.25}">${isBusy ? `<animate attributeName="opacity" values="0.55;0.25;0.55" dur="1.4s" begin="${phase(1400)}" repeatCount="indefinite"/>` : ''}</circle>`)
  const coils: string[] = []
  for (let i = 0; i < 10; i++) coils.push(`<path d="${arc(21, i * 36 + 4, i * 36 + 32)}"/>`)
  out.push(
    `<g fill="none" stroke="${heat}" stroke-width="6" opacity="0.85" filter="url(#glow)">${coils.join('')}${isBusy ? spin(6000) : ''}</g>`,
    `<circle cx="${cx}" cy="${cy}" r="14" fill="#03140a" stroke="${GLOW}" stroke-width="1.2"/>`,
    `<circle cx="${cx}" cy="${cy}" r="10" fill="url(#core)" filter="url(#hot)">`,
    `<animate attributeName="r" values="${isBusy ? '10;8;10' : '9;9.6;9'}" dur="${isBusy ? 0.9 : 3}s" repeatCount="indefinite"/></circle>`,
  )
  if (isBusy) {
    out.push(
      `<circle cx="${cx}" cy="${cy}" r="24" fill="none" stroke="${GLOW}" stroke-width="1">`,
      `<animate attributeName="r" from="24" to="70" dur="1.8s" begin="${phase(1800)}" repeatCount="indefinite"/>`,
      `<animate attributeName="opacity" from="0.7" to="0" dur="1.8s" begin="${phase(1800)}" repeatCount="indefinite"/></circle>`,
    )
  }

  // Status line under the reticle.
  out.push(
    `<text x="${cx}" y="${cy + 104}" text-anchor="middle" font-size="7" letter-spacing="2" fill="${isBusy ? GLOW : DIM}"${isBusy ? ' filter="url(#glow)"' : ''}>[ ${esc(status)} ]${isBusy ? '<animate attributeName="opacity" values="1;0.45;1" dur="1.2s" repeatCount="indefinite"/>' : ''}</text>`,
  )
  const last = m.files[m.files.length - 1]
  if (last) {
    out.push(`<text x="${cx}" y="${cy + 114}" text-anchor="middle" font-size="5.5" letter-spacing="0.6" fill="${DIM}">${last.op === 'W' ? '⚒' : '◇'} ${esc(clip(last.path, 44))}</text>`)
  }

  // Voice print: the last minute's activity as a mirrored waveform.
  const bars = spark(list, now)
  const peak = Math.max(1, ...bars)
  const wx = 16
  const wy = H - 26
  out.push(
    `<path d="M${wx - 4} ${wy - 22}H${wx + 118}M${wx - 4} ${wy + 18}H${wx + 118}" stroke="${GREEN}" stroke-width="0.4" opacity="0.35"/>`,
    `<text x="${wx - 4}" y="${wy - 25}" font-size="5" letter-spacing="1.2" fill="${DIM}">VOICE PRINT // 60s</text>`,
  )
  for (let i = 0; i < 30; i++) {
    const v = bars[Math.min(11, Math.floor((i / 30) * 12))]!
    const h = 1 + (v / peak) * 13 * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.7)))
    const x = wx + i * 4
    const d = `${(0.5 + (i % 5) * 0.13).toFixed(2)}s`
    const anim = isBusy
      ? `<animate attributeName="y" values="${f(wy - h)};${f(wy - h * 0.3)};${f(wy - h)}" dur="${d}" repeatCount="indefinite"/><animate attributeName="height" values="${f(2 * h)};${f(0.6 * h)};${f(2 * h)}" dur="${d}" repeatCount="indefinite"/>`
      : ''
    // A rect, not a line: a glow filter drops a shape whose box has no width.
    out.push(`<rect x="${x - 1}" y="${f(wy - h)}" width="2" height="${f(2 * h)}" rx="1" fill="${GREEN}" opacity="${v > 0 ? 0.9 : 0.25}"${v > 0 ? ' filter="url(#glow)"' : ''}>${anim}</rect>`)
  }

  // Readout: running tallies, right-aligned like a diagnostics block.
  const rows: [string, number, string][] = [
    ['ORDERS', m.calls, GLOW],
    ['DEFIANCE', m.errors, m.errors > 0 ? MOLTEN : GLOW],
    ['SEIZED', m.files.length, GLOW],
    ['ACTIVE', running.length, running.length > 0 ? '#e8fff0' : GLOW],
  ]
  const rx = W - 16
  const ry = H - 52
  out.push(`<path d="M${rx - 112} ${ry - 8}H${rx}V${ry + 34}" fill="none" stroke="${GREEN}" stroke-width="0.5" opacity="0.4"/>`)
  rows.forEach(([label, v, col], i) => {
    out.push(
      `<text x="${rx - 110}" y="${ry + 2 + i * 9}" font-size="6" letter-spacing="1.2" fill="${DIM}">${label} <tspan opacity="0.5">${'.'.repeat(Math.max(2, 12 - label.length))}</tspan></text>`,
      `<text x="${rx - 4}" y="${ry + 2 + i * 9}" text-anchor="end" font-size="7" font-weight="700" fill="${col}">${String(v).padStart(3, '0')}</text>`,
    )
  })

  out.push(`<rect width="${W}" height="${H}" fill="url(#sl)" pointer-events="none"/>`, `</svg>`)
  return out.join('')
}

export const register: Register = on => {
  let busy = 0
  let isThinking = false
  let ticking: { cancel: () => void } | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'radar', description: 'Open the D.O.O.M. activity interface' })
    void $.ui.open({ id: PANE, title: TITLE })
    ticking?.cancel()
    ticking = $.clock.every(1000, () => {
      if (busy > 0 || isThinking) void update($, tick, n => n + 1)
    })

    return next(e)
  })

  on('command.run', { command: 'radar' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'Doom is watching.' }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      isThinking = true
      const now = await $.clock.now()
      await update($, meta, m => ({ ...m, isThinking: true, turnStart: now, turns: m.turns + 1 }))
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      isThinking = false
      await update($, meta, m => ({ ...m, isThinking: false }))
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const args = e as unknown as Record<string, unknown>
    const blip: Blip = {
      id: e.tool_use_id,
      tool: e.tool,
      target: targetOf(e.tool, args),
      isAgent: e.agentId !== undefined,
      status: 'run',
      t0: await $.clock.now(),
    }
    const cat = catOf(e.tool).key
    const path = str(args.file_path) || str(args.notebook_path)
    busy += 1
    await update($, feed, list => [...list, blip].slice(-80))
    await update($, meta, m => ({
      ...m,
      calls: m.calls + 1,
      byCat: { ...m.byCat, [cat]: (m.byCat[cat] ?? 0) + 1 },
      files: path
        ? [...m.files.filter(f => f.path !== path), { path, op: cat === 'write' ? 'W' : 'R' } as const].slice(-12)
        : m.files,
    }))

    let status: Status = 'err'
    try {
      const ran = await next(e)
      status = ran.deny !== undefined ? 'deny' : ran.isError === true ? 'err' : 'ok'
      return ran
    } finally {
      busy = Math.max(0, busy - 1)
      const t1 = await $.clock.now()
      await update($, feed, list => list.map(b => (b.id === blip.id ? { ...b, status, t1 } : b)))
      if (status !== 'ok') await update($, meta, m => ({ ...m, errors: m.errors + 1 }))
    }
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const list = await read($, feed)
    const m = await read($, meta)
    const now = await $.clock.now()
    const cols = e.props.bodyColumns
    const running = list.filter(b => b.status === 'run')

    const clear = () =>
      void Promise.all([update($, feed, () => []), update($, meta, () => ({ ...EMPTY, isThinking }))])

    if (e.surface === 'terminal') {
      const { Box, Text, Button } = $.ui.resolve(e)
      const n = await read($, tick)
      const spin = SPIN[n % SPIN.length]!
      const rows = Math.max(3, (e.viewport?.rows ?? 30) - 18)
      const bars = spark(list, now)
      const peak = Math.max(1, ...bars)
      const sparkText = bars.map(v => ' ▁▂▃▄▅▆▇█'[Math.round((v / peak) * 8)]).join('')
      const maxCat = Math.max(1, ...CATS.map(c => m.byCat[c.key] ?? 0))
      const barW = Math.max(4, Math.min(24, cols - 18))
      const isBusy = running.length > 0 || m.isThinking
      const rule = '▚'.repeat(Math.max(8, Math.min(cols, 60)))

      return (
        <Box flexDirection="column">
          <Text color={CLOAK}>{rule}</Text>
          <Box justifyContent="space-between">
            <Text color={GREEN} bold>⛨ D.O.O.M.</Text>
            <Text color={isBusy ? GLOW : DIM}>{isBusy ? `${spin} ` : '· '}{statusLine(m, running)}</Text>
          </Box>
          <Text color={STEEL}>
            ORDERS {m.calls}  DEFIANCE {m.errors}  SEIZED {m.files.length}  {m.turnStart !== undefined && isBusy ? `T+${mmss(now - m.turnStart)}` : `DECREES ${m.turns}`}
          </Text>
          <Text color={GREEN}>OUTPUT ▕{sparkText}▏</Text>
          <Text color={CLOAK}>{rule}</Text>
          <Box flexDirection="column">
            {CATS.map(c => {
              const v = m.byCat[c.key] ?? 0
              const fill = Math.round((v / maxCat) * barW)
              const live = running.some(b => catOf(b.tool).key === c.key)
              return (
                <Text>
                  <Text color={c.color}>{pad(c.label, 8)}</Text>
                  <Text color={c.color}>{'█'.repeat(fill)}</Text>
                  <Text color={IRON}>{'▒'.repeat(barW - fill)}</Text>
                  <Text color={c.color}> {String(v).padStart(3)}{live ? ` ${spin}` : ''}</Text>
                </Text>
              )
            })}
          </Box>
          <Box flexDirection="column" marginTop={1}>
            {list.length === 0 && <Text color={DIM}>Doom awaits his first command…</Text>}
            {list.slice(-rows).map(b => {
              const c = catOf(b.tool)
              const col = b.status === 'err' || b.status === 'deny' ? MOLTEN : c.color
              return (
                <Text dimColor={b.status === 'ok'}>
                  <Text color={col}>{b.status === 'run' ? spin : glyph(b.status)} </Text>
                  <Text color={c.color}>{pad(shortTool(b.tool), 10)}</Text>
                  <Text> {pad((b.isAgent ? '↳ ' : '') + b.target, Math.max(8, cols - 22))}</Text>
                  <Text color={DIM}> {dur(b, now).padStart(6)}</Text>
                </Text>
              )
            })}
          </Box>
          <Box marginTop={1}>
            <Button key="clear" onPress={clear}>purge</Button>
          </Box>
        </Box>
      )
    }

    const { Box, Text, Button, Svg } = $.ui.resolve(e)
    const t = { mono: true, size: 'footnote' } as const
    const width = Math.max(18, Math.floor(cols * 0.9))
    const panel = { flexDirection: 'column', backgroundColor: '#020a05', borderStyle: 'single', borderColor: CLOAK, padding: 'sm' } as const

    return (
      <Box flexDirection="column" gap="sm">
        <Svg
          source={hudSvg(list, m, now)}
          alt={`D.O.O.M. interface: ${statusLine(m, running).toLowerCase()}, ${m.calls} tool calls, ${m.errors} errors`}
          isInteractive
        />
        <Box {...panel}>
          <Box justifyContent="space-between">
            <Text {...t} color={GREEN} weight="bold">⛨ LEDGER OF DOOM</Text>
            <Button key="clear" variant="secondary" onPress={clear}>purge</Button>
          </Box>
          {list.length === 0 && <Text {...t} color={DIM}>Doom awaits his first command…</Text>}
          {list.slice(-14).reverse().map(b => {
            const c = catOf(b.tool)
            const col = b.status === 'err' || b.status === 'deny' ? MOLTEN : c.color
            return (
              <Text {...t} dimColor={b.status === 'ok'}>
                <Text {...t} color={DIM}>{clock(b.t0)} </Text>
                <Text {...t} color={col}>{glyph(b.status)} </Text>
                <Text {...t} color={c.color} weight="semibold">{pad(shortTool(b.tool), 9)}</Text>
                <Text {...t} color="#d1d9d4"> {clip((b.isAgent ? '↳ ' : '') + b.target, Math.max(10, width - 30))}</Text>
                <Text {...t} color={DIM}> {b.status === 'run' ? 'live' : dur(b, now)}</Text>
              </Text>
            )
          })}
        </Box>
        {m.files.length > 0 && (
          <Box {...panel}>
            <Text {...t} color={GREEN} weight="bold">⛨ SEIZED TERRITORY</Text>
            {m.files.slice(-8).reverse().map(f => (
              <Text {...t} color={f.op === 'W' ? '#a3e635' : '#6ee7b7'}>
                {f.op === 'W' ? '⚒' : '◇'} {clip(f.path, Math.max(10, width - 4))}
              </Text>
            ))}
          </Box>
        )}
      </Box>
    )
  })
}
