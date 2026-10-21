#!/bin/bash
# Installs the doom-interface mod into Claude Code and puts a "Doom Interface"
# launcher, with its own icon, on your Desktop. Built on this Mac, so macOS
# opens it without a Gatekeeper warning.
set -euo pipefail

REPO="carsonxo2000/doom-interface"
APP="$HOME/Desktop/Doom Interface.app"
ICON_URL="https://raw.githubusercontent.com/$REPO/main/mac/applet.icns"

echo "▌D.O.O.M. // installing"

if command -v claude >/dev/null 2>&1; then
  if claude plugin list 2>/dev/null | grep doom-interface >/dev/null; then
    echo "  Plugin already installed."
  else
    claude plugin install doom-interface --marketplace "$REPO" ||
      echo "  The plugin install did not finish. Add it in the Claude app instead: + next to the prompt box → Plugins → Add marketplace → $REPO → Add plugin."
  fi
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

# The icon ships prebuilt: sips cannot write .icns on recent macOS. A recent
# osacompile also names an icon in Assets.car, which Finder prefers over
# applet.icns, so that file and the plist key naming it go.
if curl -fsSL "$ICON_URL" -o "$tmp/applet.icns"; then
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
echo "  Open it, go to the Code tab and start a session: the D.O.O.M. pane opens beside the chat (or type /radar)."
