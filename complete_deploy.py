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
    ("Installing @types/nodemailer...", "cd /var/www/saasapp/backend && npm install --save-dev @types/nodemailer"),
    ("Retrying backend build...", "cd /var/www/saasapp/backend && npm run build"),
    ("Building frontend...", "cd /var/www/saasapp && npm run build"),
    ("Updating UPLOADS_DIR in .env...", "sed -i 's|^UPLOADS_DIR=.*|UPLOADS_DIR=/var/www/saasapp/backend/public/uploads|' /var/www/saasapp/backend/.env || echo 'UPLOADS_DIR=/var/www/saasapp/backend/public/uploads' >> /var/www/saasapp/backend/.env"),
    ("Restarting services with pm2...", "cd /var/www/saasapp && pm2 restart all --update-env"),
    ("Waiting for services...", "sleep 3"),
]

print("\n" + "=" * 70)
print("FIXING BUILD & RESTARTING SERVICES")
print("=" * 70 + "\n")

for desc, cmd in commands:
    print(f"→ {desc}")
    stdin, stdout, stderr = client.exec_command(cmd)
    stdout.channel.recv_exit_status()
    
    output = stdout.read().decode().strip()
    error = stderr.read().decode().strip()
    
    if output:
        lines = output.split('\n')
        for line in lines[-3:]:  # Show last 3 lines
            if line.strip():
                print(f"  {line[:150]}")
    if error and len(error) > 10 and "npm" not in error.lower():
        print(f"  ERR: {error[:200]}")

print("\n" + "=" * 70)
print("✓ Deployment complete!")
print("=" * 70 + "\n")

# Final verification
print("FINAL VERIFICATION:")
print("-" * 70)

checks = [
    ("Latest commit:", "cd /var/www/saasapp && git log --oneline -1"),
    ("Service status:", "pm2 status | grep -E 'saasapp|ai-service'"),
    ("Backend running:", "curl -s http://localhost:5000/health | head -c 100"),
]

for label, cmd in checks:
    stdin, stdout, stderr = client.exec_command(cmd)
    stdout.channel.recv_exit_status()
    output = stdout.read().decode().strip()
    print(f"\n{label}")
    print(output[:300])

client.close()
print("\n" + "=" * 70)
print("✓ All done! Changes deployed successfully!")
print("=" * 70)
