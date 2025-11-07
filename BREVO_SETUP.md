# Brevo Email Setup Guide (5 Minutes)

Brevo (formerly SendinBlue) provides 300 free emails per day via HTTP API, which works perfectly with Railway (no SMTP port blocking issues).

## Why Brevo?

✅ **300 emails/day FREE**
✅ **No SMTP** - uses HTTP API (Railway compatible)
✅ **No 2-Step Verification** required
✅ **Professional** - reliable email delivery
✅ **Easy setup** - just an API key

---

## Step 1: Create Brevo Account (2 minutes)

1. Go to: https://www.brevo.com/
2. Click **"Sign up free"** (top right)
3. Fill in your details:
   - Email address
   - Password
   - Company name (can be "Personal" or your name)
4. Click **"Create Account"**
5. Check your email and verify your account

---

## Step 2: Get API Key (1 minute)

1. Log in to Brevo dashboard
2. Click your name (top right) → **"SMTP & API"**
3. Click on **"API Keys"** tab
4. Click **"Generate a new API key"**
5. Give it a name: **"Weight Tracker"**
6. Click **"Generate"**
7. **IMPORTANT:** Copy the API key immediately (you can't see it again!)
   - It looks like: `xkeysib-a7f5e...long-string...4f2e9`

---

## Step 3: Verify Sender Email (1 minute)

Before you can send emails, you need to verify your sender email address.

### Option A: Use Your Email (Recommended)

1. In Brevo dashboard, go to **"Senders, Domains & Dedicated IPs"**
2. Click **"Add a sender"**
3. Enter:
   - **Email**: Your email (e.g., `kr.nosrati@gmail.com`)
   - **Name**: Weight Tracker
4. Click **"Save"**
5. Check your email inbox for verification link
6. Click the link to verify

### Option B: Use Brevo's Free Domain

Brevo provides a free sending domain, but emails might go to spam more often. Only use this for testing.

---

## Step 4: Add to Railway (1 minute)

1. Go to Railway dashboard: https://railway.app/dashboard
2. Select your **backend service**
3. Click **"Variables"** tab
4. Add these TWO variables:

### Variable 1: BREVO_API_KEY
```
xkeysib-your-actual-api-key-here-from-step-2
```

### Variable 2: EMAIL_FROM
```
kr.nosrati@gmail.com
```
(Or whatever email you verified in Step 3)

5. Click **"Add"** for each variable
6. Railway will automatically redeploy (~3 minutes)

---

## Step 5: Test It! (1 minute)

After Railway finishes deploying:

1. Go to your frontend: https://agentic-health-tracker.vercel.app/forgot-password
2. Switch to **"Forgot Username"** tab
3. Enter an email associated with your account (e.g., `kr.nosrati@gmail.com`)
4. Click **"Retrieve Username"**
5. Check your email inbox!

### Expected Email

You should receive an email that looks like:

**Subject:** Your Weight Tracker Username

**From:** Weight Tracker <kr.nosrati@gmail.com>

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

### Email not received

1. **Check spam/junk folder** - First-time emails might be flagged
2. **Verify sender email** - Make sure you clicked the verification link in Step 3
3. **Check Railway logs**:
   - Railway dashboard → Your service → **Logs**
   - Look for: `"Email sent successfully to ... via Brevo"` ✅
   - Or: `"Brevo API error: ..."` ❌

4. **Check Brevo dashboard**:
   - Go to: https://app.brevo.com/
   - Click **"Statistics"** → **"Email"**
   - You should see sent emails listed

### "API error: 401 Unauthorized"

❌ **Problem:** API key is incorrect or not set
✅ **Solution:**
- Check Railway variable `BREVO_API_KEY` is set correctly
- Make sure you copied the full API key from Brevo
- API key should start with `xkeysib-`

### "API error: 400 Bad Request - Invalid sender"

❌ **Problem:** Sender email not verified in Brevo
✅ **Solution:**
- Go to Brevo → Senders
- Make sure your email has a green checkmark (verified)
- Check your email for the verification link

### "Brevo not configured"

❌ **Problem:** Railway environment variables not set
✅ **Solution:**
- Verify both `BREVO_API_KEY` and `EMAIL_FROM` are set in Railway
- Wait for Railway to finish redeploying
- Check logs to confirm new deployment

### Still showing fallback message

If you see: `"Email service not configured. Your username is: Kamiar"`

This means:
- ❌ Either `BREVO_API_KEY` or `EMAIL_FROM` is missing in Railway
- ✅ But the fallback is working correctly (users can still retrieve username)

**Fix:** Add the missing variable(s) in Railway

---

## Testing Password Reset

Password reset also sends confirmation emails:

1. Go to: https://agentic-health-tracker.vercel.app/forgot-password
2. Stay on **"Reset Password"** tab
3. Enter your email and new password
4. Click **"Reset Password"**
5. You should receive a confirmation email

---

## Brevo Dashboard Features

Useful things you can do in the Brevo dashboard:

### View Email Statistics
- Go to: **Statistics** → **Email**
- See how many emails were sent, opened, clicked
- Monitor delivery rates

### View Individual Emails
- Go to: **Transactional** → **Logs**
- See every email that was sent
- Check delivery status
- Debug issues

### Email Templates (Optional)
- Go to: **Campaigns** → **Templates**
- Create custom email templates
- Use Brevo's drag-and-drop editor

---

## Cost & Limits

### Free Tier (What You Get)
- ✅ **300 emails per day** - plenty for personal use
- ✅ **Unlimited contacts**
- ✅ **Email support**
- ✅ **API access**
- ✅ **No credit card required**

### If You Need More

If 300 emails/day isn't enough:

**Lite Plan - €9/month:**
- 5,000 emails/month
- No daily sending limit
- Phone support

**Essential Plan - €19/month:**
- 10,000 emails/month
- Advanced statistics
- A/B testing

### For Your App

300 emails/day means:
- **Password resets:** ~150/day (assuming each user gets 1-2 emails)
- **Username recovery:** ~150/day
- **Total:** More than enough for a personal app!

---

## Security Best Practices

1. ✅ **Never commit API key to git** - Always use environment variables
2. ✅ **Rotate API keys periodically** - Generate new key every 6 months
3. ✅ **Monitor usage** - Check Brevo dashboard for unusual activity
4. ✅ **Use verified sender** - Prevents emails going to spam
5. ✅ **Keep sender email private** - Don't expose it publicly

---

## Fallback Behavior

If Brevo fails for any reason, the system automatically falls back to displaying the username:

```json
{
  "message": "Email service not configured. Your username is: Kamiar",
  "username": "Kamiar"
}
```

This ensures users can always recover their username, even if email is down.

---

## Alternative: If Brevo Doesn't Work

If you have issues with Brevo, here are alternatives:

### SendGrid
- 100 emails/day free
- Similar setup process
- Docs: https://sendgrid.com/

### Mailgun
- 5,000 emails/month free (first 3 months)
- Then 0.80€/1000 emails
- Docs: https://www.mailgun.com/

### Resend
- 100 emails/day free
- Modern API
- Docs: https://resend.com/

---

## Next Steps After Setup

Once email is working:

1. ✅ **Test both endpoints** (forgot username + reset password)
2. ✅ **Check spam folder** initially
3. ✅ **Monitor Brevo dashboard** for delivery rates
4. ✅ **Remove old Gmail variables** from Railway (if you set SMTP_USER/SMTP_PASSWORD)

---

## Quick Reference

### Railway Variables Needed
```
BREVO_API_KEY=xkeysib-your-api-key-here
EMAIL_FROM=your-verified-email@domain.com
```

### Brevo Dashboard URLs
- Main dashboard: https://app.brevo.com/
- API Keys: https://app.brevo.com/settings/keys/api
- Senders: https://app.brevo.com/settings/senders
- Email logs: https://app.brevo.com/transactional/logs

### Support
- Brevo help center: https://help.brevo.com/
- API docs: https://developers.brevo.com/

---

## Summary Checklist

Before testing, make sure you've done:

- [ ] Created Brevo account
- [ ] Generated API key
- [ ] Verified sender email in Brevo
- [ ] Added `BREVO_API_KEY` to Railway
- [ ] Added `EMAIL_FROM` to Railway
- [ ] Waited for Railway to redeploy (~3 minutes)
- [ ] Tested forgot-username feature
- [ ] Checked email inbox (and spam folder)

---

That's it! Email should now work perfectly with no SMTP port blocking issues. 🎉
