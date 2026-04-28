# Template Save & Visibility Issue - Root Cause & Fix

## Issue Summary
Templates are **visible and saveable locally** but **not visible after Render deployment**.

---

## Root Causes Identified

### 1. **MongoDB Connection & Environment Variable Mismatch**
- **Local**: `.env` has both `MONGO_URI` and `MONGODB_URI` pointing to the same MongoDB Atlas database
- **Render**: `render.yaml` only declares `MONGODB_URI` but the value must be set manually in Render dashboard
- **Problem**: If `MONGODB_URI` is not set in Render environment variables, the backend fails to connect to MongoDB

### 2. **Insufficient Logging to Diagnose Save Failures**
- Before: No logs showing whether templates were actually saved to MongoDB
- After: Comprehensive logs now track database connection, save operations, and errors

### 3. **Template API Base URL Routing Issue** (Already Fixed)
- Frontend was using hardcoded `/api/templates` instead of shared API base
- Fixed: Now uses `API_ROOT/templates` from shared `apiService.ts`

### 4. **Potential Missing Database in Render vs Local**
- **Local**: All operations use the same `myapp` database from `.env`
- **Render**: Must explicitly set `MONGODB_URI` to point to the same database

---

## What's Been Added (Logging & Diagnostics)

### Database Connection Logging
```
✓ MongoDB connected successfully {
  database: "myapp",
  host: "cluster0.3zq4ych.mongodb.net",
  uri: "mongodb+srv://***:***@cluster0.3zq4ych.mongodb.net/..."
}
```

### Template Save Logging
```
[templates] Saving template {
  productId: "...",
  templateName: "Template 1",
  collection: "producttemplates",
  database: "myapp"
}

[templates] Template saved successfully {
  _id: "...",
  templateName: "Template 1",
  createdAt: "2026-04-28T..."
}
```

### Template Fetch Logging
```
[templates] Query result {
  productId: "...",
  count: 5,
  templateIds: ["...", "...", "..."]
}
```

### Error Logging (Now Includes Stack Traces)
```
[templates] Template save failed {
  error: "Connection timeout",
  stack: "Error: Connection timeout...",
  mongoError: 11000,
  mongoMessage: "Duplicate key error"
}
```

---

## Database Information

### Collection Name
- **Mongoose Model**: `ProductTemplate`
- **MongoDB Collection**: `producttemplates` (auto-pluralized)
- **Database**: `myapp` (from MongoDB URI)

### Schema Fields
```
{
  productId: ObjectId (required, indexed),
  templateName: String (required),
  category: String (enum: Business, Wedding, Minimal, Corporate, Festival, Other),
  previewImageUrl: String,
  preview_image: String (indexed),
  designFileUrl: String,
  designData: Object,
  isActive: Boolean (indexed, default: true),
  tags: [String],
  createdAt: Date,
  updatedAt: Date
}
```

---

## Debugging Steps

### Step 1: Check Backend Logs on Render
1. Go to Render dashboard → Your service → Logs
2. Look for these patterns:
   - `✓ MongoDB connected successfully` → Shows database connection success/failure
   - `[templates] Saving template` → Shows when save is attempted
   - `[templates] Template saved successfully` → Confirms save worked
   - `[templates] Template save failed` → Shows exact error

### Step 2: Verify MongoDB Environment Variable
1. In Render dashboard, go to your service → Environment
2. Check if `MONGODB_URI` is set:
   - Should be: `mongodb+srv://aaryaleap_db_user:ZXCvbnm12345678@cluster0.3zq4ych.mongodb.net/myapp?retryWrites=true&w=majority&authSource=admin`
   - Should NOT have `MONGODB_URI=` prefix or surrounding quotes

### Step 3: Test Database Connection
1. SSH into Render backend or add this test endpoint:
```bash
# Or hit directly from browser:
https://your-backend.onrender.com/health
```

Should return:
```json
{ "status": "ok", "timestamp": "..." }
```

### Step 4: Check if Templates Exist in Production Database
1. Go to MongoDB Atlas dashboard → Collections
2. Navigate to `myapp` database → `producttemplates` collection
3. Count documents - should match what you created locally
4. If count is 0: templates are not being saved on Render

### Step 5: Check Frontend API URL
1. Open browser DevTools → Console
2. Create a new template
3. Look for logs like:
```
[templateApi] /api/templates response {
  url: "https://your-backend.onrender.com/api/templates/product/...",
  status: 201,
  count: 1
}
```

