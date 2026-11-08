#!/bin/bash
# Record a finished run's timing: t.sh <eval-id> <config> <total_tokens> <duration_ms>
echo "{\"total_tokens\": $3, \"duration_ms\": $4}" > /home/claude/runs/iteration-1/$1/$2/timing.json
