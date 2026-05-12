# Dynamic ID Card Form System - Implementation Guide

## Overview

This document provides a complete guide to the dynamic ID card form system implemented across the EduMid platform. The system allows principals to create customizable forms that students and teachers can fill and submit.

---

## System Architecture

### Three-Tier Architecture

```
Principal (Form Creator)
    ↓ Creates & saves form
Backend API (Form Storage)
    ↓ Stores form definition in MongoDB
Student/Teacher (Form Filler)
    ↓ Fetches & fills form
```

---

## Backend Implementation

### 1. Database Schema

**File**: `backend/models/IdCardForm.js`

```javascript
{
  _id: ObjectId (auto),
  principalId: String (unique),           // One form per principal
  formTitle: String,                      // e.g., "Student ID Card Form"
  formDescription: String,                // Optional description
  formFields: [{
    fieldId: String,                      // Unique within form
    fieldName: String,                    // Display name (e.g., "Full Name")
    fieldType: Enum['text','dropdown','number','date'],
    isRequired: Boolean,
    placeholder: String,
    options: String[] (for dropdowns),
    order: Number                         // Field display order
  }],
  createdAt: DateTime,
  updatedAt: DateTime
}
```

### 2. API Endpoints

**Routes**: `backend/routes/principalRoutes.js`

#### Save/Update Form
```
POST /api/principal/id-card-form

Request:
{
  "principalId": "principal_001",
  "formTitle": "Student ID Card Form",
  "formDescription": "Fill this to apply for your ID card",
  "formFields": [
    {
      "fieldId": "field_1",
      "fieldName": "Full Name",
      "fieldType": "text",
      "isRequired": true,
      "placeholder": "Enter your full name",
      "options": [],
      "order": 0
    },
    {
      "fieldId": "field_2",
      "fieldName": "Class",
      "fieldType": "dropdown",
      "isRequired": true,
      "placeholder": "Select your class",
      "options": ["10-A", "10-B", "11-A"],
      "order": 1
    }
  ]
}

Response (201):
{
  "message": "Form saved successfully",
  "form": {
    "id": "507f1f77bcf86cd799439011",
    "principalId": "principal_001",
    "formTitle": "Student ID Card Form",
    "fieldCount": 2
  }
}
```

#### Fetch Form
```
GET /api/principal/id-card-form?principalId=principal_001

Response (200):
{
  "id": "507f1f77bcf86cd799439011",
  "principalId": "principal_001",
  "formTitle": "Student ID Card Form",
  "formDescription": "Fill this to apply for your ID card",
  "formFields": [
    {
      "fieldId": "field_1",
      "fieldName": "Full Name",
      "fieldType": "text",
      "isRequired": true,
      "placeholder": "Enter your full name",
      "options": [],
      "order": 0
    },
    ...
  ]
}

Response (404):
{
  "error": "No form found for this principal"
}
```

### 3. Backend Controllers

**File**: `backend/controllers/principalController.js`

- `saveIdCardForm()` - Create or update form
- `getIdCardForm()` - Fetch form for a principal

---

## Frontend Implementation

### 1. Configuration

**File**: `lib/core/api/api_config.dart`

```dart
class ApiConfig {
  static const String principalIdCardForm = '$baseUrl/api/principal/id-card-form';
  // ... other endpoints
}
```

### 2. Services

**File**: `lib/core/services/id_card_form_service.dart`

#### Models

```dart
class FormField {
  final String fieldId;
  final String fieldName;
  final String fieldType;        // 'text', 'dropdown', 'number', 'date'
  final bool isRequired;
  final String placeholder;
  final List<String> options;
  final int order;
}

class IdCardForm {
  final String id;
  final String principalId;
  final String formTitle;
  final String formDescription;
  final List<FormField> formFields;
}
```

#### Service Methods

