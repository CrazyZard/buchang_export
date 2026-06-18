#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_DIR="${DEPLOY_DIR:-$ROOT/../buchang_export_deploy}"
REMOTE="${REMOTE:-https://github.com/CrazyZard/buchang_export.git}"
BRANCH="${BRANCH:-main}"

echo "==> 构建生产包"
cd "$ROOT"
GITHUB_PAGES=true npm run build

echo "==> 同步到 $DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"
rm -rf "$DEPLOY_DIR"/*
cp -r "$ROOT/dist/"* "$DEPLOY_DIR/"
touch "$DEPLOY_DIR/.nojekyll"

cd "$DEPLOY_DIR"
if [ ! -d .git ]; then
  git init -b "$BRANCH"
  git remote add origin "$REMOTE"
fi

git add -A
if git diff --cached --quiet; then
  echo "无变更，跳过提交"
else
  git commit -m "deploy: $(date '+%Y-%m-%d %H:%M')"
fi

echo "==> 推送到 $REMOTE"
git push -u origin "$BRANCH"

echo "完成: https://crazyzard.github.io/buchang_export/"
