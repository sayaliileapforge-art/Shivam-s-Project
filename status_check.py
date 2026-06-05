#!/usr/bin/env python3
import paramiko

host = "72.62.241.170"
user = "root"
password = "Blackalert@87"

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=password, timeout=10)

print("=" * 70)
print("DEPLOYMENT STATUS CHECK")
print("=" * 70)

checks = [
    ("Latest commit on server:", "cd /var/www/saasapp && git log --oneline -1"),
    ("Backend dist exists:", "ls -la /var/www/saasapp/backend/dist/server.js 2>&1 | head -1"),
    ("Frontend dist exists:", "ls -la /var/www/saasapp/dist/index.html 2>&1 | head -1"),
    ("PM2 Services:", "pm2 status"),
]

for label, cmd in checks:
    stdin, stdout, stderr = client.exec_command(cmd)
    stdout.channel.recv_exit_status()
    output = stdout.read().decode().strip()
    print(f"\n{label}")
    print(output[:500])

print("\n" + "=" * 70)

# Check if services are actually running
print("Service Health Check:")
stdin, stdout, stderr = client.exec_command("curl -s http://localhost:5000/health 2>&1")
health = stdout.read().decode().strip()
print(f"Backend API health: {health[:100]}")

client.close()
