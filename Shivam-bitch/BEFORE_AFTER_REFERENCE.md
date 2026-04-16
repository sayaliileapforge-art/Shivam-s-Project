# Before & After - API Configuration Fix

## The Problem (BEFORE) ❌

### Vendor Screens
```dart
// vendor_screens.dart
const String _kServerBase = 'http://72.62.241.170:5000';  // ✅ Correct
```

### Principal Screens  
```dart
// principal_screens.dart
const String _kPrincipalBase = 'https://unopposable-solidly-elfriede.ngrok-free.dev';  // ❌ BROKEN (expired ngrok)
```

### Teacher Screens
```dart
// teacher_screens.dart
const String _kSchoolBase = 'http://72.62.241.170:5000';  // ✅ Correct
```

**Problem:** Multiple URLs, one was broken, inconsistent configuration across roles

---

## The Solution (AFTER) ✅

### Create Centralized ApiConfig
```dart
// lib/core/api/api_config.dart
class ApiConfig {
  static const String baseUrl = 'http://72.62.241.170:5000';
  
  // Pre-defined endpoints for easy use
  static const String vendorClients = '$baseUrl/api/vendor/clients';
  static const String principalClasses = '$baseUrl/api/principal/classes';
  static const String teacherClasses = '$baseUrl/api/teacher/classes';
  
  static const int connectionTimeout = 15;
  static const int receiveTimeout = 15;
}
```

### Vendor Screens (AFTER)
```dart
// vendor_screens.dart
import '../../../core/api/api_config.dart';

const String _kServerBase = ApiConfig.baseUrl;  // ✅ Now uses central config
```

### Principal Screens (AFTER)
```dart
// principal_screens.dart
import '../../../core/api/api_config.dart';

const String _kPrincipalBase = ApiConfig.baseUrl;  // ✅ Now uses central config
```

### Teacher Screens (AFTER)
```dart
// teacher_screens.dart
import '../../../core/api/api_config.dart';

const String _kSchoolBase = ApiConfig.baseUrl;  // ✅ Now uses central config
```

**Solution:** Single source of truth for all backend configuration

---

## API Call Examples

### BEFORE: Hardcoded URLs
```dart
// Vendor - vendor_screens.dart
final response = await _dio().get(
  '$_kServerBase/api/vendor/clients',  // Hardcoded endpoint
);

// Principal - principal_screens.dart
final response = await _principalDio().get(
  '$_kPrincipalBase/api/principal/classes',  // Different config
);

// Teacher - teacher_screens.dart
final response = await _schoolDio().get(
  '$_kSchoolBase/api/teacher/classes',  // Another config
);
```

### AFTER: Centralized Configuration
```dart
// All modules - consistent usage
final response = await dio.get(
  ApiConfig.vendorClients,        // Pre-defined endpoint
);

final response = await dio.get(
  ApiConfig.principalClasses,     // Pre-defined endpoint
);

final response = await dio.get(
  ApiConfig.teacherClasses,       // Pre-defined endpoint
);
```

---

## Endpoint Management

### BEFORE: Scattered Across Code
```dart
// vendor_screens.dart
'$_kServerBase/api/vendor/clients'
'$_kServerBase/api/vendor/orders'
'$_kServerBase/api/vendor/dashboard'

// principal_screens.dart
'$_kPrincipalBase/api/principal/classes'
'$_kPrincipalBase/api/principal/members'

// teacher_screens.dart
'$_kSchoolBase/api/teacher/classes'
'$_kSchoolBase/api/teacher/attendance'
```

### AFTER: Centralized Definition
```dart
// lib/core/api/api_config.dart
class ApiConfig {
  // Vendor
  static const String vendorClients = '$baseUrl/api/vendor/clients';
  static const String vendorOrders = '$baseUrl/api/vendor/orders';
  static const String vendorDashboard = '$baseUrl/api/vendor/dashboard';
  
  // Principal
  static const String principalClasses = '$baseUrl/api/principal/classes';
  static const String principalMembers = '$baseUrl/api/principal/members';
  
  // Teacher
  static const String teacherClasses = '$baseUrl/api/teacher/classes';
  static const String teacherAttendance = '$baseUrl/api/teacher/attendance';
}
```

---

## Adding New Endpoints

### BEFORE: Update Multiple Places
```dart
// In vendor_screens.dart
const String newEndpoint = '$_kServerBase/api/vendor/new-endpoint';

// In principal_screens.dart
const String newEndpoint = '$_kPrincipalBase/api/principal/new-endpoint';

// In every file using it...
```

### AFTER: Add Once
```dart
// In lib/core/api/api_config.dart
static const String vendorNewEndpoint = '$baseUrl/api/vendor/new-endpoint';

// Use everywhere:
final response = await dio.get(ApiConfig.vendorNewEndpoint);
```

---

## Environment Configuration

