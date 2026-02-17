#!/bin/bash
set -euo pipefail

SOURCE="$(cd "$(dirname "$0")" && pwd)"
TARGET="$HOME/apps/raycast-extensions/extensions/claude-code-explorer"
BRANCH="ext/claude-code-explorer"

if [ ! -d "$TARGET" ]; then
  echo "Target not found: $TARGET"
  echo "Make sure raycast/extensions fork is cloned at ~/apps/raycast-extensions"
  exit 1
fi

cd "$(dirname "$TARGET")/.."
git checkout "$BRANCH"
git pull origin "$BRANCH" --ff-only 2>/dev/null || true

# Sync files (exclude git, node_modules, dist, raycast-env.d.ts)
rsync -av --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='raycast-env.d.ts' \
  --exclude='.gitignore' \
  --exclude='sync-to-store.sh' \
  "$SOURCE/" "$TARGET/"

cd "$(dirname "$TARGET")/.."
echo ""
echo "Synced. Changes in raycast-extensions:"
git status --short "extensions/claude-code-explorer"
echo ""
echo "Next steps:"
echo "  cd ~/apps/raycast-extensions"
echo "  git add extensions/claude-code-explorer"
echo "  git commit -m 'fix: add error handling for missing plans directory'"
echo "  git push"
