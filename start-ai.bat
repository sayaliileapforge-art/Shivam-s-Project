@echo off
cd /d "c:\Users\Sayali\Downloads\Enterprise SaaS Admin Portal\backend\ai_service"
echo Installing AI Service dependencies...
pip install -r requirements.txt
echo Starting AI Service on port 8001...
python main.py
pause
