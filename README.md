# D.O.O.M. — Digital Operations & Orchestration Matrix

A Claude Code mod that adds a live, JARVIS-style holographic HUD in Doom green beside the chat. While Claude Code works, it shows every tool call as it happens: an arc-reactor core that pulses while Claude thinks, six system gauges (SCRY for reads and searches, FORGE for edits, COMMAND for shell, REACH for web, LEGION for subagents, CONDUIT for connected tools) with callouts naming what each last touched, a voice-print waveform of the last minute's activity, error and file tallies, and a running log of each call with its target and duration.

![D.O.O.M. interface](docs/preview.png)

The pane opens by itself when a session starts; `/radar` opens it again. In a terminal it draws a text version with spinners and bar gauges.

## Install

At the prompt of a terminal session:

`/plugin install doom-interface --marketplace carsonxo2000/doom-interface`

From a shell:

`claude plugin install doom-interface --marketplace carsonxo2000/doom-interface`

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `carsonxo2000/doom-interface`, then Add plugin.

## Mac desktop launcher

Paste this into Terminal. It installs the plugin (when Claude Code's command line is installed) and puts a **Doom Interface** app with its own icon on your Desktop that opens the Claude desktop app:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/carsonxo2000/doom-interface/main/mac/install.sh)"
```

The launcher is built on your Mac by `osacompile`, so macOS opens it without a security warning.

## License

MIT
