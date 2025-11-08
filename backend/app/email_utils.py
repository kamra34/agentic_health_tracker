"""
Email utility functions for sending emails via Brevo HTTP API.
Uses HTTP API instead of SMTP to avoid firewall/port blocking issues.
"""
import requests
from typing import Optional
import logging

from .config import settings

logger = logging.getLogger(__name__)


def send_email(
    to_email: str,
    subject: str,
    body_html: str,
    body_text: Optional[str] = None
) -> bool:
    """
    Send an email using Brevo HTTP API.

    Args:
        to_email: Recipient email address
        subject: Email subject line
        body_html: HTML content of the email
        body_text: Plain text alternative (optional)

    Returns:
        True if email sent successfully, False otherwise
    """
    # Check if Brevo is configured
    if not settings.brevo_api_key:
        logger.info("Brevo not configured. Set BREVO_API_KEY environment variable.")
        return False

    if not settings.email_from:
        logger.warning("EMAIL_FROM not set. Please configure sender email address.")
        return False

    logger.info(f"Attempting to send email to {to_email} via Brevo API")

    # Brevo API endpoint
    url = "https://api.brevo.com/v3/smtp/email"

    # Request headers
    headers = {
        "accept": "application/json",
        "api-key": settings.brevo_api_key,
        "content-type": "application/json"
    }

    # Email payload
    payload = {
        "sender": {
            "name": settings.email_from_name,
            "email": settings.email_from
        },
        "to": [
            {
                "email": to_email,
                "name": to_email.split('@')[0]  # Use email username as display name
            }
        ],
        "subject": subject,
        "htmlContent": body_html
    }

    # Add text content if provided
    if body_text:
        payload["textContent"] = body_text

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=10)

        if response.status_code == 201:
            logger.info(f"Email sent successfully to {to_email} via Brevo")
            return True
        else:
            logger.error(f"Brevo API error: {response.status_code} - {response.text}")
            return False

    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {str(e)}")
        return False


def send_username_recovery_email(to_email: str, username: str) -> bool:
    """
    Send username recovery email.

    Args:
        to_email: User's email address
        username: User's username

    Returns:
        True if email sent successfully, False otherwise
    """
    subject = "Your Weight Tracker Username"

    body_html = f"""
    <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
                <h1 style="color: white; margin: 0;">Weight Tracker</h1>
            </div>
            <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
                <h2 style="color: #333; margin-top: 0;">Username Recovery</h2>
                <p style="color: #666; font-size: 16px; line-height: 1.6;">
                    You requested to retrieve your username for your Weight Tracker account.
                </p>
                <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #667eea; margin: 20px 0;">
                    <p style="color: #666; margin: 0;">Your username is:</p>
                    <p style="font-size: 24px; font-weight: bold; color: #667eea; margin: 10px 0;">
                        {username}
                    </p>
                </div>
                <p style="color: #666; font-size: 14px; line-height: 1.6;">
                    You can now use this username to log in to your account.
                </p>
                <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
                <p style="color: #999; font-size: 12px; line-height: 1.6;">
                    If you didn't request this information, please ignore this email or contact support if you're concerned about your account security.
                </p>
            </div>
        </body>
    </html>
    """

    body_text = f"""
    Weight Tracker - Username Recovery

    You requested to retrieve your username for your Weight Tracker account.

    Your username is: {username}

    You can now use this username to log in to your account.

    If you didn't request this information, please ignore this email.
    """

    return send_email(to_email, subject, body_html, body_text)


