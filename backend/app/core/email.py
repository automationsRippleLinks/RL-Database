"""Transactional email over SMTP (STARTTLS), and the bodies of the auth emails."""

import aiosmtplib

from email.message import EmailMessage
from app.core.config import settings


async def send_email(to: str, subject: str, html_body: str, text_body: str) -> None:
    """Send one email with a plain-text part and an HTML alternative.
    
    Auth routes run this as a background task, so failures don't reach the caller.
    """
    message = EmailMessage()
    message["From"] = settings.SMTP_FROM
    message["To"] = to
    message["Subject"] = subject
    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")

    await aiosmtplib.send(
        message,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USER,
        password=settings.SMTP_PASSWORD,
        start_tls=True,
    )


def verification_email_body(name: str, verify_url: str) -> tuple[str, str]:
    """(text, html) for the verify-your-email message."""
    text = (
        f"Hi {name},\n\n"
        f"Verify your RippleLinks email for Ripple Pulse account:\n{verify_url}\n\n"
        f"This link expires in {int(settings.EMAIL_VERIFICATION_CACHE_TTL / 3600)} hours."
    )

    html = f"""\
        <!DOCTYPE html>
        <html lang="en">
        <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify your RippleLinks email for Ripple Pulse account</title>
        </head>
        <body style="margin:0; padding:0; background-color:#EEF3F8; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#EEF3F8; padding:32px 16px;">
            <tr>
            <td align="center">
                <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="max-width:480px; width:100%; background-color:#FFFFFF; border-radius:16px; overflow:hidden;">

                <!-- Logo header -->
                <tr>
                    <td align="center" style="padding:40px 40px 0 40px;">
                    <img src="{settings.RL_LOGO_CDN_URL}" width="88" height="88" alt="RippleLinks"
                        style="display:block; width:88px; height:88px; border:0; outline:none; text-decoration:none;">
                    </td>
                </tr>

                <!-- Heading -->
                <tr>
                    <td align="center" style="padding:24px 40px 0 40px;">
                    <h1 style="margin:0; font-size:22px; line-height:1.3; color:#0F1B2D; font-weight:700;">
                        Confirm your email
                    </h1>
                    </td>
                </tr>

                <!-- Body copy -->
                <tr>
                    <td align="center" style="padding:12px 40px 0 40px;">
                    <p style="margin:0; font-size:15px; line-height:1.6; color:#5B6B7C;">
                        Hi {name}, welcome aboard. Tap the button below to verify your account and start using Ripple Pulse.
                    </p>
                    </td>
                </tr>

                <!-- CTA button -->
                <tr>
                    <td align="center" style="padding:28px 40px 0 40px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                        <td align="center" bgcolor="#1B6FA8" style="border-radius:10px; background:linear-gradient(135deg,#1B6FA8,#2FB8AC);">
                            <a href="{verify_url}" target="_blank"
                            style="display:inline-block; padding:14px 32px; font-size:15px; font-weight:600; color:#FFFFFF; text-decoration:none; border-radius:10px;">
                            Verify my account
                            </a>
                        </td>
                        </tr>
                    </table>
                    </td>
                </tr>

                <!-- Expiry note -->
                <tr>
                    <td align="center" style="padding:20px 40px 0 40px;">
                    <p style="margin:0; font-size:13px; line-height:1.5; color:#8B98A6;">
                        This link expires in {int(settings.EMAIL_VERIFICATION_CACHE_TTL / 3600)} hours.
                    </p>
                    </td>
                </tr>

                <!-- Divider -->
                <tr>
                    <td style="padding:32px 40px 0 40px;">
                    <div style="border-top:1px solid #E7EDF3;"></div>
                    </td>
                </tr>

                <!-- Fallback link -->
                <tr>
                    <td align="center" style="padding:20px 40px 40px 40px;">
                    <p style="margin:0 0 8px 0; font-size:12px; color:#8B98A6;">
                        Button not working? Paste this link into your browser:
                    </p>
                        <a href="{verify_url}" target="_blank" style="font-size:12px; color:#1B6FA8; word-break:break-all; text-decoration:none;">
                        {verify_url}
                        </a>
                    </td>
                </tr>

                </table>

                <!-- Footer -->
                <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="max-width:480px; width:100%;">
                <tr>
                    <td align="center" style="padding:20px 40px;">
                    <p style="margin:0; font-size:12px; color:#A9B4BF;">
                        If you didn't create a Ripple Pulse account, you can ignore this email.
                    </p>
                    </td>
                </tr>
                </table>

            </td>
            </tr>
        </table>
        </body>
        </html>
        """
    return (text, html)


