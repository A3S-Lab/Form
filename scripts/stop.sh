#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pid_file="$project_root/.a3s-form/playground.pid"
if [[ ! -f "$pid_file" ]]; then
  echo '未发现 A3S Form 本地服务 PID。'
  exit 0
fi

server_pid="$(<"$pid_file")"
if [[ "$server_pid" =~ ^[0-9]+$ ]] && kill -0 "$server_pid" 2>/dev/null; then
  command_line="$(ps -p "$server_pid" -o command= 2>/dev/null || true)"
  if [[ "$command_line" == *'scripts/serve-playground.mjs'* ]]; then
    kill "$server_pid"
    echo "已停止 A3S Form 本地服务（PID $server_pid）。"
  else
    echo 'PID 不属于 A3S Form，未终止任何进程。'
  fi
else
  echo 'PID 已失效，未终止任何进程。'
fi
rm -f -- "$pid_file"