def send_password_reset_link_email(to_email: str, reset_url: str) -> bool:
    """
    Send password reset link email.

    Args:
        to_email: User's email address
        reset_url: Full URL with reset token

    Returns:
        True if email sent successfully, False otherwise
    """
    subject = "Reset Your Weight Tracker Password"

    body_html = f"""
    <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
                <h1 style="color: white; margin: 0;">Weight Tracker</h1>
            </div>
            <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
                <h2 style="color: #333; margin-top: 0;">Password Reset Request</h2>
                <p style="color: #666; font-size: 16px; line-height: 1.6;">
                    You requested to reset your password for your Weight Tracker account.
                </p>
                <p style="color: #666; font-size: 16px; line-height: 1.6;">
                    Click the button below to reset your password. This link will expire in 15 minutes.
                </p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{reset_url}" style="display: inline-block; padding: 15px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                        Reset Password
                    </a>
                </div>
                <p style="color: #999; font-size: 14px; line-height: 1.6;">
                    Or copy and paste this link into your browser:
                </p>
                <p style="color: #667eea; font-size: 12px; word-break: break-all; background: white; padding: 10px; border-radius: 4px; border: 1px solid #ddd;">
                    {reset_url}
                </p>
                <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
                <p style="color: #999; font-size: 12px; line-height: 1.6;">
                    If you didn't request this password reset, please ignore this email. Your password will not be changed.
                </p>
                <p style="color: #999; font-size: 12px; line-height: 1.6;">
                    For security reasons, this link will expire in 15 minutes.
                </p>
            </div>
        </body>
    </html>
    """

    body_text = f"""
    Weight Tracker - Password Reset Request

    You requested to reset your password for your Weight Tracker account.

    Click the link below to reset your password (expires in 15 minutes):
    {reset_url}

    If you didn't request this password reset, please ignore this email.
    """

    return send_email(to_email, subject, body_html, body_text)


def send_password_reset_confirmation_email(to_email: str, username: str, new_password: str = None, password_hash: str = None) -> bool:
    """
    Send password reset confirmation email.

    Args:
        to_email: User's email address
        username: User's username
        new_password: New password (for debugging only, will be removed)
        password_hash: Password hash (for debugging only, will be removed)

    Returns:
        True if email sent successfully, False otherwise
    """
    subject = "Your Password Has Been Reset"

    # DEBUG INFO - REMOVE IN PRODUCTION
    debug_info = ""
    if new_password or password_hash:
        debug_info = f"""
                <div style="background: #fff3cd; border: 2px solid #ffc107; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <p style="color: #856404; font-weight: bold; margin: 0 0 10px 0;">⚠️ DEBUG INFO (TEMPORARY - WILL BE REMOVED)</p>
                    <p style="color: #856404; font-size: 12px; margin: 5px 0; word-break: break-all;">
                        <strong>New Password:</strong> {new_password if new_password else 'N/A'}
                    </p>
                    <p style="color: #856404; font-size: 12px; margin: 5px 0; word-break: break-all;">
                        <strong>Password Hash:</strong> {password_hash if password_hash else 'N/A'}
                    </p>
                </div>
        """

    body_html = f"""
    <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
                <h1 style="color: white; margin: 0;">Weight Tracker</h1>
            </div>
            <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
                <h2 style="color: #333; margin-top: 0;">Password Reset Successful</h2>
                <p style="color: #666; font-size: 16px; line-height: 1.6;">
                    Your password for username <strong>{username}</strong> has been successfully reset.
                </p>
                <p style="color: #666; font-size: 16px; line-height: 1.6;">
                    You can now log in with your new password.
                </p>
                {debug_info}
                <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
                <p style="color: #999; font-size: 12px; line-height: 1.6;">
                    If you didn't make this change, please contact support immediately to secure your account.
                </p>
            </div>
        </body>
    </html>
    """

    debug_text = ""
    if new_password or password_hash:
        debug_text = f"""
⚠️ DEBUG INFO (TEMPORARY - WILL BE REMOVED)
New Password: {new_password if new_password else 'N/A'}
Password Hash: {password_hash if password_hash else 'N/A'}
"""

    body_text = f"""
    Weight Tracker - Password Reset Successful

    Your password for username {username} has been successfully reset.

    You can now log in with your new password.

    {debug_text}

    If you didn't make this change, please contact support immediately.
    """

    return send_email(to_email, subject, body_html, body_text)
