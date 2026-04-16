# Dynamic ID Card Form System - Quick Reference

## 🎯 Quick Summary

A complete system for creating dynamic forms at principal level and having students/teachers fill them.

**Key Points**:
- Principal creates form with custom fields
- Students/Teachers see and fill the form
- Fully reusable across all user types
- Clean, material UI with validation

---

## 📁 Files Overview

### Backend Files
| File | Purpose |
|------|---------|
| `models/IdCardForm.js` | MongoDB schema for forms |
| `controllers/principalController.js` | `saveIdCardForm()`, `getIdCardForm()` methods |
| `routes/principalRoutes.js` | POST/GET routes for forms |

### Frontend Files
| File | Purpose |
|------|---------|
| `core/api/api_config.dart` | API endpoint constant |
| `core/services/id_card_form_service.dart` | Service layer (save, fetch) |
| `shared/widgets/dynamic_form_widget.dart` | Renders forms dynamically |
| `shared/widgets/id_card_form_builder_screen.dart` | Principal form editor |
| `shared/widgets/id_card_form_fill_screen.dart` | Student/Teacher form filler |

---

## 🔌 API Quick Reference

### Endpoints

**Save/Update Form**
```
POST /api/principal/id-card-form
{
  principalId, formTitle, formDescription, formFields[]
}
→ 201 with form ID
```

**Fetch Form**
```
GET /api/principal/id-card-form?principalId=...
→ 200 with full form data or 404
```

---

## 🎨 UI Integration

### Where Forms Appear

| Role | Location | Button |
|------|----------|--------|
| Principal | Add to School Menu | "Set ID Card Form" |
| Teacher | Data Collection Section | "Form for New ID Card" |
| Student | Quick Actions Grid | "Form" |

---

## 💻 Usage Examples

### Service Usage

```dart
// Get service instance
final service = IdCardFormService();

// Save form
await service.saveIdCardForm(
  principalId: 'principal_001',
  formFields: fieldsList,
  formTitle: 'My Form',
);

// Fetch form
final form = await service.getIdCardForm(
  principalId: 'principal_001',
);
```

### Widget Usage

```dart
// Display form
DynamicFormWidget(
  form: form,
  onSubmit: () => print('Submitted!'),
)

// Full screen
IdCardFormFillScreen(
  principalId: 'principal_001',
)

// Builder
IdCardFormBuilderScreen(
  principalId: 'principal_001',
)
```

---

## 📊 Form Field Types

| Type | Input | Example |
|------|-------|---------|
| `text` | TextField | Name, Email |
| `dropdown` | DropdownButton | Class, Department |
| `number` | Number input | Age, Roll number |
| `date` | Date picker | DOB, Issue date |

---

## 🚀 Adding a New Role

To add form support for a new role:

1. **Add imports** in role's screen file:
   ```dart
   import '../../../shared/widgets/id_card_form_fill_screen.dart';
   import '../../../core/services/id_card_form_service.dart';
   ```

2. **Add action button** in dashboard:
   ```dart
   GestureDetector(
     onTap: () => Navigator.of(context).push(
       MaterialPageRoute(
         builder: (_) => IdCardFormFillScreen(
           principalId: 'principal_001',
         ),
       ),
     ),
     child: // your button UI
   )
   ```

---

## 🔍 Debugging Tips

### Backend Logs
```
[saveIdCardForm] Saving form for principal: principal_001
[getIdCardForm] Fetching form for principal: principal_001
```

### Frontend Logs
```
[IdCardFormService] Saving form...
[DynamicForm] Form validated successfully
[DynamicForm] Form data: {...}
```

### Common Issues

| Issue | Solution |
|-------|----------|
| Form not appearing | Check principalId is correct |
| Validation not working | Ensure field has `isRequired: true` |
| Dropdown empty | Verify `options` array is populated |
| Style issues | Check if theme colors are defined |

---

## 📝 Form Field Configuration

```dart
FormField(
  fieldId: 'field_1',              // unique identifier
  fieldName: 'Full Name',          // display label
  fieldType: 'text',               // 'text'|'dropdown'|'number'|'date'
  isRequired: true,                // required or optional
  placeholder: 'Enter...',         // hint text
  options: ['A', 'B'],             // for dropdowns
  order: 0,                        // display order
)
```

---

## ✅ Testing Checklist

- [ ] Principal can create form with 5+ fields
- [ ] Form saves to backend
- [ ] Student can see form
- [ ] Student can fill all field types
- [ ] Validation prevents empty required fields
- [ ] Form submission succeeds
- [ ] Teacher can also fill form
- [ ] Dropdown options display correctly
- [ ] Date picker works
- [ ] Delete field removes it from list
- [ ] Reorder fields changes display order

---

## 🎓 Learning Path

1. **Understand Form Structure**: Check `IdCardForm` and `FormField` classes
2. **Review Service**: Look at `IdCardFormService` save/fetch methods
3. **Study Widget**: Examine `DynamicFormWidget` field rendering
4. **Try Building**: Create a simple form in principal dashboard
5. **Try Filling**: Fill the form as a student
6. **Customize**: Modify styles and add new field types

---

## 🔗 Related Resources

- API Config: `lib/core/api/api_config.dart`
- App Colors: `lib/core/theme/app_colors.dart`
- App Typography: `lib/core/theme/app_typography.dart`

---

## 💡 Pro Tips

1. **Use FormField IDs**: Make them descriptive like `email_field`, `age_field`
2. **Set Correct Order**: Ensure order numbers are sequential (0, 1, 2...)
3. **Provide Placeholders**: Better UX with helpful hint text
4. **Validate Early**: Check required fields before submit
5. **Log Everything**: Use debugPrint for troubleshooting
6. **Test Field Types**: Ensure each type works before production

---

## 🚨 Important Constraints

- ⚠️ One form per principal (unique constraint on principalId)
- ⚠️ Field order determines display order (sorted by order parameter)
- ⚠️ Required fields must be filled for validation to pass
- ⚠️ Dropdown options must be non-empty
- ⚠️ Special characters in text fields may need escaping

---

**Version**: 1.0  
**Last Updated**: 2026-03-30  
**Status**: ✅ Production Ready
