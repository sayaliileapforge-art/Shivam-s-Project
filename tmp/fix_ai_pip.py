#!/usr/bin/env python3
"""Fix Python AI service — install pip into venv and restart."""
import sys
import paramiko
import time

HOST = "72.62.241.170"
USER = "root"
PASS = "Blackalert@87"
APP = "/var/www/saasapp"

def run(client, label, cmd, timeout=300):
    print(f"\n[{label}]")
    print(f"$ {cmd[:120]}{'...' if len(cmd)>120 else ''}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout, get_pty=True)
    out = stdout.read().decode(errors="replace")
    print(out)
    rc = stdout.channel.recv_exit_status()
    print(f"  exit: {rc}")
    return rc

def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting to {HOST}...")
    client.connect(HOST, username=USER, password=PASS, timeout=30,
                   look_for_keys=False, allow_agent=False)
    print("Connected.\n")

    # Step 1: Recreate venv fresh (ensures pip is included)
    run(client, "Delete old venv", f"rm -rf {APP}/.venv")
    run(client, "Create venv with pip",
        f"python3 -m venv {APP}/.venv --without-pip || python3 -m venv {APP}/.venv")
    
    # Step 2: Bootstrap pip if not present
    run(client, "Bootstrap pip",
        f"{APP}/.venv/bin/python -m ensurepip --upgrade 2>&1 || "
        f"curl -sS https://bootstrap.pypa.io/get-pip.py | {APP}/.venv/bin/python")
    
    # Step 3: Verify pip
    run(client, "Pip version", f"{APP}/.venv/bin/python -m pip --version")
    
    # Step 4: Install requirements
    run(client, "Install requirements (may take a few minutes)",
        f"{APP}/.venv/bin/python -m pip install -r {APP}/backend/ai_service/requirements.txt",
        timeout=600)
    
    # Step 5: Verify uvicorn
    run(client, "Verify uvicorn", f"{APP}/.venv/bin/python -m uvicorn --version")
    
    # Step 6: Create a proper start script for the AI service
    start_script = (
        f"cat > {APP}/start-ai-service.sh << 'EOF'\n"
        "#!/bin/bash\n"
        f"source {APP}/.venv/bin/activate\n"
        f"cd {APP}/backend/ai_service\n"
        "exec python -m uvicorn main:app --host 0.0.0.0 --port 8001\n"
        "EOF"
    )
    run(client, "Create start script", start_script)
    run(client, "Make script executable", f"chmod +x {APP}/start-ai-service.sh")

    # Step 7: Stop old ai-service and register fresh
    run(client, "Delete old ai-service from pm2",
        "pm2 delete ai-service 2>/dev/null; echo 'ok'")
    run(client, "Start ai-service via PM2",
        f"pm2 start {APP}/start-ai-service.sh --name ai-service")
    
    # Wait a moment for service to start
    time.sleep(3)
    
    # Step 8: Save and check
    run(client, "pm2 save", "pm2 save")
    run(client, "Final status", "pm2 status")
    run(client, "Check port 8001", "ss -tlnp | grep ':8001' || echo 'port 8001 not listening yet'")
    run(client, "AI service logs (last 15)", "pm2 logs ai-service --lines 15 --nostream 2>&1")

    client.close()
    print("\nDone.")

if __name__ == "__main__":
    main()
