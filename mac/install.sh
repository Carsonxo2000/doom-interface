#!/bin/bash
# Installs (or updates) the doom-interface mod in Claude Code and puts a
# "Doom Interface" app on your Desktop that opens the live HUD in a window of
# its own. Built on this Mac, so macOS opens it without a Gatekeeper warning.
set -euo pipefail

REPO="carsonxo2000/doom-interface"
RAW="https://raw.githubusercontent.com/$REPO/main"
APP="$HOME/Desktop/Doom Interface.app"
VIEWER_DIR="$HOME/.claude/doom-interface"

echo "▌D.O.O.M. // installing"

if command -v claude >/dev/null 2>&1; then
  if claude plugin list 2>/dev/null | grep doom-interface >/dev/null; then
    echo "  Plugin installed; updating it."
    claude plugin marketplace update doom-interface >/dev/null 2>&1 || true
    claude plugin update doom-interface@doom-interface 2>/dev/null ||
      claude plugin update doom-interface 2>/dev/null ||
      echo "  Could not update the plugin; run: claude plugin update doom-interface@doom-interface"
  else
    claude plugin install doom-interface --marketplace "$REPO" ||
      echo "  The plugin install did not finish. Add it in the Claude app instead: + next to the prompt box → Plugins → Add marketplace → $REPO → Add plugin."
  fi
else
  echo "  Claude Code's command line is not installed here, so add the plugin in the Claude app:"
  echo "  + next to the prompt box → Plugins → Add marketplace → $REPO → Add plugin"
fi

# The HUD page. The plugin rewrites it at each session start; this copy lets
# the launcher open before the first session.
mkdir -p "$VIEWER_DIR"
curl -fsSL "$RAW/viewer/index.html" -o "$VIEWER_DIR/index.html" ||
  echo "  Could not download the HUD page; it appears after your next Claude Code session starts."

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Opens the HUD as a chromeless app window in Chrome, Edge or Brave when one
# is installed, and in Safari otherwise.
cat > "$tmp/launch.applescript" <<'OSA'
set page to (POSIX path of (path to home folder)) & ".claude/doom-interface/index.html"
set pageURL to "file://" & page
set flags to " --args --app=" & quoted form of pageURL & " --window-size=1000,1100"
repeat with browser in {"Google Chrome", "Microsoft Edge", "Brave Browser"}
	try
		do shell script "open -na " & quoted form of (browser as text) & flags
		return
	end try
end repeat
do shell script "open -a Safari " & quoted form of page
OSA

rm -rf "$APP"
osacompile -o "$APP" "$tmp/launch.applescript"

# The icon ships prebuilt: sips cannot write .icns on recent macOS. A recent
# osacompile also names an icon in Assets.car, which Finder prefers over
# applet.icns, so that file and the plist key naming it go.
if curl -fsSL "$RAW/mac/applet.icns" -o "$tmp/applet.icns"; then
  cp "$tmp/applet.icns" "$APP/Contents/Resources/applet.icns"
  rm -f "$APP/Contents/Resources/Assets.car"
  /usr/libexec/PlistBuddy -c "Delete :CFBundleIconName" "$APP/Contents/Info.plist" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Set :CFBundleIconFile applet" "$APP/Contents/Info.plist" 2>/dev/null ||
    /usr/libexec/PlistBuddy -c "Add :CFBundleIconFile string applet" "$APP/Contents/Info.plist" 2>/dev/null || true
  touch "$APP"
  /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP" 2>/dev/null || true
else
  echo "  Could not download the icon; the launcher keeps the default one."
fi

echo "▌Done. \"Doom Interface\" is on your Desktop."
echo "  Open it any time: it shows whichever Claude Code session on this Mac is working."
echo "  Sessions already running pick up the update when they restart."
