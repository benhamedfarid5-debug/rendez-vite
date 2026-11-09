#!/usr/bin/env bash
# Construit le paquet à envoyer sur le serveur : deploy/rendez-vite.tar.gz
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
tar --exclude='server/tests' --exclude='server/data/*.db*' -czf deploy/rendez-vite.tar.gz \
  package.json package-lock.json server shared dist
ls -lh deploy/rendez-vite.tar.gz