```dart
class IdCardFormService {
  // Save form (Principal only)
  Future<String?> saveIdCardForm({
    required String principalId,
    required List<FormField> formFields,
    required String formTitle,
    String formDescription = '',
  })

  // Fetch form (All roles)
  Future<IdCardForm?> getIdCardForm({
    required String principalId,
  })
}
```

### 3. Widgets

#### A. Dynamic Form Widget

**File**: `lib/shared/widgets/dynamic_form_widget.dart`

Renders form fields dynamically based on form definition.

**Features**:
- Support for text, dropdown, number, and date fields
- Form validation
- Read-only mode
- Custom styling
- Field tracking

**Usage**:
```dart
DynamicFormWidget(
  form: idCardForm,
  onFormDataChange: (formData) {
    // Handle form data changes
  },
  onSubmit: () {
    // Handle form submission
  },
  isReadOnly: false,
)
```

#### B. Form Builder Screen (Principal)

**File**: `lib/shared/widgets/id_card_form_builder_screen.dart`

Allows principals to create and edit forms with a visual builder interface.

**Features**:
- Add/edit/remove fields
- Reorder fields
- Set field properties (name, type, required, options)
- Real-time validation
- Save and update forms

#### C. Form Fill Screen (Student/Teacher)

**File**: `lib/shared/widgets/id_card_form_fill_screen.dart`

Allows students and teachers to view and fill forms.

**Features**:
- Fetch form from backend
- Display loading/error states
- Form submission
- Success feedback

---

## Integration Points

### 1. Principal Dashboard

**File**: `lib/features/principal/screens/principal_screens.dart`

Added "Set ID Card Form" option to the "Add to School" menu.

**Access**:
1. Open Principal Dashboard
2. Tap the "+" button (Add to School)
3. Select "Set ID Card Form"
4. Configure form fields
5. Save

### 2. Teacher Dashboard

**File**: `lib/features/teacher/screens/teacher_screens.dart`

Added "Form for New ID Card" option to the "Data Collection" section.

**Access**:
1. Open Teacher Dashboard
2. Scroll to "Data Collection" section
3. Tap "Form for New ID Card"
4. Fill and submit form

### 3. Student Dashboard

**File**: `lib/features/student/screens/student_dashboard_screen.dart`

Added "Form" quick action button.

**Access**:
1. Open Student Dashboard
2. Find "Form" button in quick actions (bottom row)
3. Tap to open form
4. Fill and submit

---

## Usage Flow

### Principal: Creating a Form

```
1. Principal Dashboard
   ↓
2. Tap "+" (Add to School)
   ↓
3. Select "Set ID Card Form"
   ↓
4. Enter Form Title & Description
   ↓
5. Add Fields (Name, Class, Age, etc.)
   ↓
6. Configure Each Field:
   - Field name
   - Field type (text/dropdown/number/date)
   - Required/Optional
   - Placeholder text
   - Options (for dropdowns)
   ↓
7. Reorder fields using up/down arrows
   ↓
8. Tap "Save Form"
   ↓
9. Form stored in backend and accessible to all students/teachers
```

### Student/Teacher: Filling a Form

```
1. Student/Teacher Dashboard
   ↓
2. Find "Form for New ID Card" option
   ↓
3. Tap to open form
   ↓
4. App fetches form from backend
   ↓
5. Form displays with all configured fields
   ↓
6. Fill required fields
   ↓
7. Tap "Submit Form"
   ↓
8. Form data validated and submitted
   ↓
9. Success message shown
```

---

## Field Types

### 1. Text Field
- Single-line text input
- Validation: Non-empty for required fields
- Placeholder support

### 2. Dropdown Field
- Select from predefined options
- Validation: Must select a value if required
- Options configured by principal

### 3. Number Field
- Numeric input only
- Validation: Must be valid number if required
- Integer only

### 4. Date Field
- Date picker UI
- Stores in YYYY-MM-DD format
- Validation: Must select date if required

---

## Code Examples

### Example 1: Creating Form Fields Programmatically

