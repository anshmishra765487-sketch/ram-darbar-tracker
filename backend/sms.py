"""SMS delivery for OTP.

Works without any SMS library (urllib + plain HTTP). Providers:
fast2sms | msg91 | twilio.

If no provider is configured, the OTP falls back to demo mode (when OTP_DEMO
is enabled): the code is returned to the client so it can be shown on screen.
When a real provider is configured, the code is never returned to the client.
"""

from __future__ import annotations

import base64
import json
import os
import urllib.parse
import urllib.request

from dotenv import load_dotenv

load_dotenv()

SMS_PROVIDER = os.getenv("SMS_PROVIDER", "").strip().lower()
SMS_ENABLED = SMS_PROVIDER in ("fast2sms", "msg91", "twilio")
# Demo mode: no gateway configured -> return the OTP to the client for on-screen display.
OTP_DEMO = os.getenv("OTP_DEMO", "1").strip().lower() not in ("0", "false", "no")

FAST2SMS_KEY = os.getenv("FAST2SMS_KEY", "").strip()
FAST2SMS_SENDER = os.getenv("FAST2SMS_SENDER", "TXTLNS").strip()
MSG91_AUTH_KEY = os.getenv("MSG91_AUTH_KEY", "").strip()
MSG91_TEMPLATE_ID = os.getenv("MSG91_TEMPLATE_ID", "").strip()
TWILIO_SID = os.getenv("TWILIO_SID", "").strip()
TWILIO_TOKEN = os.getenv("TWILIO_TOKEN", "").strip()
TWILIO_FROM = os.getenv("TWILIO_FROM", "").strip()

SMS_TEMPLATE = os.getenv(
    "SMS_TEMPLATE", "Ram Darbar Tracker: your login OTP is {code}. Valid for {minutes} min."
)


class SmsError(RuntimeError):
    pass


def _request(url: str, data: bytes | None = None, headers: dict | None = None) -> dict:
    request = urllib.request.Request(url, data=data, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            body = response.read().decode("utf-8", "ignore")
    except Exception as error:
        raise SmsError(f"{SMS_PROVIDER or 'sms'} request failed: {error}") from error
    try:
        return json.loads(body)
    except ValueError:
        return {"raw": body}


def _fast2sms(phone: str, code: str, minutes: int) -> None:
    if not FAST2SMS_KEY:
        raise SmsError("FAST2SMS_KEY is missing")
    payload = urllib.parse.urlencode(
        {
            "route": "v3",
            "sender_id": FAST2SMS_SENDER,
            "message": SMS_TEMPLATE.format(code=code, minutes=minutes),
            "language": "english",
            "numbers": phone[-10:],
        }
    ).encode()
    _request(f"https://www.fast2sms.com/dev/bulkV2?api_key={FAST2SMS_KEY}", payload)


def _msg91(phone: str, code: str, minutes: int) -> None:
    if not MSG91_AUTH_KEY or not MSG91_TEMPLATE_ID:
        raise SmsError("MSG91_AUTH_KEY / MSG91_TEMPLATE_ID is missing")
    payload = json.dumps(
        {
            "template_id": MSG91_TEMPLATE_ID,
            "short_url": "0",
            "short_url_ref": "0",
            "recipients": [{"mobiles": phone[-10:], "otp": code}],
        }
    ).encode()
    _request(
        "https://control.msg91.com/api/v5/flow/",
        payload,
        {"Content-Type": "application/json", "authkey": MSG91_AUTH_KEY},
    )


def _twilio(phone: str, code: str, minutes: int) -> None:
    if not (TWILIO_SID and TWILIO_TOKEN and TWILIO_FROM):
        raise SmsError("TWILIO_SID / TWILIO_TOKEN / TWILIO_FROM is missing")
    payload = urllib.parse.urlencode(
        {
            "To": f"+{phone}",
            "From": TWILIO_FROM,
            "Body": SMS_TEMPLATE.format(code=code, minutes=minutes),
        }
    ).encode()
    token = base64.b64encode(f"{TWILIO_SID}:{TWILIO_TOKEN}".encode()).decode()
    _request(
        f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_SID}/Messages.json",
        payload,
        {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": f"Basic {token}",
        },
    )


def send(phone: str, code: str, minutes: int) -> str:
    """Send the OTP SMS. Returns the channel: 'sms' or 'demo'."""
    if not phone:
        raise SmsError("Phone number missing")

    if not SMS_ENABLED:
        if OTP_DEMO:
            return "demo"
        raise SmsError(
            "SMS gateway not configured. Set SMS_PROVIDER to fast2sms, msg91 or twilio "
            "with the matching API keys."
        )

    if SMS_PROVIDER == "fast2sms":
        _fast2sms(phone, code, minutes)
    elif SMS_PROVIDER == "msg91":
        _msg91(phone, code, minutes)
    elif SMS_PROVIDER == "twilio":
        _twilio(phone, code, minutes)
    else:
        raise SmsError(f"Unsupported SMS_PROVIDER: {SMS_PROVIDER}")

    return "sms"