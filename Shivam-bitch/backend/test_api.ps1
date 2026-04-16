Write-Host ""
Write-Host "========================================"
Write-Host "  ID Card Form System - Backend Test"
Write-Host "========================================"
Write-Host ""

$BASE_URL = "http://localhost:5000"
$PRINCIPAL_ID = "principal_001"

# Test 1: Principal Classes
Write-Host "[1/5] Testing Principal Classes Endpoint..." -ForegroundColor Cyan
Write-Host "URL: $BASE_URL/api/principal/classes?principalId=$PRINCIPAL_ID" -ForegroundColor Gray
try {
    $response = Invoke-WebRequest -Uri "$BASE_URL/api/principal/classes?principalId=$PRINCIPAL_ID" -Method GET
    Write-Host "✅ Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host $response.Content | ConvertFrom-Json | ConvertTo-Json
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 2: Fetch Form (Before Save)
Write-Host "[2/5] Testing Form Fetch Endpoint (Before Save)..." -ForegroundColor Cyan
Write-Host "URL: $BASE_URL/api/form?principalId=$PRINCIPAL_ID" -ForegroundColor Gray
try {
    $response = Invoke-WebRequest -Uri "$BASE_URL/api/form?principalId=$PRINCIPAL_ID" -Method GET
    Write-Host "✅ Status: $($response.StatusCode)" -ForegroundColor Green
    $content = $response.Content
    if ($content -eq "null") {
        Write-Host "ℹ️  No form found yet (expected)" -ForegroundColor Yellow
    } else {
        Write-Host $content | ConvertFrom-Json | ConvertTo-Json
    }
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 3: Save Form
Write-Host "[3/5] Testing Form Save Endpoint..." -ForegroundColor Cyan
Write-Host "URL: $BASE_URL/api/principal/id-card-form" -ForegroundColor Gray
try {
    $formData = @{
        principalId = "principal_001"
        formTitle = "Test Form"
        formDescription = "Test Description"
        formFields = @(
            @{
                fieldId = "field_1"
                fieldName = "Full Name"
                fieldType = "text"
                isRequired = $true
                placeholder = "Enter full name"
                options = @()
                order = 0
            },
            @{
                fieldId = "field_2"
                fieldName = "Roll Number"
                fieldType = "text"
                isRequired = $true
                placeholder = "Enter roll number"
                options = @()
                order = 1
            }
        )
    } | ConvertTo-Json -Depth 10

    $response = Invoke-WebRequest -Uri "$BASE_URL/api/principal/id-card-form" `
        -Method POST `
        -ContentType "application/json" `
        -Body $formData
    Write-Host "✅ Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host $response.Content | ConvertFrom-Json | ConvertTo-Json
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 4: Fetch Form (After Save)
Write-Host "[4/5] Testing Form Fetch Endpoint (After Save)..." -ForegroundColor Cyan
Write-Host "URL: $BASE_URL/api/form?principalId=$PRINCIPAL_ID" -ForegroundColor Gray
try {
    $response = Invoke-WebRequest -Uri "$BASE_URL/api/form?principalId=$PRINCIPAL_ID" -Method GET
    Write-Host "✅ Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host $response.Content | ConvertFrom-Json | ConvertTo-Json
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 5: Submit Form
Write-Host "[5/5] Testing Form Submit Endpoint..." -ForegroundColor Cyan
Write-Host "URL: $BASE_URL/api/form/submit" -ForegroundColor Gray
try {
    $submitData = @{
        principalId = "principal_001"
        userId = "student_001"
        userEmail = "student@school.com"
        userName = "John Doe"
        role = "student"
        formData = @{
            "field_1" = "John Doe"
            "field_2" = "STU001"
        }
    } | ConvertTo-Json -Depth 10

    $response = Invoke-WebRequest -Uri "$BASE_URL/api/form/submit" `
        -Method POST `
        -ContentType "application/json" `
        -Body $submitData
    Write-Host "✅ Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host $response.Content | ConvertFrom-Json | ConvertTo-Json
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

Write-Host "========================================"
Write-Host "  Test Complete!"
Write-Host "========================================"
Write-Host ""
Write-Host "✅ If all tests passed, backend is working!" -ForegroundColor Green
Write-Host "❌ If you see errors, check:" -ForegroundColor Red
Write-Host "   1. Backend is running (npm start)"
Write-Host "   2. MongoDB is connected"
Write-Host "   3. Port 5000 is not blocked"
Write-Host ""
Read-Host "Press Enter to exit"
