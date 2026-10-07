"""Reports: har trip ka hisaab + overall totals."""

from fastapi import APIRouter, Depends, HTTPException, status

from database import db
from deps import add_trip_financials, current_user

router = APIRouter(prefix="/api/reports", tags=["reports"])

EXCLUDED = {"Cancelled"}


@router.get("/trips")
async def trip_reports(user: dict = Depends(current_user)):
    trips = await db.find_many("trips")
    expenses = await db.find_many("expenses")
    payments = await db.find_many("payments")
    trucks = {t["_id"]: t for t in await db.find_many("trucks")}
    drivers = {d["_id"]: d for d in await db.find_many("drivers")}
    trips = add_trip_financials(trips, expenses, payments)

    rows = []
    cancelled = 0
    for trip in sorted(trips, key=lambda t: str(t.get("date", "")), reverse=True):
        if trip.get("status") in EXCLUDED:
            cancelled += 1
            continue
        truck = trucks.get(trip.get("truck_id") or "")
        driver = drivers.get(trip.get("driver_id") or "")
        rows.append(
            {
                "_id": trip["_id"],
                "date": str(trip.get("date", "")),
                "party_name": trip.get("party_name", ""),
                "route": f'{trip.get("from_location", "")} -> {trip.get("to_location", "")}',
                "truck_no": truck.get("registration_no", "-") if truck else "-",
                "driver_name": driver.get("name", "-") if driver else "-",
                "status": trip.get("status", ""),
                "load_tons": trip.get("load_tons", 0),
                "rate_per_ton": trip.get("rate_per_ton", 0),
                "cost_per_ton": trip.get("cost_per_ton", 0),
                "freight_amount": trip.get("freight_amount", 0),
                "expense_total": trip.get("expense_total", 0),
                "received_total": trip.get("received_total", 0),
                "pending_amount": trip.get("pending_amount", 0),
                "profit": trip.get("profit", 0),
                "is_loss": trip.get("is_loss", False),
            }
        )

    active = rows
    total_tons = sum(float(r["load_tons"]) for r in active)
    totals = {
        "trips": len(active),
        "cancelled": cancelled,
        "freight": round(sum(float(r["freight_amount"]) for r in active), 2),
        "expenses": round(sum(float(r["expense_total"]) for r in active), 2),
        "received": round(sum(float(r["received_total"]) for r in active), 2),
        "pending": round(sum(max(float(r["pending_amount"]), 0) for r in active), 2),
        "profit": round(sum(float(r["profit"]) for r in active), 2),
        "total_load_tons": round(total_tons, 3),
        "avg_rate_per_ton": (
            round(sum(float(r["freight_amount"]) for r in active) / total_tons, 2)
            if total_tons > 0
            else 0.0
        ),
        "loss_trips": sum(1 for r in active if r["is_loss"]),
        "total_loss": round(sum(abs(float(r["profit"])) for r in active if r["is_loss"]), 2),
    }
    return {"rows": rows, "totals": totals}


@router.get("/trips/{trip_id}")
async def trip_detail(trip_id: str, user: dict = Depends(current_user)):
    trip = await db.find_one("trips", {"_id": trip_id})
    if not trip:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Trip not found")
    expenses = await db.find_many("expenses", {"trip_id": trip_id}, sort=[("date", 1)])
    payments = await db.find_many("payments", {"trip_id": trip_id}, sort=[("date", 1)])
    trips = add_trip_financials([trip], expenses, payments)
    trip = trips[0]
    truck = await db.find_one("trucks", {"_id": trip.get("truck_id")}) if trip.get("truck_id") else None
    driver = await db.find_one("drivers", {"_id": trip.get("driver_id")}) if trip.get("driver_id") else None
    trip["truck_no"] = truck.get("registration_no") if truck else None
    trip["driver_name"] = driver.get("name") if driver else None
    trip["expenses"] = expenses
    trip["payments"] = payments
    return trip