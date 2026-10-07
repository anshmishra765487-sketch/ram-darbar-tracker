"""Extra accounting reports: party ledger, aging, truck-wise P&L, driver payouts."""

from __future__ import annotations

from collections import defaultdict
from datetime import date

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from database import db
from deps import add_trip_financials, current_user

router = APIRouter(prefix="/api/accounts", tags=["accounts"])

EXCLUDED = {"Cancelled"}


async def _ledger() -> list[dict]:
    trips = await db.find_many("trips")
    expenses = await db.find_many("expenses")
    payments = await db.find_many("payments")
    return add_trip_financials(trips, expenses, payments)


@router.get("/parties")
async def party_ledger(user: dict = Depends(current_user)):
    """Party-wise: billed, received, pending, trips count."""
    trips = await _ledger()
    rows: dict[str, dict] = {}
    for trip in trips:
        if trip.get("status") in EXCLUDED:
            continue
        party = trip.get("party_name") or "Unknown"
        row = rows.setdefault(
            party,
            {
                "party_name": party,
                "trips": 0,
                "freight": 0.0,
                "expenses": 0.0,
                "received": 0.0,
                "pending": 0.0,
                "profit": 0.0,
                "last_trip_date": "",
            },
        )
        row["trips"] += 1
        row["freight"] += float(trip.get("freight_amount", 0))
        row["expenses"] += float(trip.get("expense_total", 0))
        row["received"] += float(trip.get("received_total", 0))
        row["pending"] += max(float(trip.get("pending_amount", 0)), 0)
        row["profit"] += float(trip.get("profit", 0))
        trip_date = str(trip.get("date", ""))
        if trip_date > row["last_trip_date"]:
            row["last_trip_date"] = trip_date

    output = []
    for row in rows.values():
        row["freight"] = round(row["freight"], 2)
        row["expenses"] = round(row["expenses"], 2)
        row["received"] = round(row["received"], 2)
        row["pending"] = round(row["pending"], 2)
        row["profit"] = round(row["profit"], 2)
        output.append(row)
    output.sort(key=lambda r: r["pending"], reverse=True)

    return {
        "rows": output,
        "totals": {
            "parties": len(output),
            "freight": round(sum(r["freight"] for r in output), 2),
            "received": round(sum(r["received"] for r in output), 2),
            "pending": round(sum(r["pending"] for r in output), 2),
            "profit": round(sum(r["profit"] for r in output), 2),
        },
    }


@router.get("/outstanding-aging")
async def outstanding_aging(user: dict = Depends(current_user)):
    """Pending amount ko age ke hisaab se baanto me (0-30 / 31-60 / 61-90 / 90+ days)."""
    trips = await _ledger()
    today = date.today()
    buckets = [
        {"bucket": "0-30 days", "min": 0, "max": 30, "trips": 0, "amount": 0.0, "parties": []},
        {"bucket": "31-60 days", "min": 31, "max": 60, "trips": 0, "amount": 0.0, "parties": []},
        {"bucket": "61-90 days", "min": 61, "max": 90, "trips": 0, "amount": 0.0, "parties": []},
        {"bucket": "90+ days", "min": 91, "max": 10_000, "trips": 0, "amount": 0.0, "parties": []},
    ]
    detail = []
    for trip in trips:
        if trip.get("status") in EXCLUDED:
            continue
        pending = max(float(trip.get("pending_amount", 0)), 0)
        if pending <= 0:
            continue
        raw_date = str(trip.get("date", ""))[:10]
        try:
            age = (today - date.fromisoformat(raw_date)).days
        except ValueError:
            age = 0
        for bucket in buckets:
            if bucket["min"] <= age <= bucket["max"]:
                bucket["trips"] += 1
                bucket["amount"] += pending
                bucket["parties"].append(trip.get("party_name", ""))
                break
        detail.append(
            {
                "_id": trip["_id"],
                "party_name": trip.get("party_name", ""),
                "date": raw_date,
                "age_days": max(age, 0),
                "route": f'{trip.get("from_location", "")} -> {trip.get("to_location", "")}',
                "freight_amount": trip.get("freight_amount", 0),
                "received_total": trip.get("received_total", 0),
                "pending": round(pending, 2),
                "status": trip.get("status", ""),
            }
        )

    for bucket in buckets:
        bucket["amount"] = round(bucket["amount"], 2)
        bucket["parties"] = sorted(set(bucket["parties"]))

    detail.sort(key=lambda row: row["age_days"], reverse=True)
    return {
        "buckets": [{k: v for k, v in bucket.items() if k not in {"min", "max"}} for bucket in buckets],
        "rows": detail,
        "total_pending": round(sum(row["pending"] for row in detail), 2),
    }


