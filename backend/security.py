"""Password hashing + JWT token helpers."""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone

import jwt
from dotenv import load_dotenv

load_dotenv()

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me-ram-darbar-tracker-2026")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
TOKEN_EXPIRE_MINUTES = int(os.getenv("TOKEN_EXPIRE_MINUTES", "43200"))

try:
    import bcrypt

    def hash_password(raw: str) -> str:
        return bcrypt.hashpw(raw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    def verify_password(raw: str, hashed: str) -> bool:
        try:
            return bcrypt.checkpw(raw.encode("utf-8"), hashed.encode("utf-8"))
        except ValueError:
            return False

except ImportError:  # bcrypt native build na ho to pbkdf2 se chal jayega
    _ITERATIONS = 200_000

    def hash_password(raw: str) -> str:
        salt = os.urandom(16)
        digest = hashlib.pbkdf2_hmac("sha256", raw.encode(), salt, _ITERATIONS)
        return "pbkdf2$" + base64.b64encode(salt).decode() + "$" + base64.b64encode(digest).decode()

    def verify_password(raw: str, hashed: str) -> bool:
        try:
            _, salt_b64, digest_b64 = hashed.split("$")
            expected = base64.b64decode(digest_b64)
            actual = hashlib.pbkdf2_hmac("sha256", raw.encode(), base64.b64decode(salt_b64), _ITERATIONS)
            return hmac.compare_digest(actual, expected)
        except Exception:
            return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None