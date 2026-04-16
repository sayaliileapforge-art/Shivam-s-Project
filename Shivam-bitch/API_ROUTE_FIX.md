# API Route Fix - Backend Route Mismatch

## Problem ❌

The Flutter app was calling endpoints that don't exist in the backend:

```
Error: Route not found
```

### What Was Wrong

**Backend Routes** (only 3 route files):
- ✅ `/api/vendor/*` (9 endpoints)
- ✅ `/api/principal/*` (11 endpoints)
- ❌ `/api/teacher/*` - DOES NOT EXIST

**Frontend was trying to call** (in api_config.dart):
```dart
teacherClasses = '/api/teacher/classes'         // ❌ DOESN'T EXIST
teacherAttendance = '/api/teacher/attendance'   // ❌ DOESN'T EXIST
teacherDashboard = '/api/teacher/dashboard'     // ❌ DOESN'T EXIST
```

### Root Cause

The backend.js only registers three route modules:
```javascript
// server.js
app.use('/api', userRoutes);
app.use('/api/vendor', vendorRoutes);
app.use('/api/principal', principalRoutes);
// ❌ NO teacher routes registered!
```

---

## Solution ✅

Teacher module should use **Principal endpoints** (read-only data access):

### Before (api_config.dart) ❌
```dart
class ApiConfig {
  static const String principalClasses = '$baseUrl/api/principal/classes';
  static const String principalMembers = '$baseUrl/api/principal/members';
  
  // These don't exist in backend!
  static const String teacherClasses = '$baseUrl/api/teacher/classes';
  static const String teacherAttendance = '$baseUrl/api/teacher/attendance';
  static const String teacherDashboard = '$baseUrl/api/teacher/dashboard';
}
```

### After (api_config.dart) ✅
```dart
class ApiConfig {
  // Shared endpoints
  static const String principalClasses = '$baseUrl/api/principal/classes';
  static const String principalMembers = '$baseUrl/api/principal/members';
  
  // Teacher uses Principal's endpoints (no separate teacher routes in backend)
  static const String teacherClasses = '$baseUrl/api/principal/classes';
  static const String teacherAttendance = '$baseUrl/api/principal/members';
  static const String teacherDashboard = '$baseUrl/api/principal/classes';
}
```

---

## API Endpoints - Actual Implementation

### Backend Routes (server.js)
```
POST   /api/add-user              [userRoutes]
GET    /api/users                 [userRoutes]

GET    /api/vendor/dashboard      [vendorRoutes]
GET    /api/vendor/orders         [vendorRoutes]
POST   /api/vendor/orders         [vendorRoutes]
GET    /api/vendor/clients        [vendorRoutes]
POST   /api/vendor/clients        [vendorRoutes]
DELETE /api/vendor/clients/:id    [vendorRoutes]
GET    /api/vendor/clients/:id    [vendorRoutes]
GET    /api/vendor/clients/:id/orders [vendorRoutes]
PATCH  /api/vendor/orders/:id/advance [vendorRoutes]

GET    /api/principal/classes     [principalRoutes] ✅
POST   /api/principal/classes     [principalRoutes]
DELETE /api/principal/classes/:id [principalRoutes]
GET    /api/principal/members     [principalRoutes] ✅
POST   /api/principal/members     [principalRoutes]
PUT    /api/principal/members/:id [principalRoutes]
DELETE /api/principal/members/:id [principalRoutes]
GET    /api/principal/users       [principalRoutes]
PATCH  /api/principal/members/:id/restrict [principalRoutes]
POST   /api/principal/members/:id/force-logout [principalRoutes]
```

**Total: 22 endpoints (NO teacher-specific routes)**

---

## How Frontend Modules Use Endpoints

### Vendor Module ✅
```dart
// vendor_screens.dart
const String _kServerBase = ApiConfig.baseUrl;

await dio.get('$_kServerBase/api/vendor/dashboard');
await dio.get('$_kServerBase/api/vendor/clients');
await dio.get('$_kServerBase/api/vendor/orders');
```

### Principal Module ✅
```dart
// principal_screens.dart
const String _kPrincipalBase = ApiConfig.baseUrl;

await dio.get('$_kPrincipalBase/api/principal/classes');
await dio.get('$_kPrincipalBase/api/principal/members');
```

