# Quick Action Plan - Template Issue Fix

## What's Been Done ✅

1. **Comprehensive Logging Added**
   - Backend now logs every template save attempt
   - Frontend logs API requests and responses
   - Database connection logs database name: `myapp`
   - All errors include full stack traces

2. **API Routing Fixed** (Previous session)
   - Frontend now uses shared API base URL
   - Backend template routes handle both productId and projectId params

3. **Code Committed & Pushed**
   - All changes pushed to GitHub main branch
   - Ready for Render deployment

---

## Action Required on Render 🔴 **CRITICAL**

### 1. Update Environment Variables
1. Go to: **Render Dashboard** → Your Service → **Environment**
2. Add/Update these variables (synced: false, so must be manual):

```
MONGODB_URI = mongodb+srv://aaryaleap_db_user:ZXCvbnm12345678@cluster0.3zq4ych.mongodb.net/myapp?retryWrites=true&w=majority&authSource=admin
CORS_ORIGIN = https://YOUR-RENDER-FRONTEND-URL.onrender.com
FRONTEND_URL = https://YOUR-RENDER-FRONTEND-URL.onrender.com
JWT_SECRET = your_secret_key
```

⚠️ **Replace `YOUR-RENDER-FRONTEND-URL` with your actual Render service URL**

### 2. Redeploy Service
1. After updating env vars, go to **Deployments** 
2. Click **Deploy latest commit** (commit: 93f9524)
3. Wait for build to complete

### 3. Test & Monitor Logs
1. Once deployed, go to **Logs** tab
2. Create a test template on your site
3. Check logs for:
   - ✅ `✓ MongoDB connected successfully` with `database: "myapp"`
   - ✅ `[templates] Saving template` when you create
   - ✅ `[templates] Template saved successfully` after save
4. Go back to templates → should see your new template

---

## Diagnostic Logs to Watch For

### ✅ Success Pattern
```
✓ MongoDB connected successfully { database: "myapp", host: "cluster0..." }
[templates] Saving template { productId: "...", templateName: "..." }
[templates] Template saved successfully { _id: "...", templateName: "..." }
[templates] Query result { productId: "...", count: 1 }
```

### ❌ Failure Pattern
```
[templates] Template save failed { error: "...", stack: "..." }
```

If you see `Connection timeout` or `ENOTFOUND` → `MONGODB_URI` not set correctly

---

## Troubleshooting

| Issue | Check |
|-------|-------|
| Templates still not visible | Check Render logs for `[templates]` messages |
| MongoDB connection error | Verify `MONGODB_URI` in Render env vars |
| 404 or CORS errors | Verify `CORS_ORIGIN` and `FRONTEND_URL` are set |
| See 5-10 templates locally but 0 on Render | Templates saved locally but not to MongoDB - connection issue |

---

## Full Documentation
See [TEMPLATE_SAVE_DIAGNOSIS.md](./TEMPLATE_SAVE_DIAGNOSIS.md) for complete analysis and debugging steps.
