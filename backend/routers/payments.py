"""Payments CRUD + UPI payment requests (QR) for a trip."""

import os
import re
from urllib.parse import quote

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, status

from database import db, now_iso
from deps import add_trip_financials, current_user
from models import PaymentCreate, PaymentUpdate

load_dotenv()

router = APIRouter(prefix="/api/payments", tags=["payments"])

UPI_PAYEE_NAME = os.getenv("UPI_PAYEE_NAME", "Ram Darbar Transport").strip()
UPI_VPA = os.getenv("UPI_VPA", "").strip()
# Optional: payment gateway webhook se auto-confirmation ke liye.
PAYMENT_WEBHOOK_SECRET = os.getenv("PAYMENT_WEBHOOK_SECRET", "").strip()


def to_json_ready(payload: PaymentCreate | PaymentUpdate) -> dict:
    data = payload.model_dump(exclude_none=True)
    if "date" in data and data["date"] is not None:
        data["date"] = str(data["date"])
    return data


async def _trip_financials(trip_id: str) -> dict | None:
    """Trip ka current pending amount nikaalo (advance + payments minus freight)."""
    trip = await db.find_one("trips", {"_id": trip_id})
    if not trip:
        return None
    payments = await db.find_many("payments", {"trip_id": trip_id})
    (trip,) = add_trip_financials([trip], [], payments)
    return trip


async def _mark_paid_if_complete(trip_id: str) -> bool:
    """Pura paisa aa gaya to trip ka status 'Paid' kar do. Returns True if changed."""
    trip = await _trip_financials(trip_id)
    if not trip:
        return False
    freight = float(trip.get("freight_amount", 0))
    received = float(trip.get("received_total", 0))
    if trip.get("status") == "Cancelled":
        return False
    if received >= freight - 0.01 and trip.get("status") != "Paid":
        await db.update_one("trips", trip_id, {"status": "Paid", "paid_at": now_iso()})
        if trip.get("truck_id"):
            await db.update_one("trucks", trip["truck_id"], {"status": "Available"})
        return True
    return False


@router.get("")
async def list_payments(trip_id: str | None = None, user: dict = Depends(current_user)):
    flt = {"trip_id": trip_id} if trip_id else None
    return await db.find_many("payments", flt, sort=[("date", -1)])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_payment(payload: PaymentCreate, user: dict = Depends(current_user)):
    trip = await db.find_one("trips", {"_id": payload.trip_id})
    if not trip:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Trip not found")

    payments = await db.find_many("payments", {"trip_id": payload.trip_id})
    already = float(trip.get("advance", 0)) + sum(float(p.get("amount", 0)) for p in payments)
    if already + payload.amount > float(trip.get("freight_amount", 0)) + 0.01:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Payment is more than the trip freight")

    data = to_json_ready(payload)
    data["party_name"] = trip.get("party_name", "")
    data["created_at"] = now_iso()
    payment_id = await db.insert_one("payments", data)

    # Automatic order completion - pura payment aa gaya to status Paid.
    completed = await _mark_paid_if_complete(payload.trip_id)
    result = {"_id": payment_id, **data}
    result["trip_status"] = "Paid" if completed else trip.get("status", "")
    result["trip_completed"] = completed
    return result


@router.put("/{payment_id}")
async def update_payment(payment_id: str, payload: PaymentUpdate, user: dict = Depends(current_user)):
    existing = await db.find_one("payments", {"_id": payment_id})
    if not existing:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    patch = to_json_ready(payload)
    if patch:
        await db.update_one("payments", payment_id, patch)
    await _mark_paid_if_complete(existing["trip_id"])
    return await db.find_one("payments", {"_id": payment_id})