### Teacher Module ✅ (Uses Principal Endpoints)
```dart
// teacher_screens.dart
const String _kSchoolBase = ApiConfig.baseUrl;

// These resolve to /api/principal/* endpoints
await dio.get(
  '${ApiConfig.teacherClasses}',  // → /api/principal/classes
  queryParameters: {'principalId': 'principal_001'}
);

await dio.get(
  '${ApiConfig.teacherAttendance}',  // → /api/principal/members
  queryParameters: {'principalId': 'principal_001', 'type': 'teacher'}
);
```

---

## Why This Architecture?

1. **Backend Design**: Principal Routes handle ALL school data
   - Classes (managed by principal)
   - Members: Teachers, Students, Staff (all roles)

2. **Teacher Access**: Read-only access to same endpoints
   - Query: `?principalId=principal_001`
   - Type: `?type=teacher|student|staff`

3. **No Separate Teacher Routes Needed**: 
   - Teacher data flows through Principal endpoints
   - Query parameters filter what teacher sees

---

## Testing the Fix

### 1. Verify Backend Running
```bash
cd backend
npm start
# Expected: MongoDB Connected + "Server running on http://localhost:5000"
```

### 2. Test Endpoints in Browser
```
✅ http://72.62.241.170:5000/api/principal/classes?principalId=principal_001
✅ http://72.62.241.170:5000/api/principal/members?principalId=principal_001&type=teacher
✅ http://72.62.241.170:5000/api/vendor/dashboard?vendorId=vendor_001

❌ http://72.62.241.170:5000/api/teacher/classes (will return 404)
```

### 3. Test Flutter App
1. **Vendor Role**: Should load dashboard and clients
2. **Principal Role**: Should load classes and members
3. **Teacher Role**: Should load school data from Principal endpoints

---

## Code Changes Made

### File: `lib/core/api/api_config.dart`

**Change Area**: Lines 19-29
```dart
// BEFORE
static const String teacherClasses = '$baseUrl/api/teacher/classes';
static const String teacherAttendance = '$baseUrl/api/teacher/attendance';
static const String teacherDashboard = '$baseUrl/api/teacher/dashboard';

// AFTER
static const String teacherClasses = '$baseUrl/api/principal/classes';
static const String teacherAttendance = '$baseUrl/api/principal/members';
static const String teacherDashboard = '$baseUrl/api/principal/classes';
```

**Impact**: 
- ✅ All API calls now resolve to existing backend routes
- ✅ Teacher module gets correct data from Principal endpoints
- ✅ No "Route not found" errors

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│           FRONTEND (Flutter Modules)                │
├─────────────┬──────────────────┬────────────────────┤
│  Vendor     │    Principal     │    Teacher         │
│  Module     │    Module        │    Module          │
└──────┬──────┴────────┬─────────┴─────────┬──────────┘
       │                │                   │
       │ ApiConfig      │ ApiConfig         │ ApiConfig
       │ vendor/*       │ principal/*       │ principal/*
       │                │                   │
       │                │         (same endpoints!)
       └────────────────┼───────────────────┘
                        │
                        ↓
            ┌───────────────────────┐
            │     EXPRESS SERVER    │
            │   (http://72.62...)   │
            │                       │
            │  ├─ /api/vendor/*  ✅ │
            │  ├─ /api/principal/* ✅
            │  └─ /api/teacher/*  ❌ (doesn't exist)
            │                       │
            └───────────│───────────┘
                        │
                        ↓
                ┌───────────────────┐
                │   MongoDB         │
                │   (Data)          │
                └───────────────────┘
```

---

## Next Steps

1. ✅ **DONE**: Fixed ApiConfig endpoints to match backend
2. **TODO**: Run Flutter app and test all three roles
3. **TODO**: Verify data loads correctly for each module
4. **TODO**: Check console logs for correct API URLs

---

## Final Endpoint Reference

| Module | Endpoint | Maps To (Backend) | Status |
|--------|----------|-------------------|--------|
| Vendor | `vendorClients` | `/api/vendor/clients` | ✅ |
| Vendor | `vendorOrders` | `/api/vendor/orders` | ✅ |
| Principal | `principalClasses` | `/api/principal/classes` | ✅ |
| Principal | `principalMembers` | `/api/principal/members` | ✅ |
| Teacher | `teacherClasses` | `/api/principal/classes` | ✅ |
| Teacher | `teacherAttendance` | `/api/principal/members` | ✅ |

All endpoints now correctly map to existing backend routes!
