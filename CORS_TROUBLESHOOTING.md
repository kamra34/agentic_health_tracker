# CORS Troubleshooting Guide

## Current Issue

You're seeing this error:
```
Access to XMLHttpRequest at 'https://backend-production-311e.up.railway.app/api/auth/forgot-username'
from origin 'https://agentic-health-tracker.vercel.app' has been blocked by CORS policy
```

This means Railway doesn't have the correct CORS configuration yet.

## Quick Fix (5 minutes)

### Step 1: Update Railway Environment Variable

1. Go to Railway dashboard: https://railway.app/dashboard
2. Find your project (agentic_health_tracker)
3. Click on your backend service
4. Click on **Variables** tab
5. Look for `CORS_ORIGINS` variable

### Step 2: Set CORS_ORIGINS Value

**If CORS_ORIGINS exists:**
- Click **Edit**
- Replace the value with:
  ```
  http://localhost:5173,http://localhost:3000,https://agentic-health-tracker.vercel.app
  ```
- Click **Save**

**If CORS_ORIGINS doesn't exist:**
- Click **+ New Variable**
- Variable name: `CORS_ORIGINS`
- Value: `http://localhost:5173,http://localhost:3000,https://agentic-health-tracker.vercel.app`
- Click **Add**

**CRITICAL:** Make sure there are NO spaces after commas!

❌ Wrong: `http://localhost:5173, https://agentic-health-tracker.vercel.app`
✅ Correct: `http://localhost:5173,https://agentic-health-tracker.vercel.app`

### Step 3: Wait for Deployment

1. Railway will automatically redeploy (you'll see "Deploying..." status)
2. Wait 2-3 minutes for deployment to complete
3. Check the **Deployments** tab to see if it succeeded

### Step 4: Verify in Logs

1. Click on your backend service in Railway
2. Click **Logs** tab
3. Look for startup logs showing CORS configuration
4. You should see the app starting without errors

### Step 5: Test Again

1. Go back to your Vercel frontend: https://agentic-health-tracker.vercel.app
2. Navigate to `/forgot-password`
3. Try to retrieve username or reset password
4. The CORS error should be gone!

## How to Verify Current Configuration

### Check Railway Environment Variables

1. Railway Dashboard → Your Service → Variables
2. Look at what `CORS_ORIGINS` is currently set to
3. Compare with the correct value above

### Check Railway Logs

After deployment, check logs for CORS-related messages:
1. Railway Dashboard → Your Service → Logs
2. Look for any errors during startup
3. FastAPI should start without CORS-related warnings

## Common Mistakes

### ❌ Mistake 1: Spaces After Commas
```
# Wrong
CORS_ORIGINS=http://localhost:5173, http://localhost:3000, https://agentic-health-tracker.vercel.app

# Correct
CORS_ORIGINS=http://localhost:5173,http://localhost:3000,https://agentic-health-tracker.vercel.app
```

### ❌ Mistake 2: Missing HTTPS Protocol
```
# Wrong
CORS_ORIGINS=agentic-health-tracker.vercel.app

# Correct
CORS_ORIGINS=https://agentic-health-tracker.vercel.app
```

### ❌ Mistake 3: Trailing Slash
```
# Wrong
CORS_ORIGINS=https://agentic-health-tracker.vercel.app/

# Correct
CORS_ORIGINS=https://agentic-health-tracker.vercel.app
```

### ❌ Mistake 4: Wrong Vercel Domain
Make sure you're using YOUR actual Vercel domain. Check your Vercel dashboard if unsure.

## Still Not Working?

### 1. Check Railway Deployment Status

```bash
# In your terminal
railway status
```

Or check Railway dashboard → Deployments tab

### 2. Check Railway Logs for Errors

Look for these error patterns:
- `pydantic.error_wrappers.ValidationError`
- `CORS` related errors
- `Environment variable` errors

### 3. Verify Environment Variable Format

Run this test locally:
```bash
cd backend
python test_cors_config.py
```

This will show if the CORS parsing is working correctly.

### 4. Force Redeploy

If Railway didn't redeploy after changing variables:
1. Go to Railway dashboard
2. Click your service
3. Click **Settings** tab
4. Scroll to bottom
5. Click **Redeploy** button

### 5. Check FastAPI Docs

Visit your backend directly:
- Open: https://backend-production-311e.up.railway.app/docs
- Try the `/api/auth/forgot-username` endpoint from the docs
- This bypasses CORS (since it's same origin)
- If this works, issue is definitely CORS config

## Advanced Debugging

### Check OPTIONS Request (Preflight)

The error says "Response to preflight request doesn't pass access control check"

This means the OPTIONS request is failing. Check:

1. **Railway Logs** - Look for OPTIONS requests
2. **Network Tab** - In browser DevTools, check if OPTIONS request returns 200
3. **Response Headers** - OPTIONS should return:
   - `Access-Control-Allow-Origin: https://agentic-health-tracker.vercel.app`
   - `Access-Control-Allow-Methods: POST, GET, OPTIONS, etc.`
   - `Access-Control-Allow-Headers: *`

### Temporary Test: Allow All Origins

**WARNING: Only for testing, NOT for production!**

To test if CORS config is the issue, temporarily set:
```
CORS_ORIGINS=*
```

If this fixes it, the issue is definitely the origin list. Then set it back to the proper domains.

## Timeline Expectations

- Environment variable update: Instant
- Railway redeploy trigger: ~10 seconds
- Railway build time: ~2 minutes
- Total time: ~3 minutes

## Contact Points

If you're still stuck:
1. Check Railway community: https://discord.gg/railway
2. Check FastAPI CORS docs: https://fastapi.tiangolo.com/tutorial/cors/
3. Check browser console for exact error message
4. Share Railway logs if asking for help

## Checklist

Before asking for help, verify:

- [ ] `CORS_ORIGINS` environment variable is set in Railway
- [ ] Value has no spaces after commas
- [ ] Value includes `https://agentic-health-tracker.vercel.app`
- [ ] Railway deployment succeeded (check Deployments tab)
- [ ] Railway service is running (not crashed)
- [ ] Backend is accessible at https://backend-production-311e.up.railway.app
- [ ] Browser cache cleared (or try incognito mode)
- [ ] Frontend is using correct backend URL in VITE_API_URL
