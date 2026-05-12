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
mkdir -p /var/www/uploads/templates /var/www/uploads/assets /var/www/saasapp/backend/public/uploads/templates

# Copy preview PNGs from repo to the uploads directory nginx currently serves
cp -n /var/www/saasapp/backend/public/uploads/templates/*.png /var/www/uploads/templates/ 2>/dev/null || true

echo "[6/6] Restarting backend..."
pm2 restart saasapp --update-env 2>/dev/null || pm2 start /var/www/saasapp/backend/dist/server.js --name saasapp

pm2 save
echo "=== Deploy done ==="
pm2 status