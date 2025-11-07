"""
Email utility functions for sending emails via SMTP.
Supports Gmail and other SMTP providers.
"""
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
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
    Send an email using configured SMTP settings.

    Args:
        to_email: Recipient email address
        subject: Email subject line
        body_html: HTML content of the email
        body_text: Plain text alternative (optional, auto-generated from HTML if not provided)

    Returns:
        True if email sent successfully, False otherwise
    """
    # Check if email is configured
    if not settings.smtp_user or not settings.smtp_password:
        logger.warning("Email not configured. Set SMTP_USER and SMTP_PASSWORD environment variables.")
        return False

    try:
        # Create message
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = f"{settings.email_from_name} <{settings.email_from or settings.smtp_user}>"
        msg['To'] = to_email

        # Attach plain text version (fallback)
        if body_text:
            part1 = MIMEText(body_text, 'plain')
            msg.attach(part1)

        # Attach HTML version
        part2 = MIMEText(body_html, 'html')
        msg.attach(part2)

        # Send email
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.starttls()  # Secure the connection
            server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)

        logger.info(f"Email sent successfully to {to_email}")
        return True

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


def send_password_reset_confirmation_email(to_email: str, username: str) -> bool:
    """
    Send password reset confirmation email.

    Args:
        to_email: User's email address
        username: User's username

    Returns:
        True if email sent successfully, False otherwise
    """
    subject = "Your Password Has Been Reset"

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
                <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
                <p style="color: #999; font-size: 12px; line-height: 1.6;">
                    If you didn't make this change, please contact support immediately to secure your account.
                </p>
            </div>
        </body>
    </html>
    """

    body_text = f"""
    Weight Tracker - Password Reset Successful

    Your password for username {username} has been successfully reset.

    You can now log in with your new password.

    If you didn't make this change, please contact support immediately.
    """

    return send_email(to_email, subject, body_html, body_text)