```dart
final formFields = [
  FormField(
    fieldId: 'field_1',
    fieldName: 'Full Name',
    fieldType: 'text',
    isRequired: true,
    placeholder: 'Enter your full name',
    order: 0,
  ),
  FormField(
    fieldId: 'field_2',
    fieldName: 'Class',
    fieldType: 'dropdown',
    isRequired: true,
    options: ['10-A', '10-B', '11-A', '11-B'],
    placeholder: 'Select your class',
    order: 1,
  ),
  FormField(
    fieldId: 'field_3',
    fieldName: 'Email',
    fieldType: 'text',
    isRequired: false,
    placeholder: 'Your email (optional)',
    order: 2,
  ),
];
```

### Example 2: Saving a Form

```dart
final service = IdCardFormService();

final formId = await service.saveIdCardForm(
  principalId: 'principal_001',
  formFields: formFields,
  formTitle: 'Student ID Card Registration',
  formDescription: 'Complete this form to register for your ID card',
);

if (formId != null) {
  print('Form saved successfully with ID: $formId');
} else {
  print('Failed to save form');
}
```

### Example 3: Fetching and Displaying a Form

```dart
final service = IdCardFormService();

final form = await service.getIdCardForm(
  principalId: 'principal_001',
);

if (form != null) {
  // Display form using DynamicFormWidget
  showDialog(
    context: context,
    builder: (context) => DynamicFormWidget(
      form: form,
      onSubmit: () {
        print('Form submitted!');
      },
    ),
  );
} else {
  print('No form available');
}
```

---

## Testing

### Test Cases

#### Backend Tests
1. Save form with valid data → Should return 201
2. Save form without principal ID → Should return 400
3. Fetch form with valid principal ID → Should return 200
4. Fetch form with non-existent principal​ ID → Should return 404
5. Update existing form → Should return 201

#### Frontend Tests
1. Load form builder → Should display empty form
2. Add new field → Should be added to list
3. Edit field → Should update field properties
4. Delete field → Should remove from list
5. Reorder fields → Should update order
6. Save form → Should send to backend
7. Load student form → Should fetch from backend
8. Fill form with invalid data → Should show validation errors
9. Submit form → Should validate and show success

---

## Important Notes

1. **One Form Per Principal**: Each principal can have only one ID card form (unique principalId)
2. **Form Visibility**: Once saved, form is immediately visible to all students/teachers of that principal
3. **Field Order**: Fields are sorted by `order` parameter before display
4. **Validation**: Required fields must be filled before submission
5. **Data Persistence**: Form data is stored in MongoDB and persists across app restarts

---

## Files Modified/Created

### Created
- `backend/models/IdCardForm.js` - Database schema
- `lib/core/services/id_card_form_service.dart` - Service layer
- `lib/shared/widgets/dynamic_form_widget.dart` - Form renderer
- `lib/shared/widgets/id_card_form_builder_screen.dart` - Form builder
- `lib/shared/widgets/id_card_form_fill_screen.dart` - Form fill screen

### Modified
- `backend/controllers/principalController.js` - Added form methods
- `backend/routes/principalRoutes.js` - Added form routes
- `lib/core/api/api_config.dart` - Added form endpoint
- `lib/features/principal/screens/principal_screens.dart` - Added menu option
- `lib/features/teacher/screens/teacher_screens.dart` - Added dashboard option
- `lib/features/student/screens/student_dashboard_screen.dart` - Added form action

---

## Future Enhancements

1. Form submission storage in separate collection
2. Form analytics and statistics
3. CSV export of form submissions
4. Form versioning and history
5. Conditional fields based on other field values
6. File upload fields
7. Email notifications on form changes
8. Form templates
9. Multi-language support
10. Form branching logic

---

## Support

For issues or questions, refer to the logging output:
- Backend logs: Check Node.js console for `[saveIdCardForm]` and `[getIdCardForm]` messages
- Frontend logs: Check Flutter console for `[IdCardFormService]` messages
- Form widget logs: Look for `[DynamicForm]` messages when troubleshooting validation

