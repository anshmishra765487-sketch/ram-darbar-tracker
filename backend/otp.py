"""OTP codes sent by SMS to the account's registered mobile number.

6-digit code with expiry, attempt limit and resend cooldown. Delivery goes
through a real SMS gateway (see sms.py). If no gateway is configured the
request fails loudly instead of silently logging the code.
"""

from __future__ import annotations

import os
import secrets
import time

from dotenv import load_dotenv

load_dotenv()

OTP_LENGTH = int(os.getenv("OTP_LENGTH", "6"))
OTP_TTL_SECONDS = int(os.getenv("OTP_EXPIRE_SECONDS", "300"))
OTP_MAX_ATTEMPTS = int(os.getenv("OTP_MAX_ATTEMPTS", "5"))
OTP_RESEND_SECONDS = int(os.getenv("OTP_RESEND_SECONDS", "45"))

# key -> {"code", "expires_at", "attempts", "last_sent"}
_codes: dict[str, dict] = {}


class SmsError(RuntimeError):
    """Raised when the OTP SMS could not be delivered."""


def _now() -> float:
    return time.time()


def _live(entry: dict | None) -> bool:
    return bool(entry) and entry["expires_at"] > _now()


def cooldown_left(key: str) -> int:
    entry = _codes.get(key)
    if not entry:
        return 0
    return max(0, int(entry["last_sent"] + OTP_RESEND_SECONDS - _now()))


def generate(key: str) -> str:
    code = "".join(secrets.choice("0123456789") for _ in range(OTP_LENGTH))
    _codes[key] = {
        "code": code,
        "expires_at": _now() + OTP_TTL_SECONDS,
        "attempts": 0,
        "last_sent": _now(),
    }
    return code


def check(key: str, code: str) -> tuple[bool, str]:
    """(ok, message). The code is consumed - single use only."""
    entry = _codes.get(key)
    if not entry:
        return False, "Request an OTP first"
    if not _live(entry):
        _codes.pop(key, None)
        return False, "OTP expired, request a new one"

    entry["attempts"] += 1
    if entry["attempts"] > OTP_MAX_ATTEMPTS:
        _codes.pop(key, None)
        return False, "Too many wrong OTP attempts. Request a new code"

    if not secrets.compare_digest(entry["code"], (code or "").strip()):
        left = OTP_MAX_ATTEMPTS - entry["attempts"]
        return False, f"Wrong OTP ({left} attempts left)"

    _codes.pop(key, None)
    return True, "ok"


def clear(key: str | None = None) -> None:
    if key:
        _codes.pop(key, None)
    else:
        _codes.clear()


def minutes() -> int:
    return max(1, OTP_TTL_SECONDS // 60)


def send_sms(phone: str, code: str) -> str:
    import sms

    try:
        return sms.send(phone, code, minutes())
    except Exception as error:
        raise SmsError(str(error))