"""Shared helpers: auth dependency + trip ledger calculation.

Auth is required by default (AUTH_REQUIRED=true). Set AUTH_REQUIRED=false in
backend/.env to run the API without a token (handy for quick local work).
"""

from __future__ import annotations

import os
from datetime import date, datetime
from typing import Any

from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from database import db
from security import decode_access_token

load_dotenv()

AUTH_REQUIRED = os.getenv("AUTH_REQUIRED", "true").lower() == "true"

bearer = HTTPBearer(auto_error=False)

LOCAL_OWNER = {
    "_id": "local-owner",
    "email": os.getenv("ADMIN_EMAIL", "owner@ramdarbar.com"),
    "name": "Owner",
}


def auth_required() -> bool:
    return os.getenv("AUTH_REQUIRED", "true").lower() == "true"


async def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> dict[str, Any]:
    if creds is None:
        if auth_required():
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Login required")
        return dict(LOCAL_OWNER)

    payload = decode_access_token(creds.credentials)
    if not payload:
        if auth_required():
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired, please login again")
        return dict(LOCAL_OWNER)

    user = await db.find_one("users", {"_id": payload.get("sub")})
    if not user:
        if auth_required():
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
        return dict(LOCAL_OWNER)
    user.pop("password_hash", None)
    return user


async def require_owner(user: dict = Depends(current_user)) -> dict[str, Any]:
    return user


def month_key(value: str | date | datetime) -> str:
    text = value if isinstance(value, str) else value.isoformat()
    return text[:7]


def add_trip_financials(trips: list[dict], expenses: list[dict], payments: list[dict]) -> list[dict]:
    """Har trip me expense/received/pending/profit/load jod do."""
    expense_by_trip: dict[str, float] = {}
    for expense in expenses:
        trip_id = expense.get("trip_id")
        if trip_id:
            expense_by_trip[trip_id] = expense_by_trip.get(trip_id, 0.0) + float(expense.get("amount", 0))

    payment_by_trip: dict[str, float] = {}
    for payment in payments:
        trip_id = payment.get("trip_id")
        if trip_id:
            payment_by_trip[trip_id] = payment_by_trip.get(trip_id, 0.0) + float(payment.get("amount", 0))

    for trip in trips:
        trip_id = trip["_id"]
        freight = float(trip.get("freight_amount", 0))
        advance = float(trip.get("advance", 0))
        trip_expense = expense_by_trip.get(trip_id, 0.0)
        received = advance + payment_by_trip.get(trip_id, 0.0)
        load_tons = float(trip.get("load_tons", 0) or 0)
        trip["expense_total"] = round(trip_expense, 2)
        trip["received_total"] = round(received, 2)
        trip["pending_amount"] = round(freight - received, 2)
        trip["profit"] = round(freight - trip_expense, 2)
        # Loss = kharcha freight se zyada, ya pending paisa jo advance se cover na ho.
        trip["is_loss"] = trip["profit"] < 0
        trip["load_tons"] = round(load_tons, 3)
        trip["rate_per_ton"] = round(freight / load_tons, 2) if load_tons > 0 else 0.0
        trip["cost_per_ton"] = round(trip_expense / load_tons, 2) if load_tons > 0 else 0.0
        trip["_date"] = str(trip.get("date", ""))
    return trips