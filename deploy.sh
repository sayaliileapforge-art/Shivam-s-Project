#!/bin/bash
# Quick deploy script for Hostinger VPS
# Run: bash /var/www/saasapp/deploy.sh

set -e
cd /var/www/saasapp

echo "[1/6] Pulling latest code..."
git pull origin main

echo "[2/6] Installing backend dependencies..."
cd backend && npm ci --omit=dev

echo "[3/6] Building backend..."
npm run build

echo "[4/6] Installing & building frontend..."
cd .. && npm ci && npm run build

echo "[5/6] Ensuring upload directories..."
mkdir -p /var/www/saasapp/backend/public/uploads/templates
mkdir -p /var/www/saasapp/backend/public/uploads/assets

# Align UPLOADS_DIR in .env to the git-checkout path
if grep -q '^UPLOADS_DIR=' /var/www/saasapp/backend/.env 2>/dev/null; then
  sed -i 's|^UPLOADS_DIR=.*|UPLOADS_DIR=/var/www/saasapp/backend/public/uploads|' /var/www/saasapp/backend/.env
else
  echo 'UPLOADS_DIR=/var/www/saasapp/backend/public/uploads' >> /var/www/saasapp/backend/.env
fi

echo "[6/6] Restarting backend..."
pm2 restart saasapp --update-env 2>/dev/null || pm2 start /var/www/saasapp/backend/dist/server.js --name saasapp

pm2 save
echo "=== Deploy done ==="
pm2 status