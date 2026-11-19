#!/usr/bin/env sh
# Installs a skill of this repository for local agents (Linux, macOS, WSL).
# It links <repo>/<skill>/<skill> into the user-level skill folders. It copies nothing and deletes no folder.
#
# Usage: ./install.sh <skill> [--uninstall] [--force]
#   --uninstall  Remove the links that point to this repository.
#   --force      Replace an existing link that points to a different location.
set -eu

usage() { echo "Usage: $0 <skill> [--uninstall] [--force]" >&2; exit 2; }

[ $# -ge 1 ] || usage
SKILL=$1; shift
UNINSTALL=0; FORCE=0
for arg in "$@"; do
  case $arg in
    --uninstall) UNINSTALL=1 ;;
    --force) FORCE=1 ;;
    *) usage ;;
  esac
done

case $SKILL in
  *[!a-z0-9-]*|'') echo "Invalid skill name: $SKILL" >&2; exit 2 ;;
esac

REPO_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
SRC="$REPO_DIR/$SKILL/$SKILL"
TARGETS="$HOME/.agents/skills $HOME/.claude/skills"

if [ ! -f "$SRC/SKILL.md" ]; then
  echo "Skill not found: $SRC/SKILL.md" >&2
  exit 1
fi

if [ $UNINSTALL -eq 1 ]; then
  for parent in $TARGETS; do
    link="$parent/$SKILL"
    if [ -L "$link" ] && [ "$(readlink "$link")" = "$SRC" ]; then
      rm "$link"
      echo "Removed: $link"
    else
      echo "Skipped (not a link to this repository): $link"
    fi
  done
  exit 0
fi

# Release check: a release is installed from a tag, with no local changes.
if command -v git >/dev/null 2>&1 && git -C "$REPO_DIR" rev-parse --git-dir >/dev/null 2>&1; then
  if tag=$(git -C "$REPO_DIR" describe --exact-match --tags 2>/dev/null); then
    echo "Release tag: $tag"
  else
    echo "WARNING: the repository is not at a release tag. This is a development version."
  fi
  if [ -n "$(git -C "$REPO_DIR" status --porcelain -- "$SKILL/$SKILL")" ]; then
    echo "WARNING: the skill folder has uncommitted changes."
  fi
fi

# Integrity check: only when the release manifest exists.
MANIFEST="$REPO_DIR/$SKILL/SHA256SUMS"
if [ -f "$MANIFEST" ]; then
  if command -v sha256sum >/dev/null 2>&1; then
    (cd "$REPO_DIR/$SKILL" && sha256sum -c --quiet SHA256SUMS) || { echo "Integrity check FAILED. Nothing installed." >&2; exit 1; }
  else
    (cd "$REPO_DIR/$SKILL" && shasum -a 256 -c --quiet SHA256SUMS) || { echo "Integrity check FAILED. Nothing installed." >&2; exit 1; }
  fi
  echo "Integrity check: PASS (authorship is verified separately, see README)"
else
  echo "No SHA256SUMS manifest: integrity check skipped (development version)."
fi

for parent in $TARGETS; do
  link="$parent/$SKILL"
  mkdir -p "$parent"
  if [ -L "$link" ]; then
    current=$(readlink "$link")
    if [ "$current" = "$SRC" ]; then
      echo "Already installed: $link"
      continue
    fi
    if [ $FORCE -eq 1 ]; then
      rm "$link"
    else
      echo "ERROR: $link points to $current. Use --force to replace the link." >&2
      exit 1
    fi
  elif [ -e "$link" ]; then
    echo "ERROR: $link exists and is not a link. Move or remove it yourself, then run again." >&2
    exit 1
  fi
  ln -s "$SRC" "$link"
  echo "Linked: $link -> $SRC"
done

echo "Done. Restart your agent sessions to load the skill."
