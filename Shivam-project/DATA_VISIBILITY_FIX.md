# Data Visibility Fix - Principal & Teacher Dashboards

## Problem Identified ✅ FIXED

**Root Cause:** Outdated ngrok URL in principal_screens.dart
- ❌ OLD: `'https://unopposable-solidly-elfriede.ngrok-free.dev'`
- ✅ NEW: `'http://72.62.241.170:5000'`

ngrok URLs are temporary and expire/change frequently. This was causing all API calls in Principal role to fail silently.

---

## What Was Fixed

### 1. Backend URL Configuration
**File:** `principal_screens.dart` (line 858)

```dart
// BEFORE (BROKEN):
const String _kPrincipalBase = 'https://unopposable-solidly-elfriede.ngrok-free.dev';

// AFTER (FIXED):
const String _kPrincipalBase = 'http://72.62.241.170:5000';
```

### 2. Dio Configuration
**File:** `principal_screens.dart` (line 861)

```dart
// BEFORE:
headers: {'ngrok-skip-browser-warning': 'true'},

// AFTER:
validateStatus: (status) => status != null && status < 500,
// This ensures we can check actual HTTP status codes
```

### 3. Data Loading with Comprehensive Logging
**File:** `principal_screens.dart` - `loadAll()` method (line 898)

Added:
- ✅ URL verification log at start
- ✅ Response status checking for each endpoint
- ✅ Data count logs (classes, teachers, students, staff)
- ✅ Parse errors handled with null-safety checks
- ✅ Success/error logs with stack traces
- ✅ Called at startup via WidgetsBinding

### 4. API Methods with Error Handling
Updated all CRUD methods:
- ✅ `addClass()` - with status code checking
- ✅ `addTeacher()` - with detailed logging
- ✅ `addStudent()` - with error details
- ✅ `addStaff()` - with response validation

**Example:**
```dart
Future<void> addClass(String name) async {
  // ... add to local state first for instant UI update
  try {
    final res = await _principalDio().post(
      '$_kPrincipalBase/api/principal/classes',
      data: {'name': name, 'principalId': _kPrincipalId},
    );
    if (res.statusCode == 201 || res.statusCode == 200) {
      entry.id = res.data['id'].toString();
      debugPrint('[Principal] addClass() - Success! ID: ${entry.id}');
    } else {
      debugPrint('[Principal] addClass() - Failed with status ${res.statusCode}');
      _classes.remove(entry); // Rollback on failure
    }
  } catch (e, st) {
    _classes.remove(entry); // Rollback on exception
    debugPrint('[Principal] addClass() ERROR: $e\n$st');
  }
  notifyListeners();
}
```

---

## How Data Flows Now (FIXED)

```
Principal adds class/teacher/student
       ↓
Immediately added to local state (_classes, _teachers, etc)
       ↓
UI updates instantly via ListenableBuilder
       ↓
Backend API call initiated (non-blocking)
       ↓
✅ SUCCESS: Entry ID updated in state
❌ FAILURE: Entry rolled back from list, removed from UI
       ↓
notifyListeners() called to refresh UI
```

---

## Verification Checklist

### 1. Backend is Running
```bash
# Ensure backend is running on port 5000
cd backend
npm start
# Should see: "MongoDB Connected" + "Server running on port 5000"
```

### 2. URL is Correct
- ✅ Principal URL: `http://72.62.241.170:5000` (NOT ngrok)
- ✅ Matches vendor_screens configuration
- ✅ Backend must be accessible at this IP/port

### 3. Test Principal Dashboard
1. Open Flutter app → Principal role
2. **Add a Class:**
   - Click "Add Class"
   - Enter "Grade 10 – Section A"
   - Click Save
   - ✅ Class should appear immediately in the list
   - ✅ Check backend: `mongodb > edumid_db > schoolclasses`

3. **Add a Teacher:**
   - Click "Add Teacher"
   - Enter: Name = "John Doe", Subject = "Math", Phone = "9876543210"
   - Click Save
   - ✅ Teacher should appear in list instantly
   - ✅ Check backend: `mongodb > edumid_db > schoolmembers` (type: "teacher")

4. **Add a Student:**
   - Click "Add Student"
   - Enter: Name = "Jane Smith", Class = "Grade 10", Phone = "8765432109"
   - Click Save
   - ✅ Student should appear in list instantly

### 4. Check Console Logs
Open Flutter DevTools console and look for:
```
[Principal] loadAll() starting... URL: http://72.62.241.170:5000
[Principal] loadAll() - URL correct
[Principal] Loaded 5 classes
[Principal] Loaded 10 teachers
[Principal] Loaded 8 students
[Principal] Loaded 3 staff
[Principal] loadAll() completed successfully!
```

### 5. Check for Errors
If you see errors like:
```
[Principal] loadAll() ERROR: Connection refused
```
✅ **Fix:** Backend is not running on that IP/port

If you see:
```
[Principal] addClass() - Failed with status 400
```
✅ **Fix:** Check MongoDB is running and accessible

---

## Debug Logs Added

All methods now log:
- 🔍 When operation starts: `[Principal] {method}() - Adding: {data}`
- ✅ Success with ID: `[Principal] {method}() - Success! ID: {id}`
- ❌ Failures with status: `[Principal] {method}() - Failed with status {code}`
- 🐛 Errors with stack trace: `[Principal] {method}() ERROR: {error}\n{stacktrace}`

---

## What Happens on Reload

When the app starts:
1. `SchoolDataStore` singleton is created
2. `WidgetsBinding.addPostFrameCallback()` triggers `loadAll()`
3. Data is fetched from `http://72.62.241.170:5000/api/principal/*`
4. All `ListenableBuilder` widgets refresh
5. UI displays fetched data

---

## Teacher Dashboard

Teacher role is already using correct URL:
- ✅ `_kSchoolBase = 'http://72.62.241.170:5000'`
- ✅ No changes needed for teachers

---

## Files Modified

| File | Changes |
|------|---------|
| `principal_screens.dart` | URL updated, error logging added to all methods |
| `teacher_screens.dart` | No changes (already correct) |

---

## Expected Results

### Before Fix ❌
```
Add Class → No data appears → Check logs → API errors silently ignored
```

### After Fix ✅
```
Add Class → Data appears instantly → Check logs:
  "[Principal] addClass() - Adding class: Grade 10 – Section A"
  "[Principal] addClass() - Success! ID: 507f1f77bcf86..."
  → Stored in MongoDB
  → Appears in Principal dashboard
```

---

## Production Deployment

Before deploying, ensure:
1. ✅ Backend server is deployed to `http://72.62.241.170:5000`
2. ✅ All API endpoints `/api/principal/*` are working
3. ✅ MongoDB is accessible from backend
4. ✅ Principal ID `'principal_001'` is registered in backend
5. ✅ All debug logs are appropriate for production

Remove or suppress debug logs for production if needed.
