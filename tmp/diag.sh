#!/bin/bash
echo "=== PM2 STATUS ==="
pm2 status
echo ""
echo "=== PM2 LOGS (last 40 lines) ==="
pm2 logs saas-admin --lines 40 --nostream 2>&1
echo ""
echo "=== NGINX STATUS ==="
systemctl is-active nginx
echo ""
echo "=== CURL TEST ==="
curl -s -o /dev/null -w "HTTP %{http_code} size=%{size_download}b" http://127.0.0.1:5000/
echo ""
echo "=== DIST ASSETS CHECK ==="
ls /var/www/saasapp/dist/assets/ 2>/dev/null || echo "MISSING"
