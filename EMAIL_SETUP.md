# Email Configuration Guide

This guide explains how to set up email functionality for the Weight Tracker application. Email is used for:
- Username recovery (forgot username)
- Password reset confirmation

## Gmail Setup (Recommended)

### 1. Enable 2-Step Verification

1. Go to your Google Account: https://myaccount.google.com/
2. Navigate to **Security**
3. Enable **2-Step Verification** if not already enabled

### 2. Generate App Password

1. Go to **Security** > **2-Step Verification**
2. Scroll down to **App passwords**
3. Click **Select app** → Choose "Mail"
4. Click **Select device** → Choose "Other" → Enter "Weight Tracker"
5. Click **Generate**
6. Copy the 16-character password (e.g., `abcd efgh ijkl mnop`)

### 3. Configure Railway Environment Variables

Go to your Railway backend service and add these environment variables:

```bash
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-16-char-app-password
EMAIL_FROM=your-email@gmail.com
```

**Important Notes:**
- Use the 16-character app password, NOT your regular Gmail password
- Remove spaces from the app password when entering it
- `EMAIL_FROM` should match `SMTP_USER` for Gmail

### 4. Deploy and Test

1. Railway will automatically redeploy with new environment variables
2. Test the forgot username feature from your frontend
3. Check if email is received

## Alternative Email Providers

### SendGrid

```bash
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=your-sendgrid-api-key
EMAIL_FROM=noreply@yourdomain.com
```

### AWS SES

```bash
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=your-aws-smtp-username
SMTP_PASSWORD=your-aws-smtp-password
EMAIL_FROM=noreply@yourdomain.com
```

### Outlook/Office 365

```bash
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=your-email@outlook.com
SMTP_PASSWORD=your-password
EMAIL_FROM=your-email@outlook.com
```

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SMTP_HOST` | No | `smtp.gmail.com` | SMTP server hostname |
| `SMTP_PORT` | No | `587` | SMTP server port (usually 587 for TLS) |
| `SMTP_USER` | Yes* | None | SMTP username (usually your email) |
| `SMTP_PASSWORD` | Yes* | None | SMTP password or app password |
| `EMAIL_FROM` | No | Same as `SMTP_USER` | Email address to send from |
| `EMAIL_FROM_NAME` | No | `Weight Tracker` | Display name for sender |

*Required for email functionality to work. If not set, username will be displayed in response instead.

## Testing Email Functionality

### 1. Test Username Recovery

1. Go to `/forgot-password` on your frontend
2. Switch to "Forgot Username" tab
3. Enter an email address associated with an account
4. Click "Retrieve Username"
5. Check your email inbox for the username recovery email

### 2. Check Logs

If email is not received, check Railway logs:

1. Go to Railway dashboard
2. Select your backend service
3. Click **Logs**
4. Look for email-related warnings or errors

Common issues:
- `Email not configured` → Environment variables not set
- `Authentication failed` → Wrong username/password
- `Connection refused` → Wrong SMTP host/port

## Fallback Behavior

If email is not configured:
- Username recovery will still work but display the username in the response
- Password reset will work but skip sending confirmation email
- Users will see appropriate messages

## Security Best Practices

1. **Never commit credentials**: Keep email credentials in environment variables only
2. **Use app passwords**: For Gmail, always use app passwords, not regular passwords
3. **Enable 2FA**: Enable two-factor authentication on your email account
4. **Monitor usage**: Check for unusual email sending activity
5. **Rate limiting**: Consider adding rate limiting to prevent abuse
6. **CAPTCHA**: Consider adding CAPTCHA to recovery endpoints in production

## Troubleshooting

### Email not received

1. Check spam/junk folder
2. Verify `SMTP_USER` and `EMAIL_FROM` are correct
3. Check Railway logs for errors
4. Test with a different email provider if Gmail blocks it

### Authentication errors

1. For Gmail: Make sure you're using an app password, not regular password
2. Verify 2-Step Verification is enabled
3. Check that credentials are entered correctly (no extra spaces)

### Connection refused

1. Check firewall settings
2. Verify SMTP port is correct (usually 587)
3. Try alternative port (465 for SSL, 25 for unencrypted)

## Future Enhancements

For production deployment, consider:
1. **Token-based password reset**: Send secure reset links instead of direct password change
2. **Email templates**: Use professional HTML email templates
3. **Email verification**: Verify email addresses during signup
4. **Rate limiting**: Limit password reset attempts
5. **Email service**: Use dedicated email service like SendGrid or AWS SES
6. **Bounce handling**: Handle bounced emails and invalid addresses

## Cost Considerations

### Gmail (Free Tier)
- Free for personal use
- 500 emails per day limit
- Sufficient for small applications

### SendGrid
- Free: 100 emails/day
- Essentials: $19.95/month for 50k emails
- Recommended for production

### AWS SES
- $0.10 per 1,000 emails
- Very cost-effective for high volume
- Requires AWS account setup

## Getting Help

If you encounter issues:
1. Check Railway logs for error messages
2. Test SMTP credentials with a mail client
3. Review email provider's documentation
4. Check firewall and network settings
