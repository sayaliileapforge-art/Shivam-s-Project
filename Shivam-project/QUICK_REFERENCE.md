# EduMid - Quick Reference Summary

## 🚨 3 CRITICAL ISSUES TO FIX IMMEDIATELY

### Issue 1: Wrong Backend URL for Principal & Teacher
**Location**: [principal_screens.dart:857](edumid/lib/features/principal/screens/principal_screens.dart#L857)
```dart
❌ CURRENT: const String _kPrincipalBase = 'https://unopposable-solidly-elfriede.ngrok-free.dev';
✅ SHOULD BE: const String _kPrincipalBase = 'http://72.62.241.170:5000';
```
**Impact**: ALL principal/teacher API calls fail instantly

### Issue 2: No Authentication System
- Backend: No `/api/auth/login` endpoint
- Frontend: Mock login (accepts anything)
- Database: No password/tokens stored
- **Impact**: Anyone can be any user without credentials

### Issue 3: Student Data 100% Mocked
- No backend API calls
- Hard-coded student: "Arjun Sharma", Class X-A, Roll 23
- Corrections & Reprint using local repositories
- **Impact**: No real student data can be displayed

---

## ✅ WHAT'S WORKING

| Feature | Status | Screens | Endpoints |
|---------|--------|---------|-----------|
| **Vendor** | ✅ Fully Integrated | 12 screens | 9 endpoints `/api/vendor/*` |
| **Principal/Teacher** | ⚠️ Wrong URL | 24 screens | 11 endpoints `/api/principal/*` |
| **Student** | ❌ Mocked | 15 screens | 0 endpoints |
| **Auth** | ❌ No Backend | 6 screens | 0 endpoints |
| **Notifications** | ❌ Mocked | 3 screens | 0 endpoints |
| **Settings** | ❌ Mocked | 5+ screens | 0 endpoints |

---

## 📊 API Endpoints Summary

### Vendor Routes (9 endpoints) ✅
```
GET    /api/vendor/dashboard?vendorId=X      [Used in VendorDashboardScreen]
GET    /api/vendor/clients?vendorId=X        [Used in ClientListScreen]
POST   /api/vendor/clients                   [Used in AddClientScreen]
DELETE /api/vendor/clients/:id               [Used in ClientListScreen]
GET    /api/vendor/clients/:id               [Used in ClientDetailsScreen]
GET    /api/vendor/clients/:id/orders        [Used in ClientDetailsScreen]
GET    /api/vendor/orders?vendorId=X         [Used in ProjectBoardScreen]
POST   /api/vendor/orders                    [Used in CreateOrderScreen]
PATCH  /api/vendor/orders/:id/advance        [Used in WorkflowStageDetailScreen]
```

### Principal Routes (11 endpoints) ⚠️
```
GET    /api/principal/classes?principalId=X           [Teacher/Principal use - WRONG URL]
POST   /api/principal/classes                         [Not called from frontend]
DELETE /api/principal/classes/:id                     [Not called from frontend]
GET    /api/principal/members?principalId=X&type=Y   [Teacher/Principal use - WRONG URL]
POST   /api/principal/members                         [Not called from frontend]
PUT    /api/principal/members/:id                     [Not called from frontend]
DELETE /api/principal/members/:id                     [Not called from frontend]
GET    /api/principal/users?principalId=X             [Not called from frontend]
PATCH  /api/principal/members/:id/restrict            [Not called from frontend]
POST   /api/principal/members/:id/force-logout        [Not called from frontend]
```

### User Routes (2 endpoints) ❌ NOT USED AT ALL
```
POST   /api/add-user       [Not called from frontend]
GET    /api/users          [Not called from frontend]
```

---

## 📦 Database Models

### **Client** (for vendors)
```
{
  schoolName (required),
  vendorId (required, indexed),
  address, city, contactName, phone, email
}
```

### **Order** (for vendors)
```
{
  title (required), schoolName (required),
  stage (Draft → DataUpload → Design → Proof → Printing → Dispatch → Delivered),
  progress (0-100), totalCards, completedCards,
  vendorId (required, indexed),
  clientId (optional, ref: Client, indexed),
  deliveryDate, productType
}
```

### **SchoolClass** (for principal)
```
{
  name (required),
  principalId (required) ⚠️ NOT INDEXED - inefficient queries
}
```

### **SchoolMember** (for principal)
```
{
  type (teacher|student|staff, required),
  name (required),
  principalId (required) ⚠️ NOT INDEXED - inefficient queries,
  classOrDept, phone, address, isRestricted
}
```

### **User** (unused)
```
{
  name (required),
  email (required, unique, indexed)
} ⚠️ NEVER CALLED - No login/auth implemented
```

---

## 🔗 API Call Locations (Frontend)

### Vendor Module (WORKING) ✅
- [vendor_screens.dart:80](edumid/lib/features/vendor/screens/vendor_screens.dart#L80) - Dashboard
- [vendor_screens.dart:729](edumid/lib/features/vendor/screens/vendor_screens.dart#L729) - Create client
- [vendor_screens.dart:1090-1091](edumid/lib/features/vendor/screens/vendor_screens.dart#L1090) - Client details
- [vendor_screens.dart:2045](edumid/lib/features/vendor/screens/vendor_screens.dart#L2045) - Advance order stage

### Principal/Teacher Module (BROKEN URL) ❌
- [principal_screens.dart:857](edumid/lib/features/principal/screens/principal_screens.dart#L857) - WRONG URL (ngrok)
- [principal_screens.dart:904-910](edumid/lib/features/principal/screens/principal_screens.dart#L904) - API calls with ngrok
- [teacher_screens.dart:62-72](edumid/lib/features/teacher/screens/teacher_screens.dart#L62) - Using correct IP but same logic

### Student Module (MOCKED) ❌
- [student_dashboard_screen.dart](edumid/lib/features/student/screens/student_dashboard_screen.dart) - Hard-coded "Arjun Sharma"
- [corrections_repository.dart](edumid/lib/features/corrections/corrections_repository.dart) - Local data, no API
- [reprint_repository.dart](edumid/lib/features/reprint/reprint_repository.dart) - Local data, no API

---

## 🎯 State Management Used

| Module | Approach | Details |
|--------|----------|---------|
| **Vendor** | Widget State (setState) + ValueNotifier | Each screen has local state |
| **Teacher** | ChangeNotifier (_TeacherDataStore) | Shared across screens |
| **Principal** | ChangeNotifier (SchoolDataStore) | Shared across screens |
| **Student** | Hard-coded constants | No state management |
| **Corrections** | ChangeNotifier (mock) | In-memory list |
| **Reprint** | ChangeNotifier (mock) | In-memory list |
| **Notifications** | NotificationStore (mock) | In-memory |
| **Theme** | ChangeNotifier (ThemeProvider) | Listenable |

**Issue**: No consistent pattern. Mix of setState, ChangeNotifier, and ValueNotifier.

---

## 🚀 Configuration

### Server
- **IP**: 72.62.241.170
- **Port**: 5000
- **Process Manager**: PM2
- **Reverse Proxy**: Nginx on port 80
- **Database**: MongoDB (requires MONGO_URI env variable)

### Frontend URLs
- **Vendor**: `http://72.62.241.170:5000` ✅
- **Teacher**: `http://72.62.241.170:5000` ✅
- **Principal**: `https://unopposable-solidly-elfriede.ngrok-free.dev` ❌ BROKEN

### Hard-coded IDs (Should come from auth)
- **Vendor ID**: `vendor_001`
- **Principal ID**: `principal_001`
- **Student**: Arjun Sharma (Class X-A, Roll 23)

---

## 🔐 Security Issues

1. **No Authentication**
   - No login endpoint
   - No token validation
   - No role checking

2. **Hard-coded IDs**
   - Anyone accessing vendor screen = vendor_001
   - Anyone accessing principal screen = principal_001

3. **CORS Too Open**
   - `origin: '*'` in server.js
   - Should restrict to specific domains

4. **No Input Validation**
   - Backend accepts any emailFormat in Client
   - No XSS protection

---

## ✨ QUICK FIX CHECKLIST

- [ ] Change `_kPrincipalBase` URL from ngrok to IP address
- [ ] Create `/api/auth/login` endpoint
- [ ] Implement JWT token handling
- [ ] Create `/api/students/*` endpoints
- [ ] Remove hard-coded student data
- [ ] Add error handling to all API calls
- [ ] Add loading states to API calls
- [ ] Index `SchoolClass.principalId` and `SchoolMember.principalId`
- [ ] Implement student data repository similar to TeacherDataStore
- [ ] Move API calls to corrections/reprint backend

---

## 📋 Files to Review

### CRITICAL
1. [principal_screens.dart:857](edumid/lib/features/principal/screens/principal_screens.dart#L857) - WRONG URL
2. [server.js](backend/server.js) - Missing auth routes
3. [student_dashboard_screen.dart](edumid/lib/features/student/screens/student_dashboard_screen.dart) - Hard-coded data

### HIGH PRIORITY  
4. [vendor_screens.dart](edumid/lib/features/vendor/screens/vendor_screens.dart) - Add error handling
5. [teacher_screens.dart](edumid/lib/features/teacher/screens/teacher_screens.dart) - Add error handling
6. [corrections_repository.dart](edumid/lib/features/corrections/corrections_repository.dart) - Backend integration
7. [reprint_repository.dart](edumid/lib/features/reprint/reprint_repository.dart) - Backend integration

### MEDIUM PRIORITY
8. [principalController.js](backend/controllers/principalController.js) - Add missing validations
9. [vendorController.js](backend/controllers/vendorController.js) - Add missing validations

---

## 🔍 Key Stats

| Metric | Count | Status |
|--------|-------|--------|
| Frontend Screens | 56 | 46% not integrated |
| Backend Endpoints | 22 | 41% not called |
| Database Collections | 5 | 1 not used |
| State Management Patterns | 3 | Inconsistent |
| Hard-coded IDs | 3+ | Security risk |
| API Calls | 20+ | 1 set using wrong URL |

---

## 🎓 Lessons Learned

1. **Never hard-code base URLs** - Should use environment variables
2. **Single responsibility** - Each screen shouldn't create its own Dio instance
3. **State management** - Use one pattern consistently across app
4. **Database indexing** - Add indexes on filtered fields
5. **Authentication first** - Implement before building features

---

Generated: March 27, 2026 | For: EduMid Full-Stack Team
