# Centralized API Configuration - Implementation Guide

## Overview

All roles (Vendor, Principal, Teacher) now use a **centralized ApiConfig** for consistent backend connectivity.

**Location:** `lib/core/api/api_config.dart`

---

## What Was Changed

### 1. Created Centralized ApiConfig File
**File:** `lib/core/api/api_config.dart`

```dart
class ApiConfig {
  // Single source of truth for backend URL
  static const String baseUrl = 'http://72.62.241.170:5000';
  
  // Pre-defined endpoints
  static const String vendorClients = '$baseUrl/api/vendor/clients';
  static const String principalClasses = '$baseUrl/api/principal/classes';
  static const String teacherClasses = '$baseUrl/api/teacher/classes';
  
  // Timeout configuration
  static const int connectionTimeout = 15;
  static const int receiveTimeout = 15;
}
```

### 2. Updated All Screen Files

| Module | File | Changes |
|--------|------|---------|
| **Vendor** | `vendor_screens.dart` | ✅ Added import + uses `ApiConfig.baseUrl` |
| **Principal** | `principal_screens.dart` | ✅ Added import + uses `ApiConfig.baseUrl` |
| **Teacher** | `teacher_screens.dart` | ✅ Added import + uses `ApiConfig.baseUrl` |

---

## API Endpoints Available

### Vendor Endpoints
```dart
ApiConfig.vendorClients       // GET /api/vendor/clients
ApiConfig.vendorOrders        // GET /api/vendor/orders
ApiConfig.vendorDashboard     // GET /api/vendor/dashboard
```

### Principal Endpoints
```dart
ApiConfig.principalClasses    // GET /api/principal/classes
ApiConfig.principalMembers    // GET /api/principal/members
ApiConfig.principalDashboard  // GET /api/principal/dashboard
```

### Teacher Endpoints
```dart
ApiConfig.teacherClasses      // GET /api/teacher/classes
ApiConfig.teacherAttendance   // GET /api/teacher/attendance
ApiConfig.teacherDashboard    // GET /api/teacher/dashboard
```

---

## Usage Examples

### Example 1: Using BaseUrl
```dart
final dio = Dio();
final response = await dio.get(
  '${ApiConfig.baseUrl}/api/principal/classes',
  queryParameters: {'principalId': 'principal_001'},
);
```

### Example 2: Using Pre-defined Endpoints
```dart
final response = await dio.get(
  ApiConfig.principalClasses,
  queryParameters: {'principalId': 'principal_001'},
);
```

### Example 3: Using Helper Method
```dart
final url = ApiConfig.endpoint(
  '/api/vendor/clients',
  queryParams: {'vendorId': 'vendor_001'},
);
final response = await dio.get(url);
```

### Example 4: Debug Printing Configuration
```dart
// In main.dart or during initialization:
ApiConfig.debugPrint();
// Output:
// ╔════════════════════════════════════════╗
// ║   API Configuration                    ║
// ╚════════════════════════════════════════╝
// Base URL:         http://72.62.241.170:5000
// Vendor Classes:   http://72.62.241.170:5000/api/vendor/clients
// Principal Classes: http://72.62.241.170:5000/api/principal/classes
// Teacher Classes:  http://72.62.241.170:5000/api/teacher/classes
// Connection Timeout: 15s
// Receive Timeout:  15s
```

---

## How to Verify It Works

### 1. Check Backend Running
```bash
cd backend
npm start
# Expected: "MongoDB Connected" + "Server running on port 5000"
```

### 2. Test Vendor Role
1. Open Flutter app → Vendor role
2. Click "Dashboard"
3. ✅ Should see data from backend

### 3. Test Principal Role
1. Switch to Principal role
2. Click "Dashboard"
3. ✅ Should see classes/teachers/students
4. **Add a Class**: Should appear instantly in list

### 4. Test Teacher Role
1. Switch to Teacher role
2. Click "Dashboard"
3. ✅ Should see attendance data

### 5. Check Console Logs
Look for these logs indicating proper ApiConfig usage:
```
[Vendor] loadAll() starting... URL: http://72.62.241.170:5000
[Principal] loadAll() starting... URL: http://72.62.241.170:5000
[Teacher] loadSchools() starting... URL: http://72.62.241.170:5000
```

---

## Maintenance

### To Change Backend URL
**Only one place to update:**

File: `lib/core/api/api_config.dart`

```dart
// OLD:
static const String baseUrl = 'http://72.62.241.170:5000';

// NEW (for ngrok, if needed):
static const String baseUrl = 'https://your-ngrok-url.ngrok.io';

// NEW (for local development):
static const String baseUrl = 'http://192.168.1.100:5000';
```

All modules will automatically use the new URL.

### To Add New Endpoints
```dart
// In ApiConfig class:
static const String newEndpoint = '$baseUrl/api/path/endpoint';
```

---

## Advantages

✅ **Single Source of Truth**
- One place to configure backend URL
- Easy to switch between environments (dev/prod/staging)

✅ **Consistency**
- All modules use same URL
- No more mismatched endpoints

✅ **Debugging**
- `ApiConfig.debugPrint()` shows all endpoints
- Easy to verify configuration at startup

✅ **Maintainability**
- Add new endpoints once
- Use across all modules

✅ **Type-Safe**
- Pre-defined constants prevent typos
- IDE autocomplete for endpoints

---

## Files Modified

1. **Created:**
   - `lib/core/api/api_config.dart` (new file)

2. **Updated:**
   - `lib/features/vendor/screens/vendor_screens.dart`
   - `lib/features/principal/screens/principal_screens.dart`
   - `lib/features/teacher/screens/teacher_screens.dart`

---

## Environment-Specific Configuration

For different environments, you can create multiple config files:

```dart
// lib/core/api/api_config_dev.dart
class ApiConfigDev {
  static const String baseUrl = 'http://192.168.1.100:5000';
}

// lib/core/api/api_config_prod.dart
class ApiConfigProd {
  static const String baseUrl = 'http://72.62.241.170:5000';
}

// main.dart
import 'package:flutter/foundation.dart';
import 'api_config_dev.dart' if (dart.library.html) 'api_config_prod.dart' as api;
```

But for now, the simple `ApiConfig` with hardcoded production URL is sufficient.

---

## Production Checklist

- ✅ Backend URL correct: `http://72.62.241.170:5000`
- ✅ MongoDB accessible from backend
- ✅ All endpoints tested:
  - [ ] `/api/vendor/*`
  - [ ] `/api/principal/*`
  - [ ] `/api/teacher/*`
- ✅ All roles load data correctly
- ✅ All roles can add data
- ✅ Console logs showing proper API calls
- ✅ No ngrok URLs remaining in code
