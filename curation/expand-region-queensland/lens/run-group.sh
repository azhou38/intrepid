#!/bin/bash
# usage: run-group.sh <group-dir>
cd /Users/alexzhou/Developer/mobile/.claude/worktrees/dazzling-hypatia-6e268e
g="$1"
python3 scripts/curation/photo-prove.py "$g" > "$g/prove.log" 2>&1
python3 scripts/curation/gather-photo-candidates.py "$g" > "$g/gather.log" 2>&1
echo done > "$g/gather.done"
