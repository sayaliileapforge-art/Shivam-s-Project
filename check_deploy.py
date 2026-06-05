#!/usr/bin/env python3
import subprocess
import sys

# SSH credentials
host = "72.62.241.170"
user = "root"
password = "Blackalert@87"

# Commands to run
commands = [
    "cd /var/www/saasapp && git log --oneline -3",
    "cd /var/www/saasapp && pm2 status",
    "cd /var/www/saasapp && ls -la backend/dist/ 2>/dev/null | head -10"
]

# Try using sshpass if available
try:
    import sshpass
    print("Using sshpass...")
except ImportError:
    print("Installing sshpass via pip...")
    subprocess.run([sys.executable, "-m", "pip", "install", "paramiko", "-q"], check=False)

# Try with paramiko
try:
    import paramiko
    
    print("Connecting to Hostinger server...")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, username=user, password=password, timeout=10)
    
    print("\n✓ Connected successfully!\n")
    
    for cmd in commands:
        print(f"Running: {cmd}")
        stdin, stdout, stderr = client.exec_command(cmd)
        output = stdout.read().decode()
        error = stderr.read().decode()
        
        if output:
            print(output)
        if error:
            print("ERROR:", error)
        print("-" * 60)
    
    client.close()
    print("\n✓ Deployment check complete!")
    
except Exception as e:
    print(f"Error: {e}")
    print("\nFalling back to manual deployment command...")
    print(f"Run this command to deploy: sshpass -p 'Blackalert@87' ssh root@72.62.241.170 'bash /var/www/saasapp/deploy.sh'")
