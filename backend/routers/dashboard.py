"""Dashboard KPIs + chart data (aggregation Python me, Mongo/Memory dono pe chalta hai)."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from fastapi import APIRouter, Depends

from database import db
from deps import add_trip_financials, current_user

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

EXCLUDED_FROM_REVENUE = {"Cancelled"}


@router.get("")
async def dashboard(user: dict = Depends(current_user)):
    trips = await db.find_many("trips")
    expenses = await db.find_many("expenses")
    payments = await db.find_many("payments")
    trips = add_trip_financials(trips, expenses, payments)

    active = [t for t in trips if t.get("status") not in EXCLUDED_FROM_REVENUE]

    total_revenue = sum(float(t.get("freight_amount", 0)) for t in active)
    total_expenses = sum(float(e.get("amount", 0)) for e in expenses)
    total_received = sum(float(t.get("received_total", 0)) for t in active)
    total_pending = sum(max(float(t.get("pending_amount", 0)), 0) for t in active)
    net_profit = total_revenue - total_expenses

    total_load_tons = sum(float(t.get("load_tons", 0) or 0) for t in active)
    loss_trips = [t for t in active if t.get("is_loss")]
    total_loss = sum(abs(float(t.get("profit", 0))) for t in loss_trips)
    profit_trips = [t for t in active if not t.get("is_loss")]

    trips_by_status: dict[str, int] = defaultdict(int)
    for trip in trips:
        trips_by_status[trip.get("status", "Pending")] += 1

    expense_by_category: dict[str, float] = defaultdict(float)
    for expense in expenses:
        expense_by_category[expense.get("category", "Other")] += float(expense.get("amount", 0))

    # last 6 months revenue vs expenses
    months: list[str] = []
    cursor = date.today().replace(day=1)
    for _ in range(6):
        months.append(cursor.strftime("%Y-%m"))
        cursor = (cursor - timedelta(days=1)).replace(day=1)
    months.reverse()

    revenue_by_month: dict[str, float] = defaultdict(float)
    for trip in active:
        key = str(trip.get("date", ""))[:7]
        if key in months:
            revenue_by_month[key] += float(trip.get("freight_amount", 0))

    expenses_by_month: dict[str, float] = defaultdict(float)
    for expense in expenses:
        key = str(expense.get("date", ""))[:7]
        if key in months:
            expenses_by_month[key] += float(expense.get("amount", 0))

    monthly = [
        {
            "month": key,
            "label": _label(key),
            "revenue": round(revenue_by_month.get(key, 0.0), 2),
            "expenses": round(expenses_by_month.get(key, 0.0), 2),
        }
        for key in months
    ]

    recent = sorted(active, key=lambda t: str(t.get("date", "")), reverse=True)[:6]

    return {
        "kpi": {
            "total_trips": len(active),
            "total_revenue": round(total_revenue, 2),
            "total_expenses": round(total_expenses, 2),
            "total_received": round(total_received, 2),
            "total_pending": round(total_pending, 2),
            "net_profit": round(net_profit, 2),
            "total_load_tons": round(total_load_tons, 3),
            "avg_rate_per_ton": (
                round(total_revenue / total_load_tons, 2) if total_load_tons > 0 else 0.0
            ),
            "loss_trip_count": len(loss_trips),
            "total_loss": round(total_loss, 2),
            "profit_trip_count": len(profit_trips),
        },
        "monthly": monthly,
        "expense_by_category": [
            {"category": key, "amount": round(value, 2)}
            for key, value in sorted(expense_by_category.items(), key=lambda kv: kv[1], reverse=True)
        ],
        "trips_by_status": [
            {"status": key, "count": value} for key, value in sorted(trips_by_status.items())
        ],
        "recent_trips": [
            {
                "_id": t["_id"],
                "party_name": t.get("party_name", ""),
                "from_location": t.get("from_location", ""),
                "to_location": t.get("to_location", ""),
                "load_tons": t.get("load_tons", 0),
                "freight_amount": t.get("freight_amount", 0),
                "profit": t.get("profit", 0),
                "is_loss": t.get("is_loss", False),
                "pending_amount": t.get("pending_amount", 0),
                "status": t.get("status", ""),
                "date": str(t.get("date", "")),
            }
            for t in recent
        ],
        "loss_trips": [
            {
                "_id": t["_id"],
                "party_name": t.get("party_name", ""),
                "from_location": t.get("from_location", ""),
                "to_location": t.get("to_location", ""),
                "load_tons": t.get("load_tons", 0),
                "freight_amount": t.get("freight_amount", 0),
                "expense_total": t.get("expense_total", 0),
                "loss": abs(float(t.get("profit", 0))),
                "date": str(t.get("date", "")),
                "status": t.get("status", ""),
            }
            for t in sorted(loss_trips, key=lambda t: float(t.get("profit", 0)))
        ],
    }


def _label(key: str) -> str:
    year, month = key.split("-")
    names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return f"{names[int(month) - 1]} {year[2:]}"