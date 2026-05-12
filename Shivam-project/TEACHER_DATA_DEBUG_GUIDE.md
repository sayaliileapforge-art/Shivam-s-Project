# Teacher Module Data Fetching - Debugging Guide

## Changes Made ✅

### 1. Enhanced Logging in `teacher_screens.dart`
Added comprehensive debug output to `_TeacherDataStore.loadAll()`:
- URL construction before calling API
- Full URLs for each endpoint (for manual testing)
- Response type and raw data inspection
- Parsed data for each category (classes, teachers, students, staff)
- Success/failure indicators

### 2. Enhanced Logging in `principal_screens.dart`
Added same comprehensive logging to Principal module for comparison

---

## Running the Diagnosis

### Step 1: Run Flutter App
```bash
cd edumid
flutter run
```

### Step 2: Look for Log Output
Open the console/terminal and filter for:
```
[TeacherDataStore]
[Principal]
```

---

## Expected Log Output (Working State)

### Success Case ✅
```
════════════════════════════════════════════════════════════════
[TeacherDataStore] Starting loadAll()...
Base URL: http://72.62.241.170:5000
Principal ID: principal_001
════════════════════════════════════════════════════════════════
[Classes URL] http://72.62.241.170:5000/api/principal/classes?principalId=principal_001
[Teachers URL] http://72.62.241.170:5000/api/principal/members?principalId=principal_001&type=teacher
[Students URL] http://72.62.241.170:5000/api/principal/members?principalId=principal_001&type=student
[Staff URL] http://72.62.241.170:5000/api/principal/members?principalId=principal_001&type=staff
[Classes Response] Status: 200
[Classes Raw] Type: List<dynamic>, Value: [{'id': '...', 'name': 'Class A'}, ...]
[Classes Parsed] Count: 2, Data: [{'id': '...', 'name': 'Class A'}, ...]
[Teachers Response] Status: 200
[Teachers Raw] Type: List<dynamic>, Value: [{'id': '...', 'name': 'John'}, ...]
[Teachers Parsed] Count: 3
[Students Response] Status: 200
[Students Raw] Type: List<dynamic>, Value: [{'id': '...', 'name': 'Student A'}, ...]
[Students Parsed] Count: 15
[Staff Response] Status: 200
[Staff Raw] Type: List<dynamic>, Value: [...]
[Staff Parsed] Count: 2
════════════════════════════════════════════════════════════════
[TeacherDataStore] ✅ loadAll() completed successfully
════════════════════════════════════════════════════════════════
```

---

## Troubleshooting by Error Type

### ❌ Issue 1: URL Not Matching Backend

**Log Output:**
```
[Classes URL] http://72.62.241.170:5000/api/teacher/classes?...
```

