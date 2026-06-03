#!/usr/bin/env python3
"""Check if requirements installed and fix ai-service."""
import sys, time
import paramiko

HOST = "72.62.241.170"
USER = "root"
PASS = "Blackalert@87"
APP = "/var/www/saasapp"

def run(client, label, cmd, timeout=600):
    print(f"\n[{label}]")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout, get_pty=True)
    out = stdout.read().decode(errors="replace")
    sys.stdout.write(out)
    sys.stdout.flush()
    rc = stdout.channel.recv_exit_status()
    print(f"  → exit {rc}")
    return rc

def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting to {HOST}...")
    client.connect(HOST, username=USER, password=PASS, timeout=30,
                   look_for_keys=False, allow_agent=False)
    print("Connected.")

    # Check what's in the venv
    run(client, "Check venv packages", f"ls {APP}/.venv/lib/python3.12/site-packages/ 2>&1 | head -20")
    run(client, "Check uvicorn installed", f"{APP}/.venv/bin/python -m uvicorn --version 2>&1")

    # If uvicorn not installed, install requirements
    rc = run(client, "Test import uvicorn",
             f"{APP}/.venv/bin/python -c 'import uvicorn; print(uvicorn.__version__)' 2>&1")
    if rc != 0:
        print("\n[uvicorn not installed — installing requirements now...]")
        # First ensure pip is available
        run(client, "Bootstrap pip if needed",
            f"{APP}/.venv/bin/python -m pip --version 2>&1 || "
            f"(curl -sS https://bootstrap.pypa.io/get-pip.py | {APP}/.venv/bin/python)")
        # Install minimal set first (skip heavy mediapipe if it fails)
        run(client, "Install core requirements",
            f"{APP}/.venv/bin/python -m pip install "
            f"fastapi==0.115.0 'uvicorn[standard]==0.30.6' python-multipart==0.0.9 "
            f"Pillow==10.4.0 numpy==1.26.4 aiofiles==23.2.1 httpx==0.27.2 "
            f"'qrcode[pil]==7.4.2' python-barcode==0.15.1",
            timeout=300)
        run(client, "Install opencv (headless)",
            f"{APP}/.venv/bin/python -m pip install opencv-python-headless==4.10.0.84",
            timeout=300)
        run(client, "Install rembg",
            f"{APP}/.venv/bin/python -m pip install rembg==2.0.57",
            timeout=300)
        run(client, "Install mediapipe",
            f"{APP}/.venv/bin/python -m pip install mediapipe==0.10.14",
            timeout=300)

    # Create a clean start script
    print("\n[Creating start-ai-service.sh]")
    start_sh = f"""#!/bin/bash
source {APP}/.venv/bin/activate
cd {APP}/backend/ai_service
exec python -m uvicorn main:app --host 0.0.0.0 --port 8001 --workers 1
"""
    _, stdin_s, _ = client.exec_command(f"cat > {APP}/start-ai-service.sh", get_pty=False)
    stdin_s.write(start_sh)
    stdin_s.channel.shutdown_write()
    run(client, "Make start script executable", f"chmod +x {APP}/start-ai-service.sh")

    # Stop old ai-service and restart fresh
    run(client, "Delete ai-service from pm2",
        "pm2 delete ai-service 2>/dev/null; echo 'ok'")
    run(client, "Start ai-service",
        f"pm2 start {APP}/start-ai-service.sh --name ai-service")

    time.sleep(4)
    run(client, "pm2 save", "pm2 save")
    run(client, "Final pm2 status", "pm2 status")
    run(client, "Port 8001 check", "ss -tlnp | grep ':8001' || echo 'NOT listening on 8001'")
    run(client, "AI service logs", "pm2 logs ai-service --lines 20 --nostream 2>&1")

    client.close()
    print("\nDone.")

if __name__ == "__main__":
    main()
