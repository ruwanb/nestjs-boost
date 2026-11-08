#!/bin/bash
# Grade every finished run (has timing.json) that has no grading.json yet.
# Usage: grade_pending.sh <iteration-dir> <config: without_skill|with_skill>
ITER="${1:?iteration dir}"; CFG="${2:?config}"
HARNESS="$(cd "$(dirname "$0")" && pwd)"
for d in "$ITER"/*/"$CFG"; do
  id=$(basename "$(dirname "$d")")
  [ -f "$d/timing.json" ] && [ ! -f "$d/grading.json" ] || continue
  timeout 600 node "$HARNESS/grade.mjs" "$id" "$d/work" "$d/grading.json" || echo "GRADE-ERROR $id"
done
