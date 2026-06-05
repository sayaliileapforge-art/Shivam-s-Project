#!/usr/bin/env python3
import paramiko
import sys

host = "72.62.241.170"
user = "root"
password = "Blackalert@87"

print("Connecting to Hostinger server...")
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

try:
    client.connect(host, username=user, password=password, timeout=10)
    print("✓ Connected!\n")
    
    print("Running deployment script... This may take 5-10 minutes...\n")
    print("=" * 70)
    
    # Execute deploy script with real-time output
    stdin, stdout, stderr = client.exec_command("bash /var/www/saasapp/deploy.sh")
    
    # Read output line by line
    for line in stdout:
        print(line.rstrip())
    
    # Check for errors
    error_output = stderr.read().decode()
    if error_output:
        print("\nWARNINGS/ERRORS:")
        print(error_output)
    
    print("=" * 70)
    print("\n✓ Deployment complete!")
    
    # Verify deployment
    print("\nVerifying deployment...")
    stdin, stdout, stderr = client.exec_command("cd /var/www/saasapp && git log --oneline -1")
    latest_commit = stdout.read().decode().strip()
    print(f"Latest commit on server: {latest_commit}")
    
    print("\nPM2 Status:")
    stdin, stdout, stderr = client.exec_command("pm2 status")
    print(stdout.read().decode())
    
    client.close()
    
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
