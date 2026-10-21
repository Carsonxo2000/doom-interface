import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Blip, Meta, Status } from '../types'

import {
  GREEN,
  GLOW,
  CLOAK,
  STEEL,
  IRON,
  DIM,
  MOLTEN,
  CATS,
  catOf,
  SPIN,
  shortTool,
  str,
  targetOf,
  clip,
  pad,
  dur,
  clock,
  mmss,
  glyph,
  spark,
  statusLine,
  hudSvg,
} from './hud'

const PANE = 'doom-interface'
const TITLE = 'D.O.O.M.'

const EMPTY: Meta = { calls: 0, errors: 0, turns: 0, byCat: {}, files: [], isThinking: false }
const feed = atom({ plugin: 'doom-interface', key: 'feed' } as const, [] as Blip[])
const meta = atom({ plugin: 'doom-interface', key: 'meta' } as const, EMPTY)
const tick = atom({ plugin: 'doom-interface', key: 'tick' } as const, 0)

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
