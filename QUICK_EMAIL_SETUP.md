# Quick Email Setup with Gmail (5 Minutes)

## Step 1: Enable 2-Step Verification

1. Go to: https://myaccount.google.com/security
2. Find "2-Step Verification" section
3. Click "Get Started" and follow the prompts
4. Choose your verification method (phone is easiest)
5. Complete setup

## Step 2: Generate App Password

1. Go to: https://myaccount.google.com/apppasswords
   - If you don't see this option, make sure 2-Step Verification is enabled first
2. Under "Select app", choose **Mail**
3. Under "Select device", choose **Other (Custom name)**
4. Type: **Weight Tracker**
5. Click **Generate**
6. You'll see a 16-character password like: `abcd efgh ijkl mnop`
7. **IMPORTANT:** Copy this password - you can't see it again!

## Step 3: Add to Railway

1. Go to Railway dashboard: https://railway.app/dashboard
2. Select your backend service
3. Click **Variables** tab
4. Add these three variables:

   **SMTP_USER**
   ```
   your-email@gmail.com
   ```
   (Replace with your actual Gmail address)

   **SMTP_PASSWORD**
   ```
   abcdefghijklmnop
   ```
   (Replace with your 16-char app password - remove the spaces!)

   **EMAIL_FROM**
   ```
   your-email@gmail.com
   ```
   (Same as SMTP_USER)

5. Click **Save** or **Add** for each variable

## Step 4: Wait for Deployment

Railway will automatically redeploy your backend with the new email settings.
- Watch the **Deployments** tab
- Wait ~3 minutes for deployment to complete
- Check **Logs** to ensure no errors

## Step 5: Test It!

1. Go to your frontend: https://agentic-health-tracker.vercel.app/forgot-password
2. Switch to "Forgot Username" tab
3. Enter an email associated with an account
4. Click "Retrieve Username"
5. Check your email inbox!

## Expected Result

You should receive an email that looks like this:

---

**Subject:** Your Weight Tracker Username

**From:** Weight Tracker <your-email@gmail.com>

**Body:**

> ## Username Recovery
>
> You requested to retrieve your username for your Weight Tracker account.
>
> **Your username is: Kamiar**
>
> You can now use this username to log in to your account.

---

## Troubleshooting

### "App passwords" option not showing

**Solution:** Make sure 2-Step Verification is fully enabled. Sometimes it takes a few minutes to appear.

### Email not received

1. **Check spam folder** - Gmail might flag it initially
2. **Check Railway logs** - Look for email-related errors
3. **Verify variables** - Make sure SMTP_USER and SMTP_PASSWORD are set correctly
4. **Check app password** - Make sure you removed all spaces when entering it

### Railway logs show "Authentication failed"

**Solution:** Double-check that:
- You're using the app password, NOT your regular Gmail password
- The app password has no spaces
- The SMTP_USER matches your Gmail address exactly

### Still not working?

Check Railway logs for the exact error:
1. Railway dashboard → Your service → Logs
2. Look for lines with "email" or "SMTP"
3. Share the error message if you need help

## Alternative: Test Locally First

If you want to test before deploying, you can run locally:

1. Create `.env` file in `backend/` folder:
   ```
   SMTP_USER=your-email@gmail.com
   SMTP_PASSWORD=your-app-password
   EMAIL_FROM=your-email@gmail.com
   DATABASE_URL=your-local-db-url
   SECRET_KEY=your-secret-key
   ```

2. Run backend:
   ```bash
   cd backend
   uvicorn app.main:app --reload
   ```

3. Test the endpoint using the API docs:
   - Open: http://localhost:8000/docs
   - Find `/api/auth/forgot-username`
   - Click "Try it out"
   - Enter your test email
   - Click "Execute"
   - Check your email!

## Security Notes

✅ **Safe:**
- App passwords are designed for this purpose
- They only have access to send mail, not your full account
- You can revoke them anytime from Google settings

❌ **Never:**
- Commit the app password to git
- Share your app password publicly
- Use your regular Gmail password in the app

## Limits

Gmail free tier:
- **500 emails per day** - plenty for a personal app
- If you need more, consider upgrading or using a service like SendGrid

## Next Steps

After email is working:
1. Test password reset confirmation email
2. Consider adding email verification during signup (future enhancement)
3. Set up email templates for other notifications (future)

## Cost

**$0.00 per month** - Completely free for personal use!
