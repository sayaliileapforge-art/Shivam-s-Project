# MongoDB Connection Troubleshooting Guide

## Issue: Authentication Failed (Code 8000)

The backend is unable to authenticate with MongoDB Atlas using the provided credentials.

## Likely Causes

### 1. ❌ IP Whitelist (Most Common)
MongoDB Atlas blocks connections from unknown IPs by default.

**Solution:**
1. Go to [MongoDB Atlas](https://cloud.mongodb.com/v2)
2. Log in to your account
3. Navigate to **Network Access** → **IP Whitelist**
4. Click **Add IP Address**
5. For **Development**: Add `0.0.0.0/0` (allows all IPs)
6. For **Production**: Add your specific server IP

### 2. ❌ Invalid Credentials
The username or password might be incorrect.

**Solution:**
1. Go to [MongoDB Atlas](https://cloud.mongodb.com/v2)
2. Select your cluster: **cluster0**
3. Go to **Database Access** → **Database Users**
4. Verify user `aaryaleap_db_user` exists
5. If not, create a new database user:
   - Username: `aaryaleap_db_user`
   - Password: `4seP0xHMZOhgaGRD`
   - Built-in Role: **Atlas Admin**

### 3. ❌ Wrong Connection String
The URI might be malformed.

**Correct Format:**
```
mongodb+srv://aaryaleap_db_user:4seP0xHMZOhgaGRD@cluster0.3zq4ych.mongodb.net/?appName=Cluster0
```

**Verify:**
- User: `aaryaleap_db_user` ✓
- Password: `4seP0xHMZOhgaGRD` ✓
- Cluster: `cluster0.3zq4ych.mongodb.net` ✓
- Database: (defaults to "admin" for auth)

## Quick Fix Steps

### Step 1: Update IP Whitelist
```bash
# Go to MongoDB Atlas Console
# Network Access → IP Whitelist
# Add: 0.0.0.0/0 (development only!)
```

### Step 2: Verify Connection String
```bash
# File: backend/.env
MONGODB_URI=mongodb+srv://aaryaleap_db_user:4seP0xHMZOhgaGRD@cluster0.3zq4ych.mongodb.net/?appName=Cluster0
```

### Step 3: Test Connection
```bash
cd backend
npm run test-connection
```

## When It Works

You should see:
```
✅ Successfully connected to MongoDB
✅ Ping successful
📚 Available databases:
  - admin
  - config
  - aaryaleap (or your db name)
```

## Password Special Characters

If your password has special characters, they might need URL encoding:
- `@` → `%40`
- `#` → `%23`
- `:` → `%3A`
- `/` → `%2F`

Your current password `4seP0xHMZOhgaGRD` doesn't have special characters, so this shouldn't be an issue.

## Still Not Working?

1. **Check MongoDB Atlas Status:** Is the cluster running and not paused?
2. **Verify Network:** Do you have internet access? Can you ping `cluster0.3zq4ych.mongodb.net`?
3. **Try Connection String from Atlas:** 
   - Go to Cluster → Connect → Drivers
   - Copy the provided connection string
   - Update `.env` with it
4. **Check Database User Roles:** User might need "atlasAdmin" or custom role

## For Production

- Use a specific IP whitelist (e.g., your server's IP)
- Use a strong password (20+ characters, mix of upper/lower/numbers/symbols)
- Consider using MongoDB Atlas access controls (IP & user restrictions)
- Use a dedicated database user with minimal required permissions

## Alternative: Test with MongoDB Compass

You can also test the connection using MongoDB Compass GUI:
1. Download [MongoDB Compass](https://www.mongodb.com/products/compass)
2. Use connection string: `mongodb+srv://aaryaleap_db_user:4seP0xHMZOhgaGRD@cluster0.3zq4ych.mongodb.net/`
3. If it connects, the credentials are valid
4. If it fails, there's an IP whitelist or credential issue
