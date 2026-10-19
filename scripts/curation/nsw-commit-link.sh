#!/bin/sh
# Commits staged NSW curation work, pushes the branch (external photos need a pushed commit), then links external photos to that commit.
# usage: sh scripts/curation/nsw-commit-link.sh "<message>"
set -e
git add -A scripts curation src/data assets
git commit -q -m "$1" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" || true
git push -q origin HEAD 2>&1 | tail -1
python3 scripts/curation/apply-photos.py link
git add -A src/data
git commit -q -m "chore(nsw): link external photos" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" || true