def password_reset_email_body(name: str, reset_url: str) -> tuple[str, str]:
    """(text, html) for the password-reset message."""
    text = (
        f"Hi {name},\n\n"
        f"Reset password of your Ripple Pulse account:\n{reset_url}\n\n"
        f"This link expires in {int(settings.PASSWORD_RESET_CACHE_TTL / 60)} minutes."
    )

    html = f"""\
        <!DOCTYPE html>
        <html lang="en">
        <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset password of your Ripple Pulse account</title>
        </head>
        <body style="margin:0; padding:0; background-color:#EEF3F8; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#EEF3F8; padding:32px 16px;">
            <tr>
            <td align="center">
                <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="max-width:480px; width:100%; background-color:#FFFFFF; border-radius:16px; overflow:hidden;">

                <!-- Logo header -->
                <tr>
                    <td align="center" style="padding:40px 40px 0 40px;">
                    <img src="{settings.RL_LOGO_CDN_URL}" width="88" height="88" alt="RippleLinks"
                        style="display:block; width:88px; height:88px; border:0; outline:none; text-decoration:none;">
                    </td>
                </tr>

                <!-- Heading -->
                <tr>
                    <td align="center" style="padding:24px 40px 0 40px;">
                    <h1 style="margin:0; font-size:22px; line-height:1.3; color:#0F1B2D; font-weight:700;">
                        Reset your password
                    </h1>
                    </td>
                </tr>

                <!-- Body copy -->
                <tr>
                    <td align="center" style="padding:12px 40px 0 40px;">
                    <p style="margin:0; font-size:15px; line-height:1.6; color:#5B6B7C;">
                        Hi {name}, Tap the button below to reset the password.
                    </p>
                    </td>
                </tr>

                <!-- CTA button -->
                <tr>
                    <td align="center" style="padding:28px 40px 0 40px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                        <td align="center" bgcolor="#1B6FA8" style="border-radius:10px; background:linear-gradient(135deg,#1B6FA8,#2FB8AC);">
                            <a href="{reset_url}" target="_blank"
                            style="display:inline-block; padding:14px 32px; font-size:15px; font-weight:600; color:#FFFFFF; text-decoration:none; border-radius:10px;">
                            Reset Password
                            </a>
                        </td>
                        </tr>
                    </table>
                    </td>
                </tr>

                <!-- Expiry note -->
                <tr>
                    <td align="center" style="padding:20px 40px 0 40px;">
                    <p style="margin:0; font-size:13px; line-height:1.5; color:#8B98A6;">
                        This link expires in {int(settings.PASSWORD_RESET_CACHE_TTL / 60)} minutes.
                    </p>
                    </td>
                </tr>

                <!-- Divider -->
                <tr>
                    <td style="padding:32px 40px 0 40px;">
                    <div style="border-top:1px solid #E7EDF3;"></div>
                    </td>
                </tr>

                <!-- Fallback link -->
                <tr>
                    <td align="center" style="padding:20px 40px 40px 40px;">
                    <p style="margin:0 0 8px 0; font-size:12px; color:#8B98A6;">
                        Button not working? Paste this link into your browser:
                    </p>
                        <a href="{reset_url}" target="_blank" style="font-size:12px; color:#1B6FA8; word-break:break-all; text-decoration:none;">
                        {reset_url}
                        </a>
                    </td>
                </tr>

                </table>

                <!-- Footer -->
                <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="max-width:480px; width:100%;">
                <tr>
                    <td align="center" style="padding:20px 40px;">
                    <p style="margin:0; font-size:12px; color:#A9B4BF;">
                        If you have already reset the password of your Ripple Pulse account, you can ignore this email.
                    </p>
                    </td>
                </tr>
                </table>

            </td>
            </tr>
        </table>
        </body>
        </html>
        """
    return (text, html)