### BEFORE: Manual Changes
```dart
// To move from dev to production:
// 1. Find _kServerBase in vendor_screens.dart
// 2. Find _kPrincipalBase in principal_screens.dart
// 3. Find _kSchoolBase in teacher_screens.dart
// 4. Change all three (risky, easy to miss one)

// Dev:
const String _kServerBase = 'http://localhost:5000';
const String _kPrincipalBase = 'http://localhost:5000';
const String _kSchoolBase = 'http://localhost:5000';

// Prod:
const String _kServerBase = 'http://72.62.241.170:5000';
const String _kPrincipalBase = 'http://72.62.241.170:5000';
const String _kSchoolBase = 'http://72.62.241.170:5000';
```

### AFTER: Single Update
```dart
// In lib/core/api/api_config.dart

// Dev:
static const String baseUrl = 'http://localhost:5000';

// Prod (just change one line):
static const String baseUrl = 'http://72.62.241.170:5000';
```

---

## Error Handling

### BEFORE: Different Error Logs
```dart
// vendor_screens.dart
debugPrint('[vendor] loadAll error: $e');

// principal_screens.dart
debugPrint('[principal] loadAll error: $e');

// teacher_screens.dart
debugPrint('[school] loadAll error: $e');
```

### AFTER: Consistent with Debug Helper
```dart
// lib/core/api/api_config.dart
static void debugPrint() {
  print('╔════════════════════════════════════════╗');
  print('║   API Configuration                    ║');
  print('╚════════════════════════════════════════╝');
  print('Base URL:         $baseUrl');
  print('Vendor Clients:   $vendorClients');
  print('Principal Classes: $principalClasses');
  print('Teacher Classes:  $teacherClasses');
}

// main.dart
void main() {
  ApiConfig.debugPrint();
  runApp(const MyApp());
}
```

---

## Import Management

### BEFORE: Undefined Local Constants
```dart
// No centralized imports, each file has own constants
// Easy to miss updates
// Hard to find where endpoint is defined
```

### AFTER: Centralized Imports
```dart
// vendor_screens.dart
import '../../../core/api/api_config.dart';

// principal_screens.dart
import '../../../core/api/api_config.dart';

// teacher_screens.dart
import '../../../core/api/api_config.dart';

// Uses clear, discoverable constants:
ApiConfig.baseUrl
ApiConfig.vendorClients
ApiConfig.principalClasses
```

---

## Helper Methods

### AFTER: Utility Functions
```dart
// Build URLs with query parameters
static String endpoint(
  String path, {
  Map<String, String>? queryParams,
}) {
  String url = '$baseUrl$path';
  if (queryParams != null && queryParams.isNotEmpty) {
    final query = queryParams.entries
        .map((e) => '${e.key}=${Uri.encodeComponent(e.value)}')
        .join('&');
    url += '?$query';
  }
  return url;
}

// Usage:
final url = ApiConfig.endpoint(
  '/api/vendor/clients',
  queryParams: {'vendorId': 'vendor_001'},
);
// Result: http://72.62.241.170:5000/api/vendor/clients?vendorId=vendor_001
```

---

## Benefits Summary

| Aspect | BEFORE | AFTER |
|--------|--------|-------|
| **URL Consistency** | ❌ 3 different URLs | ✅ Single source |
| **Maintenance** | ❌ Update 3 places | ✅ Update 1 place |
| **Endpoints** | ❌ Hardcoded strings | ✅ Type-safe constants |
| **Error Prone** | ❌ Easy to miss URLs | ✅ Impossible to miss |
| **Scalability** | ❌ Hard to add endpoints | ✅ Easy to add |
| **Environment** | ❌ Manual changes | ✅ One-line change |
| **Debugging** | ❌ Search multiple files | ✅ Check one file |
| **Testing** | ❌ Complex mocking | ✅ Simple override |

---

## Files Modified

```
BEFORE:
├── lib/
│   ├── features/vendor/screens/
│   │   └── vendor_screens.dart        (has old URL)
│   ├── features/principal/screens/
│   │   └── principal_screens.dart     (has BROKEN ngrok URL)
│   └── features/teacher/screens/
│       └── teacher_screens.dart       (has old URL)

AFTER:
├── lib/
│   ├── core/api/
│   │   └── api_config.dart            (NEW - central config)
│   ├── features/vendor/screens/
│   │   └── vendor_screens.dart        (uses ApiConfig)
│   ├── features/principal/screens/
│   │   └── principal_screens.dart     (uses ApiConfig - FIXED)
│   └── features/teacher/screens/
│       └── teacher_screens.dart       (uses ApiConfig)
```

---

## Migration Checklist

- ✅ Create `lib/core/api/api_config.dart`
- ✅ Add import to vendor_screens.dart
- ✅ Add import to principal_screens.dart
- ✅ Add import to teacher_screens.dart
- ✅ Replace local URLs with `ApiConfig.baseUrl`
- ✅ Test all three roles
- ✅ Verify no hardcoded URLs remain
- ✅ Add `ApiConfig.debugPrint()` to main.dart
- ✅ Test with actual backend

All done! 🎉
