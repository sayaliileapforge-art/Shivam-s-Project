# Backend Routes Structure - Complete Reference

## File Structure

```
backend/
├── server.js                               ← Route registration
├── routes/
│   ├── formRoutes.js                       ← Form endpoints
│   ├── principalRoutes.js                  ← Principal endpoints
│   ├── userRoutes.js
│   └── vendorRoutes.js
├── controllers/
│   ├── formController.js                   ← Form logic (4 methods)
│   ├── principalController.js              ← Principal logic (includes ID Card methods)
│   ├── vendorController.js
│   └── ...
└── models/
    ├── IdCardForm.js                       ← Form schema
    ├── IdCardSubmission.js                 ← Submission schema
    ├── SchoolClass.js
    ├── SchoolMember.js
    └── ...
```

---

## Route Mapping

### server.js (Line 28-33)
```javascript
// Routes
app.use('/api', userRoutes);
app.use('/api/vendor', vendorRoutes);
app.use('/api/principal', principalRoutes);
app.use('/api/form', formRoutes);
```

### formRoutes.js
```javascript
router.get('/',                    ctrl.getForm);          // GET /api/form?principalId=xxx
router.post('/submit',             ctrl.submitForm);       // POST /api/form/submit
router.get('/submissions',         ctrl.getSubmissions);   // GET /api/form/submissions?principalId=xxx
router.get('/submissions/:submissionId', ctrl.getSubmissionById); // GET /api/form/submissions/:id
```

### principalRoutes.js
```javascript
router.post('/id-card-form',  ctrl.saveIdCardForm);  // POST /api/principal/id-card-form
router.get('/id-card-form',   ctrl.getIdCardForm);   // GET /api/principal/id-card-form?principalId=xxx
```

---

## Database Collections

### IdCardForm Collection
```javascript
{
  _id: ObjectId,
  principalId: String (unique),    // One form per principal
  formTitle: String,               // "ID Card Form - Student"
  formDescription: String,         // Description
  formFields: [                    // Array of fields
    {
      fieldId: String,             // "field_1"
      fieldName: String,           // "Full Name"
      fieldType: String,           // "text", "number", "date", "dropdown"
      isRequired: Boolean,         // true
      placeholder: String,         // "Enter full name"
      options: [String],           // For dropdown: ["Option1", "Option2"]
      order: Number                // 0, 1, 2, ... (display order)
    }
  ],
  createdAt: Date,
  updatedAt: Date
}
```

### IdCardSubmission Collection
```javascript
{
  _id: ObjectId,
  principalId: String,             // Links to principal
  userId: String,                  // Who filled it
  userEmail: String,               // User email
  userName: String,                // User name
  role: String,                    // "student" or "teacher"
  formData: {                       // Key-value pairs
    "field_1": "value1",
    "field_2": "value2"
  },
  submittedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

---

## Controller Methods

### formController.js (4 exports)

#### 1. getForm()
```javascript
Endpoint: GET /api/form
Query: ?principalId=principal_001
Response: 200 - Form structure
          Or null if no form exists
Purpose: Students/teachers fetch form to fill
```

#### 2. submitForm()
```javascript
Endpoint: POST /api/form/submit
Body: {
  principalId,
  userId,
  userEmail,
  userName,
  role,
  formData
}
Response: 201 - { message, submission: { id, submittedAt } }
Purpose: Save student/teacher submission
```

#### 3. getSubmissions()
```javascript
Endpoint: GET /api/form/submissions
Query: ?principalId=principal_001&role=student
Response: 200 - { total, submissions: [...] }
Purpose: View all submissions for a principal
```

#### 4. getSubmissionById()
```javascript
Endpoint: GET /api/form/submissions/:submissionId
Response: 200 - Single submission object
Purpose: View details of one submission
```

### principalController.js (2 ID Card methods)

#### 1. saveIdCardForm()
```javascript
Endpoint: POST /api/principal/id-card-form
Body: {
  principalId,
  formTitle,
  formDescription,
  formFields: [
    { fieldId, fieldName, fieldType, isRequired, placeholder, order }
  ]
}
Response: 201 - { message, form: { id, principalId, fieldCount } }
Purpose: Save form structure (principal only)
```

#### 2. getIdCardForm()
```javascript
Endpoint: GET /api/principal/id-card-form
Query: ?principalId=principal_001
Response: 200 - Form structure (sorted by order)
Purpose: Principal view their form
```

---

## Complete Request/Response Flow

### Flow 1: Principal Creates Form

```
┌─────────────────────────────────────────┐
│ Principal (Frontend)                    │
│ - Defines custom fields                 │
│ - Clicks "Set Form"                     │
└──────────────────┬──────────────────────┘
                   │ POST /api/principal/id-card-form
                   ▼
