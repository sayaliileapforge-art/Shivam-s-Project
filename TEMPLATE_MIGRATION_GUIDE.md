# Project Templates → MongoDB Migration Guide

## 🔴 **The Problem**

Your project templates (what you see in the gallery) are currently stored only in **browser localStorage**:
- ✅ Visible locally
- ✅ Persist when you reload the page
- ❌ Lost when you clear browser cache
- ❌ **NOT visible on different devices**
- ❌ **NOT visible on Render production**

This is why templates don't appear after deployment.

---

## ✅ **The Solution: Migrate to MongoDB**

### Step 1: Export localStorage Templates

Open browser DevTools console and run:

```javascript
// Get all project templates from localStorage
const templatesRaw = localStorage.getItem('vendor_templates');
const templates = templatesRaw ? JSON.parse(templatesRaw) : [];
console.log('Found templates:', templates.length);
templates.forEach(t => console.log('  -', t.templateName));
```

Expected output:
```
Found templates: 6
  - Template 1 (Copy)
  - Template 1
  - Template A
  - Template 3
  - Template 1
  - Template 4
```

### Step 2: Get Your Project ID

The project ID from the URL:
```
http://localhost:5173/projects/69d7616406f80de55d969799/...
                                    ↑
                            Copy this ID
```

Your project ID: `69d7616406f80de55d969799`

### Step 3: Run the Migration

In browser DevTools console:

```javascript
// Migrate project templates to MongoDB
const projectId = '69d7616406f80de55d969799';
const templatesRaw = localStorage.getItem('vendor_templates');
const templates = templatesRaw ? JSON.parse(templatesRaw) : [];

fetch('http://localhost:5000/api/templates/migration/sync-project-templates', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ projectId, templates })
})
.then(res => res.json())
.then(data => {
  console.log('✅ Migration Result:', data);
  if (data.data.saved.length > 0) {
    console.log('✅ Saved:', data.data.saved.length, 'templates');
  }
  if (data.data.errors.length > 0) {
    console.log('❌ Errors:', data.data.errors);
  }
});
```

### Step 4: Verify in MongoDB

1. Check backend logs (should show `[templates:migration]` messages)
2. Or query the API:
```bash
curl http://localhost:5000/api/templates/product/69d7616406f80de55d969799
```

Should return:
```json
{
  "success": true,
  "data": [
    { "templateName": "Template 1 (Copy)", "_id": "..." },
    { "templateName": "Template 1", "_id": "..." },
    ...
  ],
  "meta": { "total": 6 }
}
```

---

## 📊 **What Gets Migrated**

Each localStorage template is converted to MongoDB with:

| localStorage Field | MongoDB Field | Notes |
|-------------------|---------------|-------|
| `templateName` | `templateName` | Same |
| `thumbnail` | `preview_image` | Preview image |
| `templateType` | `designData.templateType` | Stored in designData |
| `canvas` | `designData.canvas` | Stored in designData |
| `margin` | `designData.margin` | Stored in designData |
| `isPublic` | `isActive` | Mapped to boolean |
| - | `category` | Set to "Other" |
| - | `tags` | `[migrated_2026-04-28]` |

---

## 🚀 **After Migration**

### Locally
```
npm run dev
# Visit http://localhost:5173/projects/69d7616406f80de55d969799
# Templates should still appear (both from localStorage AND from MongoDB)
```

### On Render

1. Set `MONGODB_URI` in Render environment
2. Redeploy
3. Templates will appear fetched from MongoDB

---

## 🔧 **Permanent Fix: Save to MongoDB on Create**

For future templates, they should save to MongoDB directly instead of just localStorage:

### Option 1: Keep Both (Recommended)
- Save to localStorage immediately (fast feedback)
- Also save to MongoDB via API (persistent)

### Option 2: Save Only to MongoDB
- Change `projectStore.ts` to call backend API instead

Would you like me to implement one of these permanent fixes?

---

## 📝 **Migration Script (One-Time)**

You can also run this script once from browser console to automate the whole process:

```javascript
async function migrateAllTemplates() {
  const projectId = '69d7616406f80de55d969799';
  const templatesRaw = localStorage.getItem('vendor_templates');
  const templates = templatesRaw ? JSON.parse(templatesRaw) : [];
  
  console.log(`🔄 Migrating ${templates.length} templates...`);
  
  try {
    const response = await fetch('http://localhost:5000/api/templates/migration/sync-project-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, templates })
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log(`✅ Successfully migrated ${result.data.saved.length} templates!`);
      console.log('📊 Saved:', result.data.saved.map(t => t.templateName).join(', '));
      
      if (result.data.errors.length > 0) {
        console.warn('⚠️ Some errors:', result.data.errors);
      }
    } else {
      console.error('❌ Migration failed:', result.error);
    }
  } catch (err) {
    console.error('❌ Error:', err);
  }
}

// Run it
migrateAllTemplates();
```

---

## 🎯 **Next Steps**

1. ✅ Run the migration script above
2. ✅ Verify templates appear in MongoDB
3. ✅ Test that they still show in the gallery
4. ✅ On Render: Set MONGODB_URI and redeploy
5. ✅ Verify templates appear on Render production
