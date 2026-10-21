import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'doom-interface',
  component: 'Pane',
  requestId: 'doom-interface',
  props: {
    title: 'Claude Radar',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('the radar logs tool calls on every surface', async ($, on) => {
  let t = 1_700_000_000_000
  on('clock.now', () => ({ value: (t += 250) }))
  on('clock.every', () => ({ value: { cancel: () => {} } }))
  on('command.register', () => ({ value: { command: 'radar' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', (_, e) =>
    e.tool === 'Bash' ? { result: {}, isError: true, text: 'boom' } : { result: {} },
  )

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Read', file_path: '/repo/src/app.ts' })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/src/app.ts', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await $.tool.call({ tool: 'mcp__github__get_me' })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const row = await ui.find({ type: 'Text', text: /npm test/ })
    expect(row?.text ?? '').toContain('npm test')
    const file = await ui.find({ type: 'Text', text: /src\/app\.ts/ })
    expect(file?.text ?? '').toContain('src/app.ts')
    if (surface !== 'terminal') expect(await ui.find({ type: 'Svg' })).toBeDefined()
    await ui.unmount()
  }
})
