#!/usr/bin/env bash
# tools/get-course-updates.sh: brings newer course files from the Courier template into YOUR repo.
#
# How to use it: README.md, "Getting course updates". In short, you download the template as a ZIP,
# unzip it into /tmp, and run the copy of this script that's INSIDE the download, from your repo:
#
#   cd /workspaces/courier
#   bash /tmp/courier-update/*/tools/get-course-updates.sh
#
# The rule it follows, file by file:
#   - a file you haven't changed since you made your copy gets the template's new version;
#   - a file you HAVE changed (your planner, your firmware, ...) is kept exactly as it is;
#   - a file that's new in the template is added;
#   - files in .github/workflows/ are never written: your Codespace isn't allowed to push them.
#     The script lists the ones to update on github.com instead.
# It works on a new branch, makes one commit and pushes nothing, so you can look before you push.
# Your Git history keeps every earlier version, so nothing is lost either way.
set -euo pipefail

fail() { printf '✗ %s\n' "$1" >&2; exit 1; }

TEMPLATE=$(cd "$(dirname "$0")/.." && pwd -P)
REPO=$(git rev-parse --show-toplevel 2>/dev/null) ||
  fail "This isn't a Git repo. In the terminal, run: cd /workspaces/courier   (then run this again)"
REPO=$(cd "$REPO" && pwd -P)

[ "$TEMPLATE" != "$REPO" ] ||
  fail "This is your repo's own copy of the script. Run the one inside the template you downloaded: bash /tmp/courier-update/*/tools/get-course-updates.sh"
case "$TEMPLATE/" in
  "$REPO"/*) fail "The template was unzipped inside your repo. Delete that folder, and unzip into /tmp instead (README, step 3)." ;;
esac
[ -f "$TEMPLATE/.github/workflows/checks.yml" ] && [ -d "$TEMPLATE/stops" ] ||
  fail "$TEMPLATE doesn't look like the Courier template. Did the ZIP unzip completely?"

cd "$REPO"
[ "$(git rev-parse --is-shallow-repository)" = false ] ||
  fail "This repo has only part of its history. Run: git fetch --unshallow   (then run this again)"
[ -z "$(git status --porcelain --untracked-files=no)" ] ||
  fail "You have changes that aren't committed yet (see git status). Commit them on your branch first, or undo them, then run this again."
BRANCH=$(git branch --show-current)
[ "$BRANCH" = main ] ||
  fail "You're on the branch '$BRANCH'. Start from main: git switch main   then: git pull   (then run this again)"

# The commit GitHub made when you clicked "Use this template": your copy's first commit.
ROOT=$(git rev-list --max-parents=0 HEAD | tail -n 1)

# Have YOU changed this file since your copy was made? Commits made by this script don't count:
# they carry a "Course-Update:" line, and keep the script's title when a PR is squash-merged.
changed_by_you() {
  [ -n "$(git log --format=%H --invert-grep --grep='^Course-Update:' \
    --grep='^Get course updates from the Courier template' "$ROOT..HEAD" -- "$1")" ]
}
# Was this file in your copy when it was made? (If so and it's gone now, you deleted it.)
in_first_commit() { git cat-file -e "$ROOT:$1" 2>/dev/null; }

updated=() added=() kept=() workflows=()
while IFS= read -r -d '' path; do
  path=${path#./}
  src="$TEMPLATE/$path"
  if [ -f "$path" ] && cmp -s "$src" "$path"; then continue; fi  # already the same
  case "$path" in
    .github/workflows/*)
      if [ -f "$path" ] && changed_by_you "$path"; then kept+=("$path"); else workflows+=("$path"); fi
      continue ;;
  esac
  if [ ! -e "$path" ]; then
    in_first_commit "$path" && continue  # you deleted it on purpose: leave it deleted
    mkdir -p "$(dirname "$path")"
    cp "$src" "$path"
    added+=("$path")
  elif changed_by_you "$path"; then
    kept+=("$path")
  else
    cat "$src" > "$path"  # rewrite the contents; keeps the file's permissions
    updated+=("$path")
  fi
done < <(cd "$TEMPLATE" && find . -type f -print0 | LC_ALL=C sort -z)

say_list() { local title=$1; shift; [ $# -gt 0 ] || return 0; printf '\n%s\n' "$title"; printf '  %s\n' "$@"; }
say_kept() {
  [ ${#kept[@]} -gt 0 ] || return 0
  say_list "Kept as you have them (you changed these, and the template's version is different):" "${kept[@]}"
  echo "  To compare one with the template's version: code --diff <file> \"$TEMPLATE/<file>\""
}

if [ ${#updated[@]} -eq 0 ] && [ ${#added[@]} -eq 0 ]; then
  echo "✓ Nothing to bring in: every file you haven't changed already matches the template."
  say_kept
  say_list "Workflow files to update on github.com (README, step 6):" ${workflows[@]+"${workflows[@]}"}
  exit 0
fi

NEW=course-update; n=2
while git show-ref --quiet --verify "refs/heads/$NEW"; do NEW=course-update-$n; n=$((n + 1)); done
git switch --quiet -c "$NEW"
git add -- ${updated[@]+"${updated[@]}"} ${added[@]+"${added[@]}"}
git commit --quiet -m "Get course updates from the Courier template" -m "Course-Update: $(basename "$TEMPLATE")"

echo "✓ On a new branch, $NEW, with one commit: ${#updated[@]} file(s) updated, ${#added[@]} added."
say_list "Updated (you hadn't changed these):" ${updated[@]+"${updated[@]}"}
say_list "Added (new in the template):" ${added[@]+"${added[@]}"}
say_kept
say_list "Workflow files to update on github.com, after you push (README, step 6):" ${workflows[@]+"${workflows[@]}"}
printf '\nNext: git push -u origin %s   then follow the README from step 6.\n' "$NEW"
