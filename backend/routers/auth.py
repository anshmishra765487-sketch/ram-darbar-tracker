"""Login endpoints (AUTH_REQUIRED=true par login screen, false par bypass)."""

import os
import time

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, status

from database import db, now_iso
from deps import current_user
from models import (
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    OtpRequest,
    OtpVerifyRequest,
    PasswordResetRequest,
    PhoneUpdate,
    SignupRequest,
    UserOut,
)
from security import create_access_token, hash_password, verify_password

import otp as otp_service

load_dotenv()

router = APIRouter(prefix="/api/auth", tags=["auth"])

DEFAULT_EMAIL = os.getenv("ADMIN_EMAIL", "owner@ramdarbar.com").strip().lower()

MAX_ATTEMPTS = int(os.getenv("LOGIN_MAX_ATTEMPTS", "5"))
LOCKOUT_SECONDS = int(os.getenv("LOGIN_LOCKOUT_SECONDS", "60"))

# identifier -> [failed_count, locked_until]
_failures: dict[str, list] = {}


def _lock_state(identifier: str) -> int:
    entry = _failures.get(identifier)
    if not entry:
        return 0
    if entry[1] and entry[1] > time.time():
        return int(entry[1] - time.time()) + 1
    return 0


def normalize_phone(value: str) -> str:
    """'+91 98765 43210' -> '919876543210'."""
    digits = "".join(ch for ch in (value or "") if ch.isdigit())
    if not digits:
        return ""
    if len(digits) == 10:
        return f"91{digits}"
    if digits.startswith("91") and len(digits) == 12:
        return digits
    return digits.lstrip("0")


def looks_like_phone(value: str) -> bool:
    return value.isdigit() and len(value) >= 10


async def find_user(identifier: str) -> dict | None:
    """Mobile number or email - dono se user dhundho."""
    value = (identifier or "").strip()
    if not value:
        return None
    if looks_like_phone(value):
        return await db.find_one("users", {"phone": normalize_phone(value)})
    return await db.find_one("users", {"email": value.lower()})


def _public_user(user: dict) -> UserOut:
    return UserOut(
        id=user["_id"],
        email=user.get("email", DEFAULT_EMAIL),
        name=user.get("name", "Owner"),
        phone=user.get("phone", ""),
    )


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest):
    identifier = (payload.identifier or payload.email or "").strip()
    if not identifier or not payload.password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mobile number and password are required")

    key = identifier.lower()
    wait = _lock_state(key)
    if wait:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Too many wrong attempts. Try again in {wait}s.",
            headers={"Retry-After": str(wait)},
        )

    user = await find_user(identifier)
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        entry = _failures.setdefault(key, [0, 0.0])
        entry[0] += 1
        if entry[0] >= MAX_ATTEMPTS:
            entry[1] = time.time() + LOCKOUT_SECONDS
            entry[0] = 0
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                f"Too many wrong attempts. Try again in {LOCKOUT_SECONDS}s.",
                headers={"Retry-After": str(LOCKOUT_SECONDS)},
            )
        left = MAX_ATTEMPTS - entry[0]
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            f"Wrong mobile number or password ({left} attempts left)",
        )

    _failures.pop(key, None)
    token = create_access_token(user["_id"], user.get("email", DEFAULT_EMAIL))
    return {"access_token": token, "token_type": "bearer", "user": _public_user(user)}


@router.post("/signup", response_model=LoginResponse)
async def signup(payload: SignupRequest):
    """Create a new account. Returns a token so the user lands straight in the app."""
    phone = normalize_phone(payload.phone)
    if len(phone) < 11:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Enter a valid 10-digit mobile number")

    if await db.find_one("users", {"phone": phone}):
        raise HTTPException(status.HTTP_409_CONFLICT, "This mobile number is already registered")

    email = (payload.email or "").strip().lower()
    if email:
        if await db.find_one("users", {"email": email}):
            raise HTTPException(status.HTTP_409_CONFLICT, "This email is already registered")
    else:
        email = f"user_{phone}@ramdarbar.local"

    name = payload.name.strip()
    user_id = await db.insert_one(
        "users",
        {
            "email": email,
            "phone": phone,
            "password_hash": hash_password(payload.password.strip()),
            "name": name,
            "role": "user",
            "created_at": now_iso(),
        },
    )
    token = create_access_token(user_id, email)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": UserOut(id=user_id, email=email, name=name, phone=phone),
    }