@router.delete("/{payment_id}")
async def delete_payment(payment_id: str, user: dict = Depends(current_user)):
    existing = await db.find_one("payments", {"_id": payment_id})
    if not await db.delete_one("payments", payment_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    if existing:
        await _mark_paid_if_complete(existing["trip_id"])
    return {"deleted": True}


# --- UPI payment request (QR) ---------------------------------------------


def _clean_vpa(vpa: str) -> str:
    vpa = (vpa or "").strip().lower().replace(" ", "")
    if re.fullmatch(r"[a-z0-9.\-]{2,64}@[a-z]{2,32}", vpa):
        return vpa
    return ""


@router.get("/request/{trip_id}")
async def payment_request(trip_id: str, user: dict = Depends(current_user)):
    """Trip ka pending amount + UPI deep-link/QR payload banao (party ko bhejne ke liye)."""
    trip = await _trip_financials(trip_id)
    if not trip:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Trip not found")

    pending = max(float(trip.get("pending_amount", 0)), 0.0)
    vpa = _clean_vpa(UPI_VPA)
    amount = round(pending, 2)

    note = f"{trip.get('party_name', '')} {trip.get('from_location', '')} to {trip.get('to_location', '')}".strip()
    note = re.sub(r"\s+", " ", note)[:50]

    deep_link = ""
    if vpa:
        params = [f"pa={quote(vpa)}", f"pn={quote(UPI_PAYEE_NAME)}", "cu=INR"]
        if amount > 0:
            params.append(f"am={amount}")
        if note:
            params.append(f"tn={quote(note)}")
        deep_link = f"upi://pay?{'&'.join(params)}"

    return {
        "trip_id": trip_id,
        "party_name": trip.get("party_name", ""),
        "freight_amount": trip.get("freight_amount", 0),
        "received_total": trip.get("received_total", 0),
        "pending_amount": amount,
        "currency": "INR",
        "payee_name": UPI_PAYEE_NAME,
        "vpa": vpa,
        "note": note,
        "upi_link": deep_link,
        "qr_payload": deep_link,
        "gateway_configured": bool(vpa),
        "status": trip.get("status", ""),
        "message": (
            f"Payment of Rs {amount:,.2f} received for trip {trip_id[:6]} - {note}"
            if amount > 0
            else "This trip is fully paid"
        ),
    }


@router.post("/request/{trip_id}/scan")
async def scan_payment(trip_id: str, payload: dict, user: dict = Depends(current_user)):
    """Scanner se payment confirm karo: amount + reference + mode bhejo, trip auto 'Paid' ho jayega.

    Ye wahi endpoint hai jo UPI gateway webhook bhi call karta hai. Agar
    PAYMENT_WEBHOOK_SECRET set hai to `X-Webhook-Secret` header bhi match hona chahiye.
    """
    if PAYMENT_WEBHOOK_SECRET:
        supplied = str(payload.get("secret") or "")
        if supplied != PAYMENT_WEBHOOK_SECRET:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid webhook secret")

    trip = await db.find_one("trips", {"_id": trip_id})
    if not trip:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Trip not found")

    try:
        amount = float(payload.get("amount", 0))
    except (TypeError, ValueError):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Amount must be a number")
    if amount <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Enter the amount received")

    mode = payload.get("mode", "UPI")
    if mode not in {"Cash", "Bank", "UPI", "Cheque"}:
        mode = "UPI"

    reference = str(payload.get("reference") or payload.get("txn_id") or "").strip()
    note = str(payload.get("note") or "Scanned payment").strip()
    date = str(payload.get("date") or now_iso())[:10]

    record = {
        "trip_id": trip_id,
        "party_name": trip.get("party_name", ""),
        "amount": round(amount, 2),
        "date": date,
        "mode": mode,
        "reference": reference,
        "note": note,
        "source": payload.get("source", "scanner"),
        "created_at": now_iso(),
    }
    payment_id = await db.insert_one("payments", record)

    completed = await _mark_paid_if_complete(trip_id)
    updated = await _trip_financials(trip_id)
    already_paid = updated.get("status") == "Paid"
    if completed:
        message = "Full payment received - trip automatically marked Paid"
    elif already_paid:
        message = "Trip was already fully paid; extra payment recorded"
    else:
        remaining = round(max(float(updated.get("pending_amount", 0)), 0.0), 2)
        message = f"Payment recorded - Rs {remaining:,.2f} still pending"
    return {
        "payment_id": payment_id,
        "received_total": updated.get("received_total", 0),
        "pending_amount": round(max(float(updated.get("pending_amount", 0)), 0.0), 2),
        "trip_status": updated.get("status", ""),
        "trip_completed": completed,
        "message": message,
    }