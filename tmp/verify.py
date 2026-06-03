#!/usr/bin/env python3
import paramiko, time, sys

HOST, USER, PASS = "72.62.241.170", "root", "Blackalert@87"
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASS, timeout=20, look_for_keys=False, allow_agent=False)
def run(cmd, t=30):
    _, o, _ = client.exec_command(cmd, timeout=t, get_pty=True)
    out = o.read().decode(errors="replace")
    sys.stdout.write(out); sys.stdout.flush()
    return o.channel.recv_exit_status()

time.sleep(8)
run("pm2 status")
run("ss -tlnp | grep :8001 || echo NOT_LISTENING")
run("curl -s http://localhost:8001/health || echo FAIL")
run("pm2 logs ai-service --lines 10 --nostream 2>&1")
run("pm2 save")
client.close()
print("\nDone.")
