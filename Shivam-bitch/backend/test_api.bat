@echo off
REM Backend API Test Script - Windows PowerShell
REM This script tests all form endpoints

echo.
echo ========================================
echo   ID Card Form System - Backend Test
echo ========================================
echo.

set BASE_URL=http://localhost:5000
set PRINCIPAL_ID=principal_001

echo [1/4] Testing Principal Classes Endpoint...
echo URL: %BASE_URL%/api/principal/classes?principalId=%PRINCIPAL_ID%
curl -X GET "%BASE_URL%/api/principal/classes?principalId=%PRINCIPAL_ID%"
echo.
echo.

echo [2/4] Testing Form Fetch Endpoint (Before Save)...
echo URL: %BASE_URL%/api/form?principalId=%PRINCIPAL_ID%
curl -X GET "%BASE_URL%/api/form?principalId=%PRINCIPAL_ID%"
echo.
echo.

echo [3/4] Testing Form Save Endpoint...
echo URL: %BASE_URL%/api/principal/id-card-form
curl -X POST "%BASE_URL%/api/principal/id-card-form" ^
  -H "Content-Type: application/json" ^
  -d "{\"principalId\":\"principal_001\",\"formTitle\":\"Test Form\",\"formDescription\":\"Test\",\"formFields\":[{\"fieldId\":\"field_1\",\"fieldName\":\"Name\",\"fieldType\":\"text\",\"isRequired\":true,\"placeholder\":\"Enter name\",\"options\":[],\"order\":0}]}"
echo.
echo.

echo [4/4] Testing Form Fetch Endpoint (After Save)...
echo URL: %BASE_URL%/api/form?principalId=%PRINCIPAL_ID%
curl -X GET "%BASE_URL%/api/form?principalId=%PRINCIPAL_ID%"
echo.
echo.

echo ========================================
echo   Test Complete!
echo ========================================
echo.
echo If all endpoints returned data, backend is working!
echo If you see "Route not found", restart backend.
echo.
pause
