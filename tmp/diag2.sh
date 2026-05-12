#!/bin/bash
echo "=== PM2 STATUS ==="
pm2 status
echo ""
echo "=== SAAS-ADMIN LOGS ==="
pm2 logs saas-admin --lines 40 --nostream 2>&1
echo ""
echo "=== NGINX STATUS ==="
systemctl is-active nginx
echo ""
echo "=== CURL 5000 ==="
curl -s -o /dev/null -w "HTTP %{http_code} size=%{size_download}b" http://127.0.0.1:5000/ 2>&1
echo ""
echo "=== ASSETS DIR ==="
ls /var/www/saasapp/dist/assets/ 2>/dev/null || echo MISSING
echo ""
echo "=== INDEX HTML ==="
head -5 /var/www/saasapp/dist/index.html 2>/dev/null || echo MISSING