@router.get("/truck-wise")
async def truck_wise(user: dict = Depends(current_user)):
    """Har truck ka apna hisaab: trips, freight, expense, profit, cost per ton."""
    trucks = await db.find_many("trucks")
    trips = await _ledger()
    rows = []
    for truck in trucks:
        truck_trips = [t for t in trips if t.get("truck_id") == truck["_id"] and t.get("status") not in EXCLUDED]
        freight = sum(float(t.get("freight_amount", 0)) for t in truck_trips)
        expenses = sum(float(t.get("expense_total", 0)) for t in truck_trips)
        received = sum(float(t.get("received_total", 0)) for t in truck_trips)
        pending = sum(max(float(t.get("pending_amount", 0)), 0) for t in truck_trips)
        profit = freight - expenses
        rows.append(
            {
                "_id": truck["_id"],
                "registration_no": truck.get("registration_no", ""),
                "model": truck.get("model", ""),
                "capacity_tons": truck.get("capacity_tons", 0),
                "status": truck.get("status", ""),
                "trips": len(truck_trips),
                "freight": round(freight, 2),
                "expenses": round(expenses, 2),
                "received": round(received, 2),
                "pending": round(pending, 2),
                "profit": round(profit, 2),
                "profit_per_trip": round(profit / len(truck_trips), 2) if truck_trips else 0.0,
            }
        )
    rows.sort(key=lambda r: r["profit"], reverse=True)
    return {
        "rows": rows,
        "totals": {
            "freight": round(sum(r["freight"] for r in rows), 2),
            "expenses": round(sum(r["expenses"] for r in rows), 2),
            "profit": round(sum(r["profit"] for r in rows), 2),
        },
    }


@router.get("/driver-payouts")
async def driver_payouts(user: dict = Depends(current_user)):
    """Driver-wise trips, freight earned, salary and advance given."""
    drivers = await db.find_many("drivers")
    trips = await _ledger()
    rows = []
    for driver in drivers:
        driver_trips = [t for t in trips if t.get("driver_id") == driver["_id"] and t.get("status") not in EXCLUDED]
        salary = float(driver.get("salary", 0))
        advance = float(driver.get("advance", 0))
        rows.append(
            {
                "_id": driver["_id"],
                "name": driver.get("name", ""),
                "phone": driver.get("phone", ""),
                "license_no": driver.get("license_no", ""),
                "trips": len(driver_trips),
                "freight": round(sum(float(t.get("freight_amount", 0)) for t in driver_trips), 2),
                "salary": salary,
                "advance": advance,
                "balance": round(salary - advance, 2),
            }
        )
    rows.sort(key=lambda r: r["balance"], reverse=True)
    return {
        "rows": rows,
        "totals": {
            "drivers": len(rows),
            "salary": round(sum(r["salary"] for r in rows), 2),
            "advance": round(sum(r["advance"] for r in rows), 2),
            "balance": round(sum(r["balance"] for r in rows), 2),
        },
    }


@router.get("/profit-loss")
async def profit_loss(user: dict = Depends(current_user)):
    """Simple P&L: income vs expense categories vs net profit."""
    trips = await db.find_many("trips")
    expenses = await db.find_many("expenses")
    payments = await db.find_many("payments")
    trips = add_trip_financials(trips, expenses, payments)
    active = [t for t in trips if t.get("status") not in EXCLUDED]

    income_by_status: dict[str, float] = defaultdict(float)
    for trip in active:
        income_by_status[trip.get("status", "Pending")] += float(trip.get("freight_amount", 0))

    expense_by_category: dict[str, float] = defaultdict(float)
    for expense in expenses:
        expense_by_category[expense.get("category", "Other")] += float(expense.get("amount", 0))

    received = sum(float(t.get("received_total", 0)) for t in active)
    billed = sum(float(t.get("freight_amount", 0)) for t in active)
    total_expenses = sum(expense_by_category.values())
    cash_expenses = sum(
        float(e.get("amount", 0)) for e in expenses if e.get("category") != "Driver Advance"
    )

    return {
        "income": [
            {"label": status, "amount": round(amount, 2)} for status, amount in sorted(income_by_status.items())
        ],
        "expenses": [
            {"label": category, "amount": round(amount, 2)}
            for category, amount in sorted(expense_by_category.items(), key=lambda kv: kv[1], reverse=True)
        ],
        "summary": {
            "freight_billed": round(billed, 2),
            "received": round(received, 2),
            "pending": round(billed - received, 2),
            "total_expenses": round(total_expenses, 2),
            "cash_expenses": round(cash_expenses, 2),
            "driver_advance": round(expense_by_category.get("Driver Advance", 0.0), 2),
            "net_profit": round(billed - total_expenses, 2),
            "margin_percent": round(((billed - total_expenses) / billed) * 100, 2) if billed else 0.0,
            "trips": len(active),
        },
    }


@router.get("/trip/{trip_id}")
async def trip_account(trip_id: str, user: dict = Depends(current_user)):
    """Single trip ka poora ledger: charges on the left, payments on the right."""
    trip = await db.find_one("trips", {"_id": trip_id})
    if trip is None:
        return JSONResponse(status_code=404, content={"detail": "Trip not found"})
    expenses = await db.find_many("expenses", {"trip_id": trip_id}, sort=[("date", 1)])
    payments = await db.find_many("payments", {"trip_id": trip_id}, sort=[("date", 1)])
    trip = add_trip_financials([trip], expenses, payments)[0]
    truck = await db.find_one("trucks", {"_id": trip.get("truck_id")}) if trip.get("truck_id") else None
    driver = await db.find_one("drivers", {"_id": trip.get("driver_id")}) if trip.get("driver_id") else None
    trip["truck_no"] = truck.get("registration_no") if truck else None
    trip["driver_name"] = driver.get("name") if driver else None
    trip["expenses"] = expenses
    trip["payments"] = payments
    trip["cash_expenses"] = round(
        sum(float(e.get("amount", 0)) for e in expenses if e.get("category") != "Driver Advance"), 2
    )
    trip.pop("_date", None)
    return trip