@router.post("/otp/request")
async def request_otp(payload: OtpRequest):
    """Send a login OTP by SMS to the account's registered mobile number."""
    identifier = (payload.identifier or "").strip()
    if not identifier:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Enter your mobile number")

    user = await find_user(identifier)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No account found for this mobile number")

    otp_key = f"user:{user['_id']}"
    wait = otp_service.cooldown_left(otp_key)
    if wait:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Wait {wait}s before requesting another OTP.",
            headers={"Retry-After": str(wait)},
        )

    phone = user.get("phone") or ""
    if not phone:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "This account has no mobile number. Add one from Account settings.",
        )

    code = otp_service.generate(otp_key)
    try:
        channel = otp_service.send_sms(phone, code)
    except otp_service.SmsError as error:
        otp_service.clear(otp_key)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"SMS could not be sent: {error}")

    response = {
        "sent": True,
        "via": "sms",
        "channel": channel,
        "sent_to": f"******{phone[-4:]}" if len(phone) >= 4 else phone,
        "expires_in": otp_service.OTP_TTL_SECONDS,
        "resend_after": otp_service.OTP_RESEND_SECONDS,
        "length": otp_service.OTP_LENGTH,
    }
    if channel == "demo":
        response["demo"] = True
        response["dev_code"] = code
    return response


@router.post("/otp/verify", response_model=LoginResponse)
async def verify_otp(payload: OtpVerifyRequest):
    """Correct code returns the same JWT token as password login."""
    identifier = (payload.identifier or "").strip()
    user = await find_user(identifier)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No account found for this mobile number")

    ok, message = otp_service.check(f"user:{user['_id']}", payload.code)
    if not ok:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, message)

    _failures.pop(user.get("email", DEFAULT_EMAIL), None)
    token = create_access_token(user["_id"], user.get("email", DEFAULT_EMAIL))
    return {"access_token": token, "token_type": "bearer", "user": _public_user(user)}


@router.post("/password-reset")
async def password_reset(payload: PasswordResetRequest):
    """Reset password with an SMS OTP - no login required."""
    if len(payload.new_password) < 6:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "New password must be at least 6 characters")

    identifier = (payload.identifier or "").strip()
    user = await find_user(identifier)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No account found for this mobile number")

    ok, message = otp_service.check(f"user:{user['_id']}", payload.code)
    if not ok:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, message)

    await db.update_one("users", user["_id"], {"password_hash": hash_password(payload.new_password)})
    return {"ok": True}


@router.put("/phone", response_model=UserOut)
async def save_phone(payload: PhoneUpdate, user: dict = Depends(current_user)):
    """Save your mobile number - SMS OTPs go here."""
    phone = normalize_phone(payload.phone)
    if len(phone) < 11:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Enter a valid 10-digit mobile number")

    taken = await db.find_one("users", {"phone": phone, "_id": {"$ne": user["_id"]}})
    if taken:
        raise HTTPException(status.HTTP_409_CONFLICT, "This number is already used by another account")

    await db.update_one("users", user["_id"], {"phone": phone})
    record = await db.find_one("users", {"_id": user["_id"]}) or user
    return _public_user(record)


@router.get("/me", response_model=UserOut)
async def me(user: dict = Depends(current_user)):
    return _public_user(user)


@router.post("/change-password")
async def change_password(payload: ChangePasswordRequest, user: dict = Depends(current_user)):
    """Logged-in user can change their own password."""
    record = await db.find_one("users", {"_id": user["_id"]})
    if not record:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if not verify_password(payload.old_password, record.get("password_hash", "")):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Current password is wrong")
    if len(payload.new_password) < 6:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "New password must be at least 6 characters")
    await db.update_one("users", user["_id"], {"password_hash": hash_password(payload.new_password)})
    return {"ok": True}