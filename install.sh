#!/usr/bin/env bash
# install.sh — sync skills to ~/.claude/skills/code-real-builder/
# All domains live inside one skill directory, not separate installs.
set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$HOME/.claude/skills/code-real-builder"

echo "→ Installing code-real-builder skill..."
mkdir -p "$SKILL_DIR"

# 1. Parent routing SKILL.md
cp "$REPO_DIR/skills/code-real-builder/SKILL.md" "$SKILL_DIR/SKILL.md"

# 2. UI deep QA domain reference (the big one)
cp "$REPO_DIR/SKILL.md" "$SKILL_DIR/ui-deep-qa.md"

# 3. Future domain files — copy if they exist in skills/code-real-builder/
for domain in backend security test-quality backtest ux frontend infra; do
  src="$REPO_DIR/skills/code-real-builder/${domain}.md"
  if [ -f "$src" ]; then
    cp "$src" "$SKILL_DIR/${domain}.md"
    echo "   + ${domain}.md"
  fi
done

echo "✓ Done. Installed at: $SKILL_DIR"
echo "   SKILL.md          — routing parent"
echo "   ui-deep-qa.md     — UI/web testing (46 helpers)"