┌─────────────────────────────────────────┐
│ Backend (principalController.saveIdCardForm)
│ - Receives formFields array             │
│ - Saves to MongoDB IdCardForm           │
│ - Returns form ID                       │
└──────────────────┬──────────────────────┘
                   │ 201 response
                   ▼
┌─────────────────────────────────────────┐
│ MongoDB                                 │
│ IdCardForm collection updated           │
└─────────────────────────────────────────┘
```

### Flow 2: Student Fetches Form

```
┌─────────────────────────────────────────┐
│ Student (Frontend)                      │
│ - Opens app                             │
│ - Navigates to "Fill Form"              │
└──────────────────┬──────────────────────┘
                   │ GET /api/form?principalId=xxx
                   ▼
┌─────────────────────────────────────────┐
│ Backend (formController.getForm)         │
│ - Queries MongoDB by principalId        │
│ - Returns form structure                │
└──────────────────┬──────────────────────┘
                   │ 200 response
                   ▼
┌─────────────────────────────────────────┐
│ Student (Frontend)                      │
│ - Displays form with custom fields      │
│ - Student fills values                  │
└─────────────────────────────────────────┘
```

### Flow 3: Student Submits Form

```
┌─────────────────────────────────────────┐
│ Student (Frontend)                      │
│ - Filled all fields                     │
│ - Clicks "Submit"                       │
└──────────────────┬──────────────────────┘
                   │ POST /api/form/submit
                   │ Body: { principalId, userId, formData }
                   ▼
┌─────────────────────────────────────────┐
│ Backend (formController.submitForm)      │
│ - Validates all fields                  │
│ - Creates IdCardSubmission document     │
│ - Saves to MongoDB                      │
└──────────────────┬──────────────────────┘
                   │ 201 response
                   ▼
┌─────────────────────────────────────────┐
│ MongoDB                                 │
│ IdCardSubmission collection updated     │
└─────────────────────────────────────────┘
```

### Flow 4: Teacher Views Submissions

```
┌─────────────────────────────────────────┐
│ Teacher (Frontend)                      │
│ - Opens app                             │
│ - Views "Submissions"                   │
└──────────────────┬──────────────────────┘
                   │ GET /api/form/submissions?principalId=xxx&role=student
                   ▼
┌─────────────────────────────────────────┐
│ Backend (formController.getSubmissions)  │
│ - Queries IdCardSubmission by:          │
│   - principalId (match principal)       │
│   - role (filter: student/teacher)      │
│ - Returns array of submissions          │
└──────────────────┬──────────────────────┘
                   │ 200 response
                   ▼
┌─────────────────────────────────────────┐
│ Teacher (Frontend)                      │
│ - Displays all student submissions      │
│ - Can click to view details             │
└─────────────────────────────────────────┘
```

---

## Error Codes & Responses

| Code | Scenario | Response |
|------|----------|----------|
| 200 | Success | `{ data: ... }` or `null` |
| 201 | Created | `{ message: "...", data: { id } }` |
| 400 | Bad request | `{ error: "..." }` |
| 404 | Not found | `{ error: "..." }` |
| 500 | Server error | `{ error: "Internal server error" }` |

---

## Key Points

✅ **PrincipalId is the key** - All queries use this to group data  
✅ **Three collections involved:**
  - **IdCardForm** - One per principal (form structure)
  - **IdCardSubmission** - Many per principal (responses)
  - Others (SchoolClass, SchoolMember, etc.)

✅ **Endpoints are clear:**
  - POST `/api/principal/id-card-form` - Save form (principal)
  - GET `/api/form` - Fetch form (student/teacher)
  - POST `/api/form/submit` - Save response (student/teacher)
  - GET `/api/form/submissions` - View responses (teacher/principal)

✅ **All logging enabled** - Check console for debug info  
✅ **All validation in place** - Required fields checked  
✅ **Role-based** - Students and teachers have different permissions

---

## Test URLs

```
// Test Principal Endpoint
http://localhost:5000/api/principal/classes?principalId=principal_001

// Test Form Endpoints
http://localhost:5000/api/form?principalId=principal_001
http://localhost:5000/api/form/submissions?principalId=principal_001

// Save Form (requires POST)
POST http://localhost:5000/api/principal/id-card-form

// Submit Form (requires POST)
POST http://localhost:5000/api/form/submit
```

---

## Implementation Status

✅ **Syntax Error Fixed** - Removed duplicate closing brace  
✅ **Routes Registered** - All routes in server.js  
✅ **Controllers Implemented** - All methods present  
✅ **Models Created** - Schema defined  
✅ **Logging Added** - All operations logged  
✅ **Ready for Testing** - Start backend and test!

