"""FastAPI entry point — uvicorn main:app --reload"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from database import db, init_db, now_iso  # noqa: E402
from deps import auth_required, current_user, require_owner  # noqa: E402
from routers import (
    accounts,
    auth,
    bilty,
    dashboard,
    drivers,
    expenses,
    payments,
    reports,
    trips,
    trucks,
)  # noqa: E402
from security import hash_password  # noqa: E402


ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "owner@ramdarbar.com").strip().lower()
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "ramdarbar123")
ADMIN_PHONE = os.getenv("ADMIN_PHONE", "").strip()


def normalize_phone(value: str) -> str:
    """'+91 98765 43210' -> '919876543210'"""
    digits = "".join(ch for ch in (value or "") if ch.isdigit())
    if not digits:
        return ""
    if len(digits) == 10:
        return f"91{digits}"
    return digits.lstrip("0") if len(digits) > 10 else f"91{digits}"


async def ensure_owner_user() -> None:
    """First run par owner user bana do taaki login kaam kare."""
    existing = await db.find_one("users", {"email": ADMIN_EMAIL})
    if existing:
        if ADMIN_PHONE and existing.get("phone") != normalize_phone(ADMIN_PHONE):
            await db.update_one("users", existing["_id"], {"phone": normalize_phone(ADMIN_PHONE)})
        return
    await db.insert_one(
        "users",
        {
            "email": ADMIN_EMAIL,
            "phone": normalize_phone(ADMIN_PHONE),
            "password_hash": hash_password(ADMIN_PASSWORD),
            "name": "Owner",
            "created_at": now_iso(),
        },
    )
    print(f"[auth] owner user created: {ADMIN_EMAIL} (set ADMIN_PHONE to receive SMS OTPs)")


@asynccontextmanager
async def lifespan(app: FastAPI):
    kind = await init_db()
    print(f"[db] storage = {kind}")
    if kind == "memory":
        print("[db] MongoDB not reachable - in-memory storage (data resets on restart).")
    print(f"[auth] login {'required' if auth_required() else 'disabled (AUTH_REQUIRED=false)'}")
    await ensure_owner_user()
    print("[db] database is empty - the app will not seed any data. Add your own from the UI.")
    yield


app = FastAPI(
    title="Ram Darbar Tracker API",
    description="Truck transport business accounting - trips, trucks, drivers, expenses, payments, reports",
    version="1.0.0",
    lifespan=lifespan,
)

origins = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(trucks.router)
app.include_router(drivers.router)
app.include_router(trips.router)
app.include_router(bilty.router)
app.include_router(expenses.router)
app.include_router(payments.router)
app.include_router(dashboard.router)
app.include_router(reports.router)
app.include_router(accounts.router)

admin_router = APIRouter(prefix="/api/admin", tags=["admin"])


@admin_router.post("/reset")
async def reset_all(_: dict = Depends(require_owner)):
    """Delete all business data (trucks, drivers, trips, expenses, payments).

    User accounts are never deleted, otherwise the owner account would be lost
    and nobody could log in again.
    """
    cleared = {}
    for collection in ("trips", "payments", "expenses", "trucks", "drivers"):
        items = await db.find_many(collection)
        for item in items:
            await db.delete_one(collection, item["_id"])
        cleared[collection] = len(items)
    return {"cleared": cleared}


app.include_router(admin_router)


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "storage": db.kind,
        "auth_required": auth_required(),
        "counts": {
            collection: await db.count(collection)
            for collection in ("trucks", "drivers", "trips", "expenses", "payments")
        },
    }


@app.get("/api/owner")
async def owner():
    """Public - used by the login screen."""
    return {"email": ADMIN_EMAIL, "name": "Owner", "auth_required": auth_required()}


@app.post("/api/admin/set-password")
async def set_password(payload: dict, _: dict = Depends(require_owner)):
    """Set or update the owner password."""
    email = str(payload.get("email", "")).strip().lower()
    password = str(payload.get("password", ""))
    if not email or len(password) < 6:
        return {"ok": False, "detail": "Provide an email and a password of at least 6 characters"}
    existing = await db.find_one("users", {"email": email})
    if existing:
        await db.update_one("users", existing["_id"], {"password_hash": hash_password(password)})
    else:
        await db.insert_one(
            "users",
            {"email": email, "password_hash": hash_password(password), "name": "Owner", "created_at": now_iso()},
        )
    return {"ok": True, "email": email}