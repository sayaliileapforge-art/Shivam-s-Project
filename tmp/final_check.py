#!/usr/bin/env python3
import paramiko, sys, time

HOST, USER, PASS = "72.62.241.170", "root", "Blackalert@87"

def run(client, label, cmd, timeout=30):
    print(f"\n[{label}]")
    _, stdout, _ = client.exec_command(cmd, timeout=timeout, get_pty=True)
    print(stdout.read().decode(errors="replace"))
    return stdout.channel.recv_exit_status()

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASS, timeout=20, look_for_keys=False, allow_agent=False)
print("Connected.")

time.sleep(2)
run(client, "pm2 status", "pm2 status")
run(client, "Port 8001", "ss -tlnp | grep ':8001' || echo 'NOT listening on 8001'")
run(client, "AI service health", "curl -s http://localhost:8001/health 2>&1 || echo 'curl failed'")
run(client, "AI logs", "pm2 logs ai-service --lines 20 --nostream 2>&1")
client.close()
