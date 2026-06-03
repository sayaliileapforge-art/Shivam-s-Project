#!/usr/bin/env python3
"""Check server status after deployment."""
import sys
import paramiko

HOST = "72.62.241.170"
USER = "root"
PASS = "Blackalert@87"

COMMANDS = [
    ("pm2 status", "pm2 status"),
    ("Check port 5000", "ss -tlnp | grep ':5000'"),
    ("Check port 8001", "ss -tlnp | grep ':8001'"),
    ("Backend dist exists?", "ls -la /var/www/saasapp/backend/dist/ 2>&1 | head -5"),
    ("Frontend dist exists?", "ls -la /var/www/saasapp/dist/ 2>&1 | head -5"),
    ("Node backend logs (last 20)", "pm2 logs saasapp --lines 20 --nostream 2>&1"),
    ("AI service logs (last 10)", "pm2 logs ai-service --lines 10 --nostream 2>&1"),
]

def run(client, label, cmd):
    print(f"\n[{label}]")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=60, get_pty=True)
    out = stdout.read().decode(errors="replace")
    print(out)
    return stdout.channel.recv_exit_status()

def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting to {HOST}...")
    client.connect(HOST, username=USER, password=PASS, timeout=30,
                   look_for_keys=False, allow_agent=False)
    print("Connected.\n")
    for label, cmd in COMMANDS:
        run(client, label, cmd)
    client.close()

if __name__ == "__main__":
    main()