**Problem**: Using wrong endpoint (old teacher routes that don't exist)

**Fix**: 
- Verify ApiConfig.dart has been updated to point to `/api/principal/*` endpoints
- Restart flutter app

---

### ❌ Issue 2: 404 Error (Route Not Found)

**Log Output:**
```
[Classes Response] Status: 404
[Classes Raw] Type: String, Value: {"error": "Route not found."}
```

**Problem**: Endpoint doesn't exist in backend

**Fix**:
```dart
// Check that these are correct:
ApiConfig.teacherClasses = '$baseUrl/api/principal/classes'  // ✅
ApiConfig.teacherAttendance = '$baseUrl/api/principal/members'  // ✅
```

---

### ❌ Issue 3: Missing Query Parameters

**Log Output:**
```
[Classes URL] http://72.62.241.170:5000/api/principal/classes
// No ?principalId=...
```

**Problem**: Backend requires `principalId` but it's not being sent

**Backend Check**:
```javascript
exports.getClasses = async (req, res) => {
  const { principalId } = req.query;
  if (!principalId) return res.status(400).json({ error: 'principalId required' });
  // ...
};
```

**Fix**: Ensure `queryParameters: {'principalId': _kSchoolPrincipalId}` is being passed

---

### ❌ Issue 4: Empty Response

**Log Output:**
```
[Classes Parsed] Count: 0, Data: []
```

**Problem**: Backend returned empty array (no data in database)

**Check**:
1. Backend has data for `principalId=principal_001`
2. Run backend seed script if needed:
   ```bash
   cd backend
   node seed.js
   ```

**Verify in Browser**:
```
http://72.62.241.170:5000/api/principal/classes?principalId=principal_001
```

Should return JSON like:
```json
[
  { "id": "123...", "name": "Class A" },
  { "id": "456...", "name": "Class B" }
]
```

---

### ❌ Issue 5: Connection Error

**Log Output:**
```
[TeacherDataStore] ❌ Load error: Connection refused / timeout
════════════════════════════════════════════════════════════════
```

**Problem**: Cannot reach backend server

**Fix**:
1. Verify backend is running:
   ```bash
   cd backend
   npm start
   ```

2. Verify correct URL:
   ```bash
   curl http://72.62.241.170:5000/
   # Should return: {"message": "Edumid API is running."}
   ```

3. Check network connectivity:
   ```bash
   ping 72.62.241.170
   ```

---

### ❌ Issue 6: Data Not Showing in UI

**Log Output**: ✅ All logs show data loaded successfully
**UI Result**: ❌ No data displayed

**Problem**: Data loaded but not bound to UI

**Check UI Code**:
```dart
// teacher_screens.dart line 2050
List<String> get _classes {
  final names = _store.classes
      .map((c) => (c['name'] ?? '').toString())
      .where((n) => n.isNotEmpty)
      .toList();
  return names;
}
```

**Fix**: Ensure `_store.classes` matches the response format

---

## Backend Data Structure

### For `/api/principal/classes` (GET)

**Query Parameters:**
- `principalId` (required) - string

**Response:**
```json
[
  { "id": "507f1f77bcf86cd799439011", "name": "Class A" },
  { "id": "507f1f77bcf86cd799439012", "name": "Class B" }
]
```

---

### For `/api/principal/members` (GET)

**Query Parameters:**
- `principalId` (required) - string
- `type` (optional) - "teacher" | "student" | "staff"

**Response:**
```json
[
  {
    "id": "507f1f77bcf86cd799439013",
    "name": "John Doe",
    "classOrDept": "Class A",
    "phone": "9876543210",
    "address": "Main Street"
  }
]
```

---

## Data Binding Checklist

- ✅ API returns array directly (not wrapped in `{ data: [...] }`)
- ✅ Teacher module parses via: `List<Map<String, dynamic>>.from(response.data)`
- ✅ Principal module parses via: `List<Map<String, dynamic>>.from(response.data)`
- ✅ Both modules have `?? []` fallback for null responses
- ✅ UI binds to `_store.classes`, `_store.students`, etc.
- ✅ `notifyListeners()` called after data load
- ✅ UI uses `ListenableBuilder` or `ChangeNotifier` for reactivity

---

## Manual API Testing

### Test 1: Classes Endpoint
```bash
curl "http://72.62.241.170:5000/api/principal/classes?principalId=principal_001"
```

Expected: `[{"id":"...", "name":"Class A"}, ...]`

---

### Test 2: Teachers for Principal
```bash
curl "http://72.62.241.170:5000/api/principal/members?principalId=principal_001&type=teacher"
```

Expected: `[{"id":"...", "name":"John", "classOrDept":"Class A", ...}, ...]`

---

### Test 3: Students for Principal
```bash
curl "http://72.62.241.170:5000/api/principal/members?principalId=principal_001&type=student"
```

Expected: `[{"id":"...", "name":"Student A", "classOrDept":"Class A", ...}, ...]`

---

## Debug Checklist

- [ ] App runs without crashes
- [ ] Console shows `[TeacherDataStore] Starting loadAll()...`
- [ ] URLs are correct (print to verify)
- [ ] Response status is 200 (not 404 or 500)
- [ ] Response data is Array (not wrapped object)
- [ ] Parsed count > 0 (not empty)
- [ ] Shows `✅ loadAll() completed successfully`
- [ ] UI updates with data
- [ ] Principal module also shows same data (for comparison)

---

## If Still Not Working

Do these tests in order:

1. **Verify Backend is Running**
   ```bash
   cd backend
   npm start
   # Watch for: "MongoDB Connected" and "Server running on port 5000"
   ```

2. **Test Backend Directly**
   ```bash
   curl http://72.62.241.170:5000/
   # Should return: {"message": "Edumid API is running."}
   ```

3. **Seed Database**
   ```bash
   cd backend
   node seed.js
   # Should populate test data
   ```

4. **Run Flutter with Logging**
   ```bash
   flutter run -v  # Verbose output
   ```

5. **Check Console for [TeacherDataStore] Logs**
   - Filter output for `[TeacherDataStore]` or `[Principal]`
   - Look for status codes and response content

6. **Compare With Principal Module**
   - Switch to Principal role
   - Check if it shows data
   - If yes → Teacher endpoint mapping issue
   - If no → Backend/database issue

---

## Key Files Modified

1. **`lib/features/teacher/screens/teacher_screens.dart`**
   - Enhanced `_TeacherDataStore.loadAll()` with detailed logging
   - Line 55-115 (approximately)

2. **`lib/features/principal/screens/principal_screens.dart`**
   - Enhanced `PrincipalStore.loadAll()` with detailed logging
   - Better error handling and status tracking
   - Line 900-980 (approximately)

3. **`lib/core/api/api_config.dart`**
   - Teacher endpoints now map to Principal routes:
     - `teacherClasses` → `/api/principal/classes`
     - `teacherAttendance` → `/api/principal/members`
     - `teacherDashboard` → `/api/principal/classes`

---

## Expected Behavior After Fix

### Vendor Module ✅
- Dashboard shows vendor-specific data
- Can add/manage clients and orders

### Principal Module ✅
- Dashboard shows classes and staff counts
- Can add classes, teachers, students, staff
- Data persists in database

### Teacher Module ✅
- Dashboard shows classes and student count
- Shows attendance statistics
- Can view students by class (using read-only Principal endpoints)
- Shares same data as Principal (correct!)

---

## Success Criteria

✅ All three roles display data from same backend
✅ Console shows correct URLs and 200 status codes
✅ Data count > 0 in logs
✅ UI updates with fetched data
✅ No crashes or errors
✅ Teacher uses Principal endpoints (not non-existent /api/teacher/*)
