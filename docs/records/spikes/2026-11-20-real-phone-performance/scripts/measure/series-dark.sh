#!/usr/bin/env bash
# Dark series, traces and the profiling build (issue 2299). Runs after the light series.
set -uo pipefail
export PATH="$(zsh -ic 'echo $PATH' | tail -1)"
S="${PERF_SCRATCH:?folder with dist-prod and dist-profiling}"
P="$(cd "$(dirname "$0")" && pwd)"
W="${WEB_DIR:?app/packages/web of the measured checkout}"
cd $P
adb -s 66f9a6d5 shell cmd uimode night yes
sleep 3
echo "load $(sysctl -n vm.loadavg)"
timeout 1200 node run.mjs prod-dark-int interactions 7 > results/prod-dark-int.log 2>&1; echo "prod-dark-int $?"
timeout 1500 node run.mjs prod-dark-start starts 5 > results/prod-dark-start.log 2>&1; echo "prod-dark-start $?"
TRACE=1 timeout 1200 node run.mjs prod-dark-trace interactions 3 > results/prod-dark-trace.log 2>&1; echo "prod-dark-trace $?"
TRACE=1 timeout 1200 node run.mjs prod-dark-trace-start starts 2 > results/prod-dark-trace-start.log 2>&1; echo "prod-dark-trace-start $?"
# switch the preview server to the profiling build (same origin and port)
kill "$(cat $P/web.pid)" 2>/dev/null; pkill -f "vite preview --outDir $S/dist-prod"; sleep 2
cd $W && nohup npx vite preview --outDir $S/dist-profiling --port 56508 --strictPort > $P/web-prof.log 2>&1 &
echo $! > $P/web.pid
for i in $(seq 30); do curl -sf localhost:56508/ >/dev/null && break; sleep 1; done
cd $P
timeout 1200 node run.mjs prof-dark-int interactions 5 > results/prof-dark-int.log 2>&1; echo "prof-dark-int $?"
timeout 1200 node run.mjs prof-dark-start starts 3 > results/prof-dark-start.log 2>&1; echo "prof-dark-start $?"
echo "load $(sysctl -n vm.loadavg)"
