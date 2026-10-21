#!/bin/bash
# Installs the doom-interface mod into Claude Code and puts a "Doom Interface"
# launcher, with its own icon, on your Desktop. Built on this Mac, so macOS
# opens it without a Gatekeeper warning.
set -euo pipefail

REPO="carsonxo2000/doom-interface"
APP="$HOME/Desktop/Doom Interface.app"
ICON_URL="https://raw.githubusercontent.com/$REPO/main/mac/icon.png"

echo "▌D.O.O.M. // installing"

if command -v claude >/dev/null 2>&1; then
  claude plugin install doom-interface --marketplace "$REPO" ||
    echo "  The plugin install did not finish. Add it in the Claude app instead: + next to the prompt box → Plugins → Add marketplace → $REPO → Add plugin."
else
  echo "  Claude Code's command line is not installed here, so add the plugin in the Claude app:"
  echo "  + next to the prompt box → Plugins → Add marketplace → $REPO → Add plugin"
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

cat > "$tmp/launch.applescript" <<'OSA'
try
	do shell script "open -a Claude"
on error
	set reply to display dialog "The Claude desktop app is not installed." buttons {"Cancel", "Get Claude"} default button "Get Claude" with title "D.O.O.M."
	if button returned of reply is "Get Claude" then open location "https://claude.ai/download"
end try
OSA

rm -rf "$APP"
osacompile -o "$APP" "$tmp/launch.applescript"

if curl -fsSL "$ICON_URL" -o "$tmp/icon.png"; then
  sips -s format icns "$tmp/icon.png" --out "$APP/Contents/Resources/applet.icns" >/dev/null
  touch "$APP"
fi

echo "▌Done. \"Doom Interface\" is on your Desktop."
echo "  Open it, go to the Code tab and start a session: the D.O.O.M. pane opens beside the chat (or type /radar)."
