#!/usr/bin/env python3
"""Fix Python AI service on Hostinger VPS."""
import sys
import paramiko

HOST = "72.62.241.170"
USER = "root"
PASS = "Blackalert@87"
APP = "/var/www/saasapp"

COMMANDS = [
    # Check what python3 is available
    ("Python version", "python3 --version"),
    ("Check venv python", f"{APP}/.venv/bin/python --version"),
    # Upgrade pip and install requirements
    ("Upgrade pip", f"{APP}/.venv/bin/pip install --upgrade pip"),
    ("Install requirements", f"{APP}/.venv/bin/pip install -r {APP}/backend/ai_service/requirements.txt"),
    # Test uvicorn is available
    ("Test uvicorn", f"{APP}/.venv/bin/python -m uvicorn --version"),
    # Stop and restart ai-service
    ("Stop ai-service", "pm2 stop ai-service 2>/dev/null; pm2 delete ai-service 2>/dev/null; echo 'done'"),
    ("Start ai-service",
     f"pm2 start '{APP}/.venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8001' "
     f"--name ai-service --cwd {APP}/backend/ai_service"),
    ("pm2 save", "pm2 save"),
    ("Final status", "pm2 status && ss -tlnp | grep ':8001'"),
]

def run(client, label, cmd, timeout=300):
    print(f"\n[{label}]")
    print(f"$ {cmd[:100]}{'...' if len(cmd)>100 else ''}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout, get_pty=True)
    out = stdout.read().decode(errors="replace")
    print(out)
    rc = stdout.channel.recv_exit_status()
    if rc != 0:
        print(f"  [exit: {rc}]")
    return rc

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
    print("\nDone.")

if __name__ == "__main__":
    main()
