#!/usr/bin/env python3
"""One-shot deployment runner via SSH using paramiko."""
import sys
import paramiko

HOST = "72.62.241.170"
USER = "root"
PASS = "Blackalert@87"

APP = "/var/www/saasapp"

# Commands to run in order; (label, command, fatal_on_fail)
COMMANDS = [
    ("Fix git remote",
     f"cd {APP} && git remote set-url origin https://github.com/sayaliileapforge-art/Shivam-s-Project.git",
     False),
    ("Git pull",
     f"cd {APP} && git pull origin main",
     False),
    ("Fix deploy.sh line endings",
     f"sed -i 's/\r//' {APP}/deploy.sh",
     False),
    ("Backend npm install",
     f"cd {APP}/backend && npm install --legacy-peer-deps",
     True),
    ("Backend build (tsc)",
     f"cd {APP}/backend && npm run build",
     True),
    ("Frontend npm install",
     f"cd {APP} && npm install",
     True),
    ("Frontend build (vite)",
     f"cd {APP} && npm run build",
     True),
    ("Ensure upload dirs",
     f"mkdir -p {APP}/backend/public/uploads/templates {APP}/backend/public/uploads/assets",
     False),
    ("Update UPLOADS_DIR in .env",
     f"""grep -q '^UPLOADS_DIR=' {APP}/backend/.env 2>/dev/null """
     f"""&& sed -i 's|^UPLOADS_DIR=.*|UPLOADS_DIR={APP}/backend/public/uploads|' {APP}/backend/.env """
     f"""|| echo 'UPLOADS_DIR={APP}/backend/public/uploads' >> {APP}/backend/.env""",
     False),
    ("Python venv setup",
     f"""if [ ! -d {APP}/.venv ]; then python3 -m venv {APP}/.venv; fi """
     f"""&& {APP}/.venv/bin/pip install --upgrade pip -q """
     f"""&& {APP}/.venv/bin/pip install -r {APP}/backend/ai_service/requirements.txt -q""",
     False),
    ("Restart Node backend (pm2)",
     f"pm2 restart saasapp --update-env 2>/dev/null "
     f"|| pm2 start {APP}/backend/dist/server.js --name saasapp",
     False),
    ("Restart Python AI service (pm2)",
     f"pm2 restart ai-service --update-env 2>/dev/null "
     f"|| pm2 start '{APP}/.venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8001' "
     f"--name ai-service --cwd {APP}/backend/ai_service",
     False),
    ("pm2 save",
     "pm2 save && pm2 status",
     False),
]

def run_command(client, label, cmd, timeout=600):
    print(f"\n{'='*60}")
    print(f"[{label}]")
    print(f"$ {cmd[:100]}{'...' if len(cmd)>100 else ''}")
    print('='*60)
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout, get_pty=True)
    for line in stdout:
        sys.stdout.write(line)
        sys.stdout.flush()
    exit_code = stdout.channel.recv_exit_status()
    print(f"[exit: {exit_code}]")
    return exit_code

def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting to {HOST}...")
    client.connect(HOST, username=USER, password=PASS, timeout=30,
                   look_for_keys=False, allow_agent=False)
    print("Connected.\n")

    for label, cmd, fatal in COMMANDS:
        rc = run_command(client, label, cmd)
        if rc != 0 and fatal:
            print(f"\n[FATAL] '{label}' failed with exit code {rc}. Stopping.")
            break
        elif rc != 0:
            print(f"[WARN] '{label}' returned {rc}, continuing...")

    client.close()
    print("\n=== Deployment script finished ===")

if __name__ == "__main__":
    main()
