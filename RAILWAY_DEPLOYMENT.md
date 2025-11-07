# 🚂 Railway Deployment Guide

## Quick Start (5 minutes to deployment)

### 1. Prerequisites
- GitHub account
- Railway account (sign up at railway.app)
- Your code pushed to GitHub

### 2. Deploy Database

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click **"New Project"**
3. Select **"Provision PostgreSQL"**
4. Railway creates database automatically
5. Note: DATABASE_URL is available as `${{Postgres.DATABASE_URL}}`

### 3. Deploy Backend

1. In same project, click **"New Service"**
2. Select **"GitHub Repo"**
3. Choose your `weight-tracker` repository
4. Railway detects `Dockerfile` automatically

**Configure Service:**
- Root Directory: `backend`
- Add Environment Variables:
  ```
  DATABASE_URL=${{Postgres.DATABASE_URL}}
  SECRET_KEY=generate-random-32-char-string-here
  CORS_ORIGINS=http://localhost:5173,http://localhost:3000,https://your-frontend-domain.vercel.app
  OPENAI_API_KEY=your-openai-api-key-here
  ACCESS_TOKEN_EXPIRE_MINUTES=10080
  DEBUG=False
  ```

**Important Notes:**
- `CORS_ORIGINS` must be a comma-separated list of allowed origins (no spaces after commas)
- Make sure to replace `https://your-frontend-domain.vercel.app` with your actual Vercel URL
- The OpenAI API key is required for the AI chat functionality
- After deploying frontend, come back and update `CORS_ORIGINS` with the actual Vercel URL

5. Click **"Deploy"**
6. Railway builds and deploys automatically
7. Copy the generated URL (e.g., `https://weight-tracker-backend.railway.app`)

### 4. Deploy Frontend (Option A: Railway)

1. Click **"New Service"** in same project
2. Select your GitHub repo again
3. Configure:
   - Root Directory: `frontend`
   - Build Command: `npm run build`
   - Start Command: `npm run preview`
   - Environment Variables:
     ```
     VITE_API_URL=https://your-backend-url.railway.app
     ```

4. Deploy!

### 4. Deploy Frontend (Option B: Vercel - Recommended)

1. Go to [Vercel Dashboard](https://vercel.com)
2. Click **"New Project"**
3. Import your GitHub repository
4. Configure:
   - Framework Preset: Vite
   - Root Directory: `frontend`
   - Environment Variables:
     ```
     VITE_API_URL=https://your-backend-url.railway.app
     ```
5. Click **"Deploy"**

### 5. Update CORS (IMPORTANT!)

After your frontend is deployed and you have the Vercel URL:

1. Go back to Railway dashboard
2. Select your backend service
3. Go to **Variables** tab
4. Update `CORS_ORIGINS` to include your actual Vercel URL:
   ```
   CORS_ORIGINS=http://localhost:5173,http://localhost:3000,https://agentic-health-tracker.vercel.app
   ```
   **Note:** Replace `agentic-health-tracker.vercel.app` with your actual Vercel domain
5. Service will automatically redeploy with new CORS settings
6. Wait for deployment to complete (~2-3 minutes)

### 6. Configure Email (Optional but Recommended)

Email is used for username recovery and password reset confirmations.

See [EMAIL_SETUP.md](EMAIL_SETUP.md) for detailed instructions.

Quick setup for Gmail:
1. Generate Gmail app password
2. Add to Railway environment variables:
   ```
   SMTP_USER=your-email@gmail.com
   SMTP_PASSWORD=your-app-password
   EMAIL_FROM=your-email@gmail.com
   ```
3. Service will automatically redeploy

**Note**: If email is not configured, username recovery will still work but display the username in the response instead of sending it via email.

### 7. Test Your App!

Visit your frontend URL and:
- Sign up for an account
- Add some weight entries
- Set a target goal
- Explore the dashboard
- Test forgot password/username features

## 🔧 Troubleshooting

### Backend won't start
- Check DATABASE_URL is correctly set
- Verify SECRET_KEY is at least 32 characters
- Check Railway logs for errors

### Frontend can't connect to backend
- Verify VITE_API_URL is correct
- Check CORS_ORIGINS includes frontend URL
- Open browser console for errors

### Database connection errors
- Ensure Postgres service is running
- Check DATABASE_URL format
- Verify network settings in Railway

## 💰 Cost Estimate

**Railway (Backend + DB):**
- Free tier: $5 credit/month
- After free tier: ~$10-15/month
- Scales automatically with usage

**Vercel (Frontend):**
- Hobby plan: FREE
- Pro plan: $20/month (only if needed)

**Total: $0-15/month**

## 🔄 Automatic Deployments

Once connected to GitHub:
- Push to `main` branch → Auto-deploy
- Pull requests → Preview deployments
- Rollback available with one click

## 📊 Monitoring

**Railway provides:**
- Deployment logs
- Resource usage metrics
- Uptime monitoring
- Crash detection

**Access logs:**
1. Click on service in Railway
2. Go to "Deployments" tab
3. Click on latest deployment
4. View real-time logs

## 🎯 Production Checklist

Before going live:
- [ ] Use strong SECRET_KEY (32+ random characters)
- [ ] Set DEBUG=False in backend
- [ ] Configure proper CORS_ORIGINS
- [ ] Test all API endpoints
- [ ] Test authentication flow
- [ ] Backup database
- [ ] Set up monitoring alerts
- [ ] Create admin user manually in database
- [ ] Document any custom setup steps

## 🚀 Advanced: Custom Domain

**Railway:**
1. Go to service settings
2. Click "Generate Domain" or "Custom Domain"
3. Add CNAME record in your DNS provider
4. SSL certificate auto-generated

**Vercel:**
1. Go to project settings
2. Click "Domains"
3. Add your domain
4. Update DNS records as instructed

## 📚 Additional Resources

- [Railway Docs](https://docs.railway.app)
- [Vercel Docs](https://vercel.com/docs)
- [FastAPI Deployment](https://fastapi.tiangolo.com/deployment/)
- [React Production Build](https://react.dev/learn/start-a-new-react-project)

---

**Need help?** Open an issue on GitHub or check Railway's support forum!
