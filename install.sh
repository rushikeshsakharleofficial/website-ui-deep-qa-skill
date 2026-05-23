#!/usr/bin/env bash
# install.sh — installs code-real-builder as a Claude Code plugin
#
# Plugin structure (enables namespaced skill invocation):
#   /code-real-builder:code-real-builder    — router skill
#   /code-real-builder:website-ui-deep-qa   — UI testing subskill (46 helpers)
#
# Installs to: ~/.claude/plugins/cache/code-real-builder/code-real-builder/1.0.0/
# Registers in: ~/.claude/plugins/installed_plugins.json
# Registers in: ~/.claude/plugins/known_marketplaces.json
#
# To add a new subskill:
#   1. Create skills/<subskill-name>/SKILL.md in this repo
#   2. Run install.sh — it syncs all skills/ dirs to plugin cache
#   3. Add row to skills/code-real-builder/SKILL.md routing table
set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_CACHE="$HOME/.claude/plugins/cache/code-real-builder/code-real-builder/1.0.0"
PLUGINS_JSON="$HOME/.claude/plugins/installed_plugins.json"
MARKETS_JSON="$HOME/.claude/plugins/known_marketplaces.json"
NOW="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"

# ── 1. Plugin cache: skills ───────────────────────────────────────────────────
echo "→ Syncing plugin skills to cache..."
mkdir -p "$PLUGIN_CACHE/skills"

# code-real-builder router skill
mkdir -p "$PLUGIN_CACHE/skills/code-real-builder"
cp "$REPO_DIR/skills/code-real-builder/SKILL.md" \
   "$PLUGIN_CACHE/skills/code-real-builder/SKILL.md"

# website-ui-deep-qa subskill (SKILL.md only — test code lives in project)
mkdir -p "$PLUGIN_CACHE/skills/website-ui-deep-qa"
cp "$REPO_DIR/SKILL.md" \
   "$PLUGIN_CACHE/skills/website-ui-deep-qa/SKILL.md"

# Plugin CLAUDE.md
cat > "$PLUGIN_CACHE/CLAUDE.md" << 'CLAUDE_EOF'
# Code Real Builder

Testing skills ecosystem.

- Multi-domain testing (UI + backend + security): use `code-real-builder:code-real-builder`
- UI / web app testing only: use `code-real-builder:website-ui-deep-qa`
CLAUDE_EOF

# ── 2. Register in installed_plugins.json ────────────────────────────────────
echo "→ Registering plugin..."
python3 - << PYEOF
import json, sys

plugins_file = "$PLUGINS_JSON"
markets_file = "$MARKETS_JSON"
now = "$NOW"
install_path = "$PLUGIN_CACHE"

# installed_plugins.json
with open(plugins_file) as f:
    plugins = json.load(f)

key = "code-real-builder@code-real-builder"
plugins["plugins"][key] = [{
    "scope": "user",
    "installPath": install_path,
    "version": "1.0.0",
    "installedAt": plugins.get("plugins", {}).get(key, [{}])[0].get("installedAt", now),
    "lastUpdated": now
}]
with open(plugins_file, "w") as f:
    json.dump(plugins, f, indent=4)

# known_marketplaces.json
with open(markets_file) as f:
    markets = json.load(f)

markets["code-real-builder"] = {
    "source": {
        "source": "github",
        "repo": "rushikeshsakharleofficial/code-real-builder"
    },
    "installLocation": "$HOME/.claude/plugins/marketplaces/code-real-builder",
    "lastUpdated": now
}
with open(markets_file, "w") as f:
    json.dump(markets, f, indent=4)

print("registered")
PYEOF

echo ""
echo "✓ Done. Plugin installed as: code-real-builder@code-real-builder"
echo ""
echo "   Invoke via:"
echo "   /code-real-builder:code-real-builder      — routing skill"
echo "   /code-real-builder:website-ui-deep-qa     — UI QA subskill (46 helpers)"
echo ""
echo "   Restart Claude Code to load the new plugin."
