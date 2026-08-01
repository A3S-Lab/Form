#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_root="$project_root/.a3s-form"
port=4176
start_server=1

while (($#)); do
  case "$1" in
    --port)
      [[ $# -ge 2 ]] || { echo '--port 需要端口号。' >&2; exit 2; }
      port="$2"
      shift 2
      ;;
    --no-start)
      start_server=0
      shift
      ;;
    *)
      echo "未知参数：$1" >&2
      exit 2
      ;;
  esac
done

[[ "$port" =~ ^[0-9]+$ ]] && ((port >= 1 && port <= 65535)) || {
  echo '端口必须是 1 到 65535 之间的整数。' >&2
  exit 2
}

if command -v bun >/dev/null 2>&1; then
  bun_bin="$(command -v bun)"
else
  command -v curl >/dev/null 2>&1 || {
    echo '安装 Bun 需要 curl。' >&2
    exit 1
  }
  task_bun_root="${XDG_CACHE_HOME:-$runtime_root/cache}/bun"
  export BUN_INSTALL="$task_bun_root"
  echo '未检测到 Bun，正在使用官方安装脚本安装…'
  curl -fsSL https://bun.sh/install | bash
  bun_bin="$task_bun_root/bin/bun"
fi

cd "$project_root"
echo '==> 安装锁定依赖'
"$bun_bin" install --frozen-lockfile
echo '==> 构建 A3S Form 包'
"$bun_bin" run build
echo '==> 构建中文体验站'
"$bun_bin" run playground:build

if ((start_server == 0)); then
  echo "构建完成：$project_root/playground-dist"
  exit 0
fi

health_url="http://127.0.0.1:$port/.well-known/a3s-health"
if curl -fsS --max-time 2 "$health_url" >/dev/null 2>&1; then
  echo "A3S Form 已在运行：http://127.0.0.1:$port"
  exit 0
fi

mkdir -p "$runtime_root"
nohup env A3S_FORM_HOST=127.0.0.1 A3S_FORM_PORT="$port" \
  "$bun_bin" scripts/serve-playground.mjs \
  >"$runtime_root/playground.out.log" \
  2>"$runtime_root/playground.err.log" &
server_pid=$!
printf '%s\n' "$server_pid" >"$runtime_root/playground.pid"

ready=0
for _ in {1..30}; do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    break
  fi
  if curl -fsS --max-time 2 "$health_url" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.2
done

if ((ready == 0)); then
  echo "体验站未能启动，请查看 $runtime_root/playground.err.log" >&2
  exit 1
fi

echo "部署完成：http://127.0.0.1:$port"
echo './scripts/stop.sh 可停止本地服务。'
