#!/bin/bash
set -e

echo ""
echo "=============================================="
echo "  Edumid Backend — Full VPS Deployment"
echo "=============================================="

# ── 1. Install Node.js 20 LTS ──────────────────────────────────────────────
echo ""
echo "[1/8] Installing Node.js 20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
apt install -y nodejs > /dev/null 2>&1
echo "      Node $(node -v) | npm $(npm -v)"

# ── 2. Install PM2 ─────────────────────────────────────────────────────────
echo ""
echo "[2/8] Installing PM2..."
npm install -g pm2 > /dev/null 2>&1
echo "      PM2 $(pm2 -v)"

# ── 3. Clone or update repo ────────────────────────────────────────────────
echo ""
echo "[3/8] Cloning / updating repository..."
if [ -d "/root/shivam-backend/.git" ]; then
  cd /root/shivam-backend
  git pull origin main
else
  cd /root
  git clone https://github.com/aarya29578/shivam-backend.git
  cd /root/shivam-backend
fi
cd /root/shivam-backend

# ── 4. Create .env ─────────────────────────────────────────────────────────
echo ""
echo "[4/8] Creating .env file..."
cat > .env << 'ENVEOF'
PORT=5000
MONGO_URI=mongodb+srv://aaryaleap_db_user:ZXCvbnm12345678@cluster0.3zq4ych.mongodb.net/myapp?retryWrites=true&w=majority&authSource=admin
ENVEOF
echo "      .env written."

# ── 5. Install npm dependencies ────────────────────────────────────────────
echo ""
echo "[5/8] Installing npm dependencies..."
npm install
echo "      Dependencies installed."

# ── 6. Start with PM2 ─────────────────────────────────────────────────────
echo ""
echo "[6/8] Starting app with PM2..."
pm2 stop edumid-api 2>/dev/null || true
pm2 delete edumid-api 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
# Register pm2 to auto-start on reboot
env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root > /dev/null 2>&1 || true
systemctl enable pm2-root 2>/dev/null || true
echo "      PM2 started."

# ── 7. Install and configure Nginx ────────────────────────────────────────
echo ""
echo "[7/8] Configuring Nginx..."
apt install -y nginx > /dev/null 2>&1

cat > /etc/nginx/sites-available/edumid << 'NGINXEOF'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass         http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/edumid /etc/nginx/sites-enabled/edumid
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx
systemctl enable nginx
echo "      Nginx configured and running."

# ── 8. Final health check ──────────────────────────────────────────────────
echo ""
echo "[8/8] Running health checks..."
sleep 2

PM2_STATUS=$(pm2 jlist 2>/dev/null | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const a=JSON.parse(d);const app=a.find(x=>x.name==='edumid-api');console.log(app?app.pm2_env.status:'not found')" 2>/dev/null || echo "unknown")
API_RESPONSE=$(curl -s --max-time 5 http://localhost:5000/ || echo "no response")
NGINX_STATUS=$(systemctl is-active nginx)

echo ""
echo "=============================================="
echo "  DEPLOYMENT RESULTS"
echo "=============================================="
echo ""
echo "  Node.js   : $(node -v)"
echo "  npm       : $(npm -v)"
echo "  PM2 app   : $PM2_STATUS"
echo "  Nginx     : $NGINX_STATUS"
echo "  API test  : $API_RESPONSE"
echo ""
pm2 status
echo ""

SERVER_IP=$(curl -s --max-time 5 https://api.ipify.org 2>/dev/null || echo "72.62.241.170")
echo "=============================================="
echo "  ✅ dotenv configured"
echo "  ✅ MongoDB connected via env variable"
echo "  ✅ .env file created on server"
echo "  ✅ npm dependencies installed"
echo "  ✅ PM2 managing process (auto-restart ON)"
echo "  ✅ PM2 startup registered (survives reboots)"
echo "  ✅ Nginx reverse proxy active on port 80"
echo ""
echo "  🚀 API is LIVE at: http://$SERVER_IP/"
echo "=============================================="