If URL shows `localhost` or wrong domain → frontend env vars not set correctly

---

## Render Environment Variables (EXACT CONFIG)

### Required Variables in Render Dashboard

**Go to: Service → Environment → Environment Variables**

| Key | Value | Notes |
|-----|-------|-------|
| `NODE_ENV` | `production` | Already set in render.yaml |
| `MONGODB_URI` | `mongodb+srv://aaryaleap_db_user:ZXCvbnm12345678@cluster0.3zq4ych.mongodb.net/myapp?retryWrites=true&w=majority&authSource=admin` | **Must be set!** No quotes, no prefix |
| `CORS_ORIGIN` | `https://your-frontend-service.onrender.com` | Your actual frontend URL |
| `FRONTEND_URL` | `https://your-frontend-service.onrender.com` | Same as CORS_ORIGIN |
| `JWT_SECRET` | `your_jwt_secret_key_change_in_production` | Keep secure |
| `VITE_API_BASE_URL` | `https://your-backend-service.onrender.com` | For frontend builds |

### Frontend Build Variables (if building frontend on Render)
```
VITE_API_BASE_URL=https://your-backend-service.onrender.com
VITE_API_URL=https://your-backend-service.onrender.com
```

---

## Fix Checklist

- [ ] **1. Set MongoDB URI on Render**
  - In Render dashboard, set `MONGODB_URI` to the exact value from your local `.env`
  - Verify no extra quotes or prefix

- [ ] **2. Verify Database Connection**
  - Check backend logs for: `✓ MongoDB connected successfully`
  - Should show the correct database name: `myapp`

- [ ] **3. Create Template and Check Logs**
  - Create a new template locally first
  - Redeploy to Render
  - Create the same template on Render
  - Check logs for:
    - `[templates] Saving template` 
    - `[templates] Template saved successfully` OR `[templates] Template save failed`

- [ ] **4. Verify Templates in Production Database**
  - Go to MongoDB Atlas
  - Check `myapp` → `producttemplates` collection
  - Should see the new template documents

- [ ] **5. Check Template Fetch**
  - Go to `/products/:productId/templates` page
  - Open DevTools → Console
  - Look for `[templateApi] /api/templates response` log
  - Count should match templates in database

- [ ] **6. Verify Frontend API URL**
  - Set `VITE_API_BASE_URL` in build environment
  - Ensure frontend points to correct backend domain

---

## Common Issues & Solutions

### Issue: "No preview available" message shows
**Cause**: Template was not saved to MongoDB
**Solution**: 
1. Check backend logs for save errors
2. Verify MongoDB connection
3. Check if `productId` and `templateName` are being sent

### Issue: 404 when fetching templates
**Cause**: Wrong API endpoint or frontend pointing to localhost
**Solution**:
1. Check browser console for `[templateApi]` logs
2. Verify `VITE_API_BASE_URL` is set correctly on Render
3. Ensure backend `CORS_ORIGIN` matches frontend URL

### Issue: MongoDB connection timeout
**Cause**: Render backend IP not allowlisted in MongoDB Atlas
**Solution**:
1. Go to MongoDB Atlas → Network Access
2. Add `0.0.0.0/0` or specific Render IP
3. Restart backend service

### Issue: Duplicate key error (MongoDB code 11000)
**Cause**: Template with same `productId` + `templateName` already exists
**Solution**:
1. Use different template name
2. Or delete the duplicate from MongoDB Atlas

---

## Logs Added (Files Modified)

### `backend/src/config/database.ts`
- Connection logging with database name and host

### `backend/src/routes/templates.ts`
- `POST /api/templates` - Save template with success/error logging
- `PUT /api/templates/:id` - Update template with logging
- `GET /api/templates` - Fetch all templates with logging
- `GET /api/templates/product/:productId` - Fetch product templates with logging
- All error handlers now log full stack traces and MongoDB-specific errors

### `src/lib/templateApi.ts` (Frontend)
- Better response parsing with error messages
- Console logs for fetch requests and response counts

---

## Next Steps

1. **Verify Render Environment Variables are Set**
2. **Check Backend Logs After Creating a Template**
3. **Confirm Templates Exist in MongoDB Atlas**
4. **Test Full Template Workflow Locally First**
5. **Deploy and Monitor Logs on Render**

Once logs show templates being saved successfully, they should appear in the UI.
