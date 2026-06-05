#!/usr/bin/env python3
import paramiko

host = "72.62.241.170"
user = "root"
password = "Blackalert@87"

print("Connecting to Hostinger server...")
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=password, timeout=10)

commands = [
    ("Stashing local changes...", "cd /var/www/saasapp && git stash"),
    ("Pulling latest code...", "cd /var/www/saasapp && git pull origin main"),
    ("Installing backend dependencies...", "cd /var/www/saasapp/backend && npm ci --omit=dev"),
    ("Building backend...", "cd /var/www/saasapp/backend && npm run build"),
    ("Installing & building frontend...", "cd /var/www/saasapp && npm ci && npm run build"),
    ("Setting up upload directories...", "mkdir -p /var/www/saasapp/backend/public/uploads/templates /var/www/saasapp/backend/public/uploads/assets"),
    ("Installing Python dependencies...", "cd /var/www/saasapp && .venv/bin/pip install -r backend/ai_service/requirements.txt --quiet"),
    ("Restarting services...", "pm2 restart all --update-env"),
]

print("\n" + "=" * 70)
print("DEPLOYING CHANGES")
print("=" * 70 + "\n")

for desc, cmd in commands:
    print(f"→ {desc}")
    stdin, stdout, stderr = client.exec_command(cmd)
    stdout.channel.recv_exit_status()  # Wait for command to complete
    
    output = stdout.read().decode().strip()
    error = stderr.read().decode().strip()
    
    if output:
        print(f"  {output[:200]}")  # Show first 200 chars
    if error and "npm" not in error.lower():  # Ignore npm warnings
        print(f"  WARNING: {error[:200]}")

print("\n" + "=" * 70)
print("✓ Deployment complete!")
print("=" * 70 + "\n")

# Verify
print("Verifying...")
stdin, stdout, stderr = client.exec_command("cd /var/www/saasapp && git log --oneline -1 && echo '---' && pm2 status | grep -E 'saasapp|ai-service'")
print(stdout.read().decode())

client.close()
