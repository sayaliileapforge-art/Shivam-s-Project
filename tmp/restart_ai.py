#!/usr/bin/env python3
"""Restart ai-service with a proper start script."""
import sys, time
import paramiko

HOST = "72.62.241.170"
USER = "root"
PASS = "Blackalert@87"
APP = "/var/www/saasapp"

def run(client, label, cmd, timeout=60):
    print(f"\n[{label}]")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout, get_pty=True)
    out = stdout.read().decode(errors="replace")
    sys.stdout.write(out)
    rc = stdout.channel.recv_exit_status()
    print(f"  → exit {rc}")
    return rc

def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASS, timeout=30,
                   look_for_keys=False, allow_agent=False)
    print("Connected.")

    # Write start script using printf to avoid heredoc issues
    script_content = (
        "#!/bin/bash\\n"
        f"source {APP}/.venv/bin/activate\\n"
        f"cd {APP}/backend/ai_service\\n"
        "exec python -m uvicorn main:app --host 0.0.0.0 --port 8001\\n"
    )
    run(client, "Write start script",
        f"printf '{script_content}' > {APP}/start-ai-service.sh && "
        f"chmod +x {APP}/start-ai-service.sh && "
        f"cat {APP}/start-ai-service.sh")

    # Verify uvicorn works in the venv
    run(client, "Verify uvicorn in venv",
        f"source {APP}/.venv/bin/activate && uvicorn --version")

    # Stop and delete old ai-service
    run(client, "Delete old ai-service",
        "pm2 delete ai-service 2>/dev/null; echo 'cleared'")

    # Start fresh
    run(client, "Start ai-service",
        f"pm2 start {APP}/start-ai-service.sh --name ai-service")

    time.sleep(5)

    run(client, "pm2 save", "pm2 save")
    run(client, "pm2 status", "pm2 status")
    run(client, "Port 8001", "ss -tlnp | grep ':8001' || echo 'NOT on 8001'")
    run(client, "AI logs (last 15)", "pm2 logs ai-service --lines 15 --nostream 2>&1")

    client.close()
    print("\nDone.")

if __name__ == "__main__":
    main()
