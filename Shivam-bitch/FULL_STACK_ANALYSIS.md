# EduMid Full-Stack Application Analysis
**Date**: March 27, 2026 | **Analysis Scope**: Complete Frontend (Flutter) & Backend (Node.js + MongoDB) Integration

---

## 🚨 CRITICAL ISSUES IDENTIFIED

### 1. **BACKEND URL MISMATCH - BREAKING ISSUE**
| Module | Base URL | Type | Status |
|--------|----------|------|--------|
| **Vendor Screens** | `http://72.62.241.170:5000` | IP Address | ✅ Correct |
| **Teacher Screens** | `http://72.62.241.170:5000` | IP Address | ✅ Correct |
| **Principal Screens** | `https://unopposable-solidly-elfriede.ngrok-free.dev` | ngrok tunnel | ❌ **WRONG** |
| **Student Screens** | No backend calls | N/A | ⚠️ Mocked |

**Impact**: **Principal screens will never connect to the backend.** The ngrok tunnel in `principal_screens.dart` line 857 is outdated and will produce 404 errors.

**Location**: [principal_screens.dart](edumid/lib/features/principal/screens/principal_screens.dart#L857)

---

## 📊 ARCHITECTURE OVERVIEW

### **Frontend Architecture (Flutter)**
- **Navigation**: GoRouter (go_router package)
- **State Management**: Multiple approaches used:
  - `ChangeNotifier` (TeacherDataStore, SchoolDataStore, ReprintRepository, CorrectionsRepository)
  - Local ValueNotifier (vendorDashboardRefreshTrigger)
  - Widget-level State (StatefulWidget with setState)
- **HTTP Client**: Dio package with custom BaseOptions

### **Backend Architecture (Node.js/Express)**
- **Server**: Express.js on port 5000
- **Database**: MongoDB with Mongoose ODM
- **Middleware**: CORS enabled (open to all origins), request logging
- **Deployment**: PM2 for process management, Nginx as reverse proxy

### **Database**: MongoDB via Mongoose
- 5 collections: User, Client, Order, SchoolClass, SchoolMember
- No authentication/authorization data model
- Limited indexing (only vendorId and clientId have indices)

---

## 🎯 FEATURE-BY-FEATURE ANALYSIS

### **1. VENDOR MODULE** ✅ Well Integrated
**Screens** (12 total):
- [vendor_dashboard_screen.dart](edumid/lib/features/vendor/screens/vendor_dashboard_screen.dart)
- [client_list_screen.dart](edumid/lib/features/vendor/screens/client_list_screen.dart)
- [add_client_screen.dart](edumid/lib/features/vendor/screens/add_client_screen.dart)
- [client_details_screen.dart](edumid/lib/features/vendor/screens/client_details_screen.dart)
- [create_order_screen.dart](edumid/lib/features/vendor/screens/create_order_screen.dart)
- [project_board_screen.dart](edumid/lib/features/vendor/screens/project_board_screen.dart)
- [workflow_stage_detail_screen.dart](edumid/lib/features/vendor/screens/workflow_stage_detail_screen.dart)
- [bulk_photo_matching_screen.dart](edumid/lib/features/vendor/screens/bulk_photo_matching_screen.dart)
- [upload_excel_screen.dart](edumid/lib/features/vendor/screens/upload_excel_screen.dart)
- [upload_photos_screen.dart](edumid/lib/features/vendor/screens/upload_photos_screen.dart)
- [column_mapping_screen.dart](edumid/lib/features/vendor/screens/column_mapping_screen.dart)
- [vendor_profile_screen.dart](edumid/lib/features/vendor/screens/vendor_profile_screen.dart)

**API Endpoints** (9 total):
```
GET    /api/vendor/dashboard?vendorId=<id>           → getVendorDashboard
GET    /api/vendor/clients?vendorId=<id>             → getVendorClients
POST   /api/vendor/clients                           → createClient
DELETE /api/vendor/clients/:id                       → deleteClient
GET    /api/vendor/clients/:id                       → getVendorClientById
GET    /api/vendor/clients/:id/orders               → getClientOrders
GET    /api/vendor/orders?vendorId=<id>              → getVendorOrders
POST   /api/vendor/orders                            → createOrder
PATCH  /api/vendor/orders/:id/advance                → advanceOrderStage
```

**Data Flow**:
- VendorDashboardScreen loads dashboard stats on init
- ClientListScreen fetches vendors' clients
- CreateOrderScreen POSTs new orders with optional clientId
- WorkflowStageDetailScreen allows users to advance order stage
- **State Management**: Widget-level setState with Future.wait for parallel API calls

**Issues Found**:
- ✅ No critical backend issues
- ⚠️ Hard-coded vendorId: `'vendor_001'` in screens (should come from auth)
- ⚠️ No error handling/retry logic for failed requests
- ⚠️ No loading state feedback on individual actions (e.g., delete button)

**Data Model**:
```javascript
Client: { 
  schoolName (required), vendorId (required, indexed),
  address, city, contactName, phone, email
}
Order: { 
  title (required), schoolName (required), vendorId (required, indexed),
  stage (enum: Draft|DataUpload|Design|Proof|Printing|Dispatch|Delivered),
  progress (0-100), totalCards, completedCards,
  clientId (ref: Client), deliveryDate, productType
}
```

---

### **2. PRINCIPAL/TEACHER MODULE** ❌ Database Connected, Wrong URL

**Screens** (24 total):
- Teacher: [teacher_screens.dart](edumid/lib/features/teacher/screens/teacher_screens.dart)
- Principal: [principal_screens.dart](edumid/lib/features/principal/screens/principal_screens.dart)

**API Endpoints** (11 total):
```
GET    /api/principal/classes?principalId=<id>       → getClasses
POST   /api/principal/classes                        → createClass
DELETE /api/principal/classes/:id                    → deleteClass
GET    /api/principal/members?principalId=<id>[&type=<type>] → getMembers
POST   /api/principal/members                        → createMember
PUT    /api/principal/members/:id                    → updateMember
DELETE /api/principal/members/:id                    → deleteMember
GET    /api/principal/users?principalId=<id>         → getUsers
PATCH  /api/principal/members/:id/restrict           → restrictMember
POST   /api/principal/members/:id/force-logout       → forceLogoutMember
```

**Critical Issues**:
1. **WRONG BASE URL** (Line 857 in principal_screens.dart):
   ```dart
   const String _kPrincipalBase = 'https://unopposable-solidly-elfriede.ngrok-free.dev';
   ```
   Should be: `'http://72.62.241.170:5000'`

2. **TeacherDataStore** uses correct URL but has wrong endpoint:
   - **Calls**: `GET /api/principal/classes` and `GET /api/principal/members`
   - **Passes**: `principalId=principal_001` and `type=teacher|student|staff`

3. **Hard-coded principalId**: `'principal_001'` (should come from auth)

**Data Model**:
```javascript
SchoolClass: { 
  name (required), principalId (required),
}
SchoolMember: { 
  type (enum: teacher|student|staff), name (required),
  principalId (required), classOrDept, phone, address,
  isRestricted (boolean)
}
```

**Data Flow**:
- TeacherDataStore initializes on first teacher screen load
- Uses `Future.wait()` to fetch classes + 3 member types in parallel
- Principal screens call similar APIs but with outdated URL

**Issues**:
- ❌ **CRITICAL**: Ngrok URL will timeout × 3/4 screens
- ❌ No authentication check (accessing with fake principal_001)
- ⚠️ restrictMember and forceLogoutMember not called from frontend
- ⚠️ No token/session management

---

### **3. STUDENT MODULE** ❌ NO Backend Integration

**Screens** (15 total):
- [student_dashboard_screen.dart](edumid/lib/features/student/screens/student_dashboard_screen.dart)
- [student_id_card_screen.dart](edumid/lib/features/student/screens/student_id_card_screen.dart)
- [student_attendance_screen.dart](edumid/lib/features/student/screens/student_attendance_screen.dart)
- [student_own_profile_screen.dart](edumid/lib/features/student/screens/student_own_profile_screen.dart)
- [student_correction_request_screen.dart](edumid/lib/features/student/screens/student_correction_request_screen.dart)
- [student_reprint_request_screen.dart](edumid/lib/features/student/screens/student_reprint_request_screen.dart)
- [student_notifications_screen.dart](edumid/lib/features/student/screens/student_notifications_screen.dart)
- [qr_verification_screen.dart](edumid/lib/features/student/screens/qr_verification_screen.dart)
- [share_id_card_screen.dart](edumid/lib/features/student/screens/share_id_card_screen.dart)
- [digital_vcard_screen.dart](edumid/lib/features/student/screens/digital_vcard_screen.dart)
- [download_pdf_screen.dart](edumid/lib/features/student/screens/download_pdf_screen.dart)
- [id_card_zoom_screen.dart](edumid/lib/features/student/screens/id_card_zoom_screen.dart)
- [student_sub_screens.dart](edumid/lib/features/student/screens/student_sub_screens.dart)

**Backend Integration**: ❌ **NONE**

**Issues**:
- ❌ Hard-coded student data (Arjun Sharma, Class X-A, Roll 23)
- ❌ No API calls to fetch student profile
- ❌ No backend integration for attendance
- ❌ Corrections using mock data ([corrections_repository.dart](edumid/lib/features/corrections/corrections_repository.dart))
- ❌ Reprint using mock data ([reprint_repository.dart](edumid/lib/features/reprint/reprint_repository.dart))

**In-Memory Repositories**:
1. **CorrectionsRepository**: 
   - Stores mock student data with hardcoded values
   - Mock correction requests with static timestamps
   - No backend calls
   
2. **ReprintRepository**: 
   - Simple in-memory List<ReprintRequest>
   - No persistence
   - Creates requests with timestamp-based IDs

---

### **4. AUTHENTICATION MODULE** ❌ NO Backend Integration

**Screens** (6 total):
- [splash_screen.dart](edumid/lib/features/auth/screens/splash_screen.dart)
- [login_screen.dart](edumid/lib/features/auth/screens/login_screen.dart)
- [otp_screen.dart](edumid/lib/features/auth/screens/otp_screen.dart)
- [forgot_password_screen.dart](edumid/lib/features/auth/screens/forgot_password_screen.dart)
- [role_selection_screen.dart](edumid/lib/features/auth/screens/role_selection_screen.dart)
- [session_restore_screen.dart](edumid/lib/features/auth/screens/session_restore_screen.dart)

**Backend Integration**: ❌ **NONE DETECTED**
- No POST /api/login endpoint in backend
- No authentication middleware
- No JWT/session token handling in backend
- Frontend shows login screens but no actual authentication

**Issues**:
- ❌ Mock authentication (accepts any credentials)
- ❌ No backend validation
- ❌ Hard-coded role selection
- ❌ No real session restoration

---

### **5. OTHER MODULES** ❌ **NO Backend Integration**

**Notifications** (3 screens):
- [notification_center_screen.dart](edumid/lib/features/notifications/screens/notification_center_screen.dart)
- [activity_feed_screen.dart](edumid/lib/features/notifications/screens/activity_feed_screen.dart)
- [notification_detail_screen.dart](edumid/lib/features/notifications/screens/notification_detail_screen.dart)
- **Backend Integration**: ❌ NONE (Mock NotificationStore in memory)

**Settings** (5 screens):
- [settings_screen.dart](edumid/lib/features/settings/screens/settings_screen.dart)
- [edit_profile_screen.dart](edumip/lib/features/settings/screens/edit_profile_screen.dart)
- [theme_settings_screen.dart](edumid/lib/features/settings/screens/theme_settings_screen.dart)
- [notification_settings_screen.dart](edumid/lib/features/settings/screens/notification_settings_screen.dart)
- [help_support_screen.dart](edumid/lib/features/settings/screens/help_support_screen.dart)
- **Backend Integration**: ❌ NONE (Local theme provider)

**Operator** (Optional module):
- Location: [features/operator/](edumid/lib/features/operator/)
- **Backend Integration**: ❌ Not fully analyzed (appears to be secondary)

---

## 📋 BACKEND ROUTES & CONTROLLERS MAPPING

### **User Routes** (`/api/`)
Status: ✅ Implemented but NOT CALLED from frontend
```
POST /api/add-user           → Add new user (no validation)
GET  /api/users              → Fetch all users
```
**Issues**:
- No frontend integration
- Basic email validation only
- No role/type distinction

---

### **Vendor Routes** (`/api/vendor/`)
Status: ✅ Fully implemented & integrated
- Dashboard stats aggregation working
- Order staging system functional
- Client CRUD operations available

---

### **Principal Routes** (`/api/principal/`)
Status: ✅ Implemented but ❌ WRONG URL IN FRONTEND
- All CRUD endpoints for classes and members
- User restriction and force-logout endpoints
- Frontend uses ngrok which is broken

---

## 🔗 INTEGRATION MAPPING

### **Vendor → Backend** ✅ CONNECTED
```
VendorDashboardScreen      → GET /api/vendor/dashboard
ClientListScreen           → GET /api/vendor/clients
AddClientScreen            → POST /api/vendor/clients
ClientDetailsScreen        → GET /api/vendor/clients/:id, GET /api/vendor/clients/:id/orders
CreateOrderScreen          → POST /api/vendor/orders
ProjectBoardScreen         → GET /api/vendor/orders (grouped by stage)
WorkflowStageDetailScreen  → PATCH /api/vendor/orders/:id/advance
```

### **Teacher → Backend** ⚠️ WRONG URL
```
TeacherDashboardScreen     → GET /api/principal/classes        (USES NGROK)
TeacherDataScreen          → GET /api/principal/members        (USES NGROK)
AttendanceScreen           → GET /api/principal/members        (USES NGROK)
```

### **Principal → Backend** ❌ BROKEN URL
```
PrincipalDashboardScreen   → GET /api/principal/classes        (WRONG URL)
PrincipalDataScreen        → GET /api/principal/members        (WRONG URL)
PrincipalDetailsScreen     → POST /api/principal/members       (WRONG URL)
PrincipalUsersScreen       → GET /api/principal/users          (WRONG URL)
```

### **Student → Backend** ❌ NOT CONNECTED
```
All student screens → NO BACKEND CALLS
All corrections → LOCAL REPOSITORY ONLY
All reprint → LOCAL REPOSITORY ONLY
```

### **Auth → Backend** ❌ NOT IMPLEMENTED
```
All auth screens → NO BACKEND CALLS
```

---

## 🗄️ DATABASE ANALYSIS

### **Collections & Schemas**

#### **1. User**
```javascript
{
  name: String (required),
  email: String (required, unique, indexed),
  createdAt: Date,
  updatedAt: Date
}
```
- **Usage**: Never called from frontend
- **Indexes**: email (unique)
- **Issues**: No password field, no role/type

#### **2. SchoolClass**
```javascript
{
  name: String (required),
  principalId: String (required),
  createdAt: Date,
  updatedAt: Date
}
```
- **Usage**: Via principal routes
- **Issues**: No index on principalId (query filter used but not indexed)

#### **3. SchoolMember**
```javascript
{
  type: String (enum: teacher|student|staff, required),
  name: String (required),
  classOrDept: String (default: ''),
  phone: String (default: ''),
  address: String (default: ''),
  principalId: String (required),
  isRestricted: Boolean (default: false),
  createdAt: Date,
  updatedAt: Date
}
```
- **Usage**: Via principal routes (filters by principalId & type)
- **Issues**: No index on principalId or type (query inefficient)
- **Field Issue**: address field stores empId for staff but is named confusingly

#### **4. Client**
```javascript
{
  schoolName: String (required),
  address: String,
  city: String,
  contactName: String,
  phone: String,
  email: String (validated with regex, lowercase),
  vendorId: String (required, indexed),
  createdAt: Date,
  updatedAt: Date
}
```
- **Usage**: Via vendor routes
- **Indexes**: vendorId (good)
- **Status**: ✅ Proper indexing

#### **5. Order**
```javascript
{
  title: String (required),
  schoolName: String (required),
  stage: String (enum: Draft|DataUpload|Design|Proof|Printing|Dispatch|Delivered, default: Draft),
  progress: Number (0-100, default: 0),
  totalCards: Number (default: 0),
  completedCards: Number (default: 0),
  vendorId: String (required, indexed),
  clientId: ObjectId (ref: Client, indexed),
  deliveryDate: Date,
  productType: String,
  createdAt: Date,
  updatedAt: Date
}
```
- **Usage**: Via vendor routes (filters by vendorId, clientId)
- **Indexes**: vendorId, clientId (good)
- **Status**: ✅ Proper indexing

### **Relationships**
```
Order.clientId → Client._id
Order.vendorId → String (no ref, just FK)
SchoolMember & SchoolClass → principalId → String (no User ref)
```

**Issues**:
- ⚠️ No auth system (no User model integration)
- ⚠️ SchoolClass missing index on principalId
- ⚠️ Missing cascade delete on SchoolClass (creates orphaned SchoolMembers)

---

## 📡 API VALIDATION

### **Vendor Dashboard API Response**
```json
{
  "totalClients": 3,
  "activeOrders": 5,
  "cardsToday": "774",
  "activeProjects": [
    { "schoolName": "school1", "stage": "Printing", "progress": 0.62 }
  ],
  "schools": [
    { "schoolName": "Delhi Public School", "city": "New Delhi" }
  ]
}
```
✅ Properly aggregated from parallel queries

### **Vendor Orders API Response**
```json
{
  "Draft": [{ "id": "...", "title": "...", "schoolName": "...", "progress": 62, "stage": "Draft" }],
  "Data Upload": [...],
  ...
}
```
✅ Properly grouped by stage

---

## 🚨 SUMMARY OF ISSUES

### **CRITICAL** 🔴
1. **Principal screens using broken ngrok URL** → Will fail 100%
   - Location: [principal_screens.dart:857](edumid/lib/features/principal/screens/principal_screens.dart#L857)
   - Fix: Change to `http://72.62.241.170:5000`

2. **No authentication system implemented** → Any user can access any role
   - No login endpoint in backend
   - No token/session management
   - Frontend shows auth screens but no backend validation

3. **Student data completely mocked** → Not backed by database
   - Hard-coded student profiles
   - Corrections & reprint use local repositories

### **HIGH** 🟠
1. **Hard-coded user IDs**
   - vendor_001, principal_001 everywhere
   - Should come from auth system

2. **No error handling on API failures** → App crashes on network issues
   - No retry logic
   - No fallback UI

3. **Missing database indexes**
   - SchoolClass missing index on principalId (inefficient queries)

### **MEDIUM** 🟡
1. **Unused User API** (`/api/add-user`, `/api/users`)
   - Backend implemented but not called from frontend

2. **No real-time updates** → UI doesn't refresh automatically
   - Pull-based only
   - No WebSocket/SSE

3. **Inconsistent HTTP libraries**
   - Mix of Dio instances with different configurations
   - Each screen creates new Dio() instance (not reused)

### **LOW** 🟢
1. **CORS too permissive** (`origin: '*'`)
   - Security risk in production

2. **No API documentation** in code
   - Endpoints work but not documented for frontend teams

3. **Timezone issues**
   - Backend uses UTC, frontend might assume local time

---

## 🔧 RECOMMENDATIONS & FIXES

### **1. IMMEDIATE FIXES (Critical)**

#### **Fix 1: Update Principal Base URL**
```dart
// BEFORE (Line 857, principal_screens.dart)
const String _kPrincipalBase = 'https://unopposable-solidly-elfriede.ngrok-free.dev';

// AFTER
const String _kPrincipalBase = 'http://72.62.241.170:5000';
```

#### **Fix 2: Implement Authentication**
**Backend (server.js)**:
```javascript
// Add authentication routes
app.use('/api/auth', require('./routes/authRoutes'));

// Add auth middleware
app.use((req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  // Verify token...
  next();
});
```

**Frontend (auth handler)**:
- Create login endpoint call
- Store JWT token locally
- Add interceptor to all requests
- Implement session restoration

#### **Fix 3: Create Student Backend API**
```javascript
router.get('/students/:id', getStudentById);
router.post('/students/:id/corrections', submitCorrectionRequest);
router.post('/students/:id/reprint', submitReprintRequest);
router.get('/students/:id/attendance', getStudentAttendance);
```

---

### **2. NEXT STEP FIXES (High Priority)**

1. **Add API Error Handling**
   - Implement try-catch with user-friendly errors
   - Add retry logic for network failures
   - Show loading states during API calls

2. **Index SchoolClass on principalId**
   ```javascript
   schoolClassSchema.index({ principalId: 1 });
   ```

3. **Create Centralized HTTP Client**
   ```dart
   // Instead of creating Dio() in each screen
   class ApiClient {
     static final _instance = ApiClient._();
     late Dio _dio;
     
     factory ApiClient() => _instance;
     ApiClient._() {
       _dio = Dio(BaseOptions(
         baseUrl: getBaseUrl(),
         connectTimeout: Duration(seconds: 10),
       ));
       _dio.interceptors.add(AuthInterceptor());
     }
   }
   ```

4. **Implement Real Student Data Flow**
   - Remove hard-coded student data
   - Fetch from `/api/principal/members?type=student`
   - Store in StudentDataStore similar to TeacherDataStore

---

### **3. ARCHITECTURAL IMPROVEMENTS (Medium Priority)**

1. **Consolidate Base URLs**
   - Create app_constants.dart with single API_BASE_URL
   - Override per-role if needed (currently all should be same)

2. **Implement Proper Navigation Guards**
   - Validate roles before showing screens
   - Clear screens when user logs out

3. **Add Response Caching**
   - Cache vendor endpoints (dashboard, clients)
   - Implement invalidation on POST/PUT/DELETE

4. **Enable CORS with Specific Origins**
   ```javascript
   app.use(cors({ 
     origin: ['http://localhost:3000', 'https://yourdomain.com'],
     credentials: true 
   }));
   ```

---

## 📈 DATA FLOW DIAGRAMS

### **Current Vendor Flow** ✅
```
VendorShell
  ├── VendorDashboard
  │   └── GET /api/vendor/dashboard → Display stats
  ├── ClientList
  │   └── GET /api/vendor/clients → Display clients
  ├── AddClient
  │   └── POST /api/vendor/clients → Create client
  ├── ClientDetails
  │   ├── GET /api/vendor/clients/:id → Show details
  │   └── GET /api/vendor/clients/:id/orders → Show orders
  ├── CreateOrder
  │   └── POST /api/vendor/orders → Create order
  ├── ProjectBoard
  │   └── GET /api/vendor/orders → Group by stage
  └── WorkflowStage
      └── PATCH /api/vendor/orders/:id/advance → Next stage
```

### **Broken Principal/Teacher Flow** ❌
```
TeacherShell
  ├── TeacherDashboard (TeacherDataStore)
  │   ├── GET /api/principal/classes [NGROK URL] ❌ FAILS
  │   ├── GET /api/principal/members?type=teacher [NGROK URL] ❌ FAILS
  │   ├── GET /api/principal/members?type=student [NGROK URL] ❌ FAILS
  │   └── GET /api/principal/members?type=staff [NGROK URL] ❌ FAILS
  └── [All derived screens use cached data from failed store] ❌
```

### **Missing Student Flow** ❌
```
StudentShell
  ├── StudentDashboard
  │   └── ALL DATA HARDCODED ❌
  ├── StudentIDCard
  │   └── ALL DATA HARDCODED ❌
  ├── Corrections (CorrectionsRepository)
  │   └── ALL DATA MOCKED ❌ (should call GET /api/principal/members/:id/corrections)
  └── Reprint (ReprintRepository)
      └── ALL DATA MOCKED ❌ (should call POST /api/principal/members/:id/reprint)
```

---

## ✅ SCREENS WITH COMPLETE INTEGRATION

### **Fully Working** ✅
- [x] Vendor Dashboard Screen
- [x] Vendor Client List Screen  
- [x] Vendor Client Details Screen
- [x] Vendor Create Order Screen
- [x] Vendor Project Board Screen
- [x] Vendor Workflow Stage Detail Screen

### **Partially Working** ⚠️
- [ ] Teacher Dashboard (loads data but wrong URL)
- [ ] Principal Dashboard (loads data but wrong URL)

### **Not Integrated** ❌
- [ ] All Student Screens (15/15)
- [ ] All Auth Screens (6/6)
- [ ] All Notifications Screens (3/3)
- [ ] All Settings Screens (5/5+)
- [ ] Corrections Feature (mock only)
- [ ] Reprint Feature (mock only)

---

## 📞 CONFIGURATION & DEPLOYMENT INFO

### **Server Configuration**
- **PM2**: Managing 'edumid-api' process
- **Port**: 5000
- **Process**: Auto-restart enabled
- **Nginx**: Reverse proxy on port 80

### **Database**
- **Type**: MongoDB
- **Connection**: Via MONGO_URI env variable
- **Seed Data**: Available in [seed.js](backend/seed.js)
- **Sample Data**: 3 clients, 7 orders

### **Deployment**
- **Server IP**: 72.62.241.170
- **Principal Base URL**: outdated ngrok (should be same IP)
- **Status**: API running but principal screens can't reach it

---

## 🎯 NEXT STEPS FOR DEVELOPERS

### **Week 1 - Critical Fixes**
1. Update principal URL to IP address
2. Implement basic JWT authentication
3. Create student API endpoints
4. Add error handling and loading states

### **Week 2 - Integration**
1. Remove all hard-coded data
2. Integrate student features with backend
3. Implement corrections data flow
4. Implement reprint data flow

### **Week 3 - Authentication**
1. Complete auth flow (login, OTP, role selection)
2. Persist auth session
3. Add role-based access control
4. Implement password reset backend

### **Week 4 - Testing & Optimization**
1. Test all API endpoints
2. Add error scenarios
3. Performance optimization
4. Documentation

---

## 📎 RELATED FILES REFERENCED

**Frontend**:
- Navigation: [app_router.dart](edumid/lib/core/navigation/app_router.dart)
- Vendor Screens: [vendor_screens.dart](edumid/lib/features/vendor/screens/vendor_screens.dart)
- Teacher Screens: [teacher_screens.dart](edumid/lib/features/teacher/screens/teacher_screens.dart)
- Principal Screens: [principal_screens.dart](edumid/lib/features/principal/screens/principal_screens.dart)
- Student Screens: [student_dashboard_screen.dart](edumid/lib/features/student/screens/student_dashboard_screen.dart)
- Corrections: [corrections_repository.dart](edumid/lib/features/corrections/corrections_repository.dart)
- Reprint: [reprint_repository.dart](edumid/lib/features/reprint/reprint_repository.dart)

**Backend**:
- Server: [server.js](backend/server.js)
- Routes: [vendorRoutes.js](backend/routes/vendorRoutes.js), [principalRoutes.js](backend/routes/principalRoutes.js), [userRoutes.js](backend/routes/userRoutes.js)
- Controllers: [vendorController.js](backend/controllers/vendorController.js), [principalController.js](backend/controllers/principalController.js)
- Models: [Client.js](backend/models/Client.js), [Order.js](backend/models/Order.js), [SchoolClass.js](backend/models/SchoolClass.js), [SchoolMember.js](backend/models/SchoolMember.js), [User.js](backend/models/User.js)
- Deployment: [deploy.sh](backend/deploy.sh), [ecosystem.config.js](backend/ecosystem.config.js)
- Database: [seed.js](backend/seed.js)

---

**Analysis Complete** | Generated: March 27, 2026
