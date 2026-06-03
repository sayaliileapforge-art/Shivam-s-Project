#!/usr/bin/env python3
import paramiko, sys, time

HOST, USER, PASS = "72.62.241.170", "root", "Blackalert@87"
APP = "/var/www/saasapp"

def run(client, label, cmd, timeout=120):
    print(f"\n[{label}]")
    _, stdout, _ = client.exec_command(cmd, timeout=timeout, get_pty=True)
    out = stdout.read().decode(errors="replace")
    sys.stdout.write(out); sys.stdout.flush()
    rc = stdout.channel.recv_exit_status()
    print(f"  → exit {rc}")
    return rc

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASS, timeout=20, look_for_keys=False, allow_agent=False)
print("Connected.")

# Install system library needed by opencv
run(client, "Install libGL (needed by opencv)",
    "apt-get install -y libgl1 libglib2.0-0 libsm6 libxrender1 libxext6 2>&1 | tail -5",
    timeout=120)

# Verify cv2 can load
run(client, "Test cv2 import",
    f"{APP}/.venv/bin/python -c 'import cv2; print(cv2.__version__)'")

# Restart ai-service
run(client, "Restart ai-service", "pm2 restart ai-service")

time.sleep(5)
run(client, "pm2 status", "pm2 status")
run(client, "Port 8001", "ss -tlnp | grep ':8001' || echo 'NOT on 8001'")
run(client, "Health check", "curl -s http://localhost:8001/health || echo 'NOT OK'")
run(client, "AI logs tail", "pm2 logs ai-service --lines 15 --nostream 2>&1")

run(client, "pm2 save", "pm2 save")
client.close()
print("\nDone.")
