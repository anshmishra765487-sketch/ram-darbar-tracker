"""Trips (consignment) CRUD + status change + duplicate party check nahi, ledger attached."""

from fastapi import APIRouter, Depends, HTTPException, status

from database import db, now_iso
from deps import add_trip_financials, current_user
from models import TripCreate, TripUpdate

router = APIRouter(prefix="/api/trips", tags=["trips"])

MAX_TRACK_POINTS = 500


def to_json_ready(payload: TripCreate | TripUpdate) -> dict:
    data = payload.model_dump(exclude_none=True)
    if "date" in data and data["date"] is not None:
        data["date"] = str(data["date"])
    return data


async def attach_financials(trips: list[dict]) -> list[dict]:
    expenses = await db.find_many("expenses")
    payments = await db.find_many("payments")
    return add_trip_financials(trips, expenses, payments)


async def _check_load(truck_id: str | None, load_tons: float) -> None:
    """Load truck capacity se zyada na ho."""
    if not truck_id or load_tons <= 0:
        return
    truck = await db.find_one("trucks", {"_id": truck_id})
    if not truck:
        return
    capacity = float(truck.get("capacity_tons", 0) or 0)
    if capacity > 0 and load_tons > capacity:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Load {load_tons} tons exceeds {truck.get('registration_no', 'truck')} "
            f"capacity of {capacity} tons",
        )


@router.get("")
async def list_trips(status_filter: str | None = None, user: dict = Depends(current_user)):
    flt = {"status": status_filter} if status_filter else None
    trips = await db.find_many("trips", flt, sort=[("date", -1)])
    return await attach_financials(trips)


@router.get("/{trip_id}")
async def get_trip(trip_id: str, user: dict = Depends(current_user)):
    trip = await db.find_one("trips", {"_id": trip_id})
    if not trip:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Trip not found")
    expenses = await db.find_many("expenses", {"trip_id": trip_id}, sort=[("date", 1)])
    payments = await db.find_many("payments", {"trip_id": trip_id}, sort=[("date", 1)])
    trips = await attach_financials([trip])
    trips[0]["expenses"] = expenses
    trips[0]["payments"] = payments
    return trips[0]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_trip(payload: TripCreate, user: dict = Depends(current_user)):
    data = to_json_ready(payload)
    data["party_name"] = data["party_name"].strip()
    data["created_at"] = now_iso()
    await _check_load(data.get("truck_id"), float(data.get("load_tons", 0) or 0))
    trip_id = await db.insert_one("trips", data)

    if data.get("truck_id"):
        await db.update_one("trucks", data["truck_id"], {"status": "On-Trip"})

    trips = await attach_financials([{"_id": trip_id, **data}])
    return trips[0]


@router.put("/{trip_id}")
async def update_trip(trip_id: str, payload: TripUpdate, user: dict = Depends(current_user)):
    current = await db.find_one("trips", {"_id": trip_id})
    if not current:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Trip not found")
    patch = to_json_ready(payload)
    if not patch:
        trips = await attach_financials([current])
        return trips[0]

    truck_id = patch.get("truck_id", current.get("truck_id"))
    load_tons = float(patch.get("load_tons", current.get("load_tons", 0)) or 0)
    await _check_load(truck_id, load_tons)

    await db.update_one("trips", trip_id, patch)

    new_status = patch.get("status")
    if new_status in {"Delivered", "Paid", "Cancelled"} and current.get("truck_id"):
        await db.update_one("trucks", current["truck_id"], {"status": "Available"})
    elif new_status == "In-Transit" and current.get("truck_id"):
        await db.update_one("trucks", current["truck_id"], {"status": "On-Trip"})

    updated = await db.find_one("trips", {"_id": trip_id})
    trips = await attach_financials([updated])
    return trips[0]


@router.delete("/{trip_id}")
async def delete_trip(trip_id: str, user: dict = Depends(current_user)):
    trip = await db.find_one("trips", {"_id": trip_id})
    if not trip:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Trip not found")
    await db.delete_one("payments", {"trip_id": trip_id})
    expenses = await db.find_many("expenses", {"trip_id": trip_id})
    for expense in expenses:
        await db.delete_one("expenses", expense["_id"])
    for point in await db.find_many("locations", {"trip_id": trip_id}):
        await db.delete_one("locations", point["_id"])
    await db.delete_one("trips", trip_id)
    if trip.get("truck_id"):
        await db.update_one("trucks", trip["truck_id"], {"status": "Available"})
    return {"deleted": True}


# --- GPS tracking ---------------------------------------------------------


def _valid_coord(value) -> float | None:
    try:
        num = float(value)
    except (TypeError, ValueError):
        return None
    if -180.0 <= num <= 180.0:
        return round(num, 6)
    return None


@router.get("/{trip_id}/location")
async def trip_location(trip_id: str, user: dict = Depends(current_user)):
    """Latest GPS point + puri tracking history for a trip."""
    trip = await db.find_one("trips", {"_id": trip_id})
    if not trip:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Trip not found")
    points = await db.find_many("locations", {"trip_id": trip_id}, sort=[("recorded_at", 1)])
    latest = points[-1] if points else None
    return {
        "trip_id": trip_id,
        "latest": latest,
        "has_tracking": bool(points),
        "points": points,
        "point_count": len(points),
    }


@router.post("/{trip_id}/location")
async def record_location(trip_id: str, payload: dict, user: dict = Depends(current_user)):
    """Driver/GPS device ek point bheje. Body: { latitude, longitude, speed?, accuracy?, recorded_at? }"""
    trip = await db.find_one("trips", {"_id": trip_id})
    if not trip:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Trip not found")

    lat = _valid_coord(payload.get("latitude", payload.get("lat")))
    lng = _valid_coord(payload.get("longitude", payload.get("lng", payload.get("long"))))
    if lat is None or lng is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Valid latitude/longitude required (latitude -90..90, longitude -180..180)",
        )

    def _num(key):
        try:
            return float(payload[key])
        except (KeyError, TypeError, ValueError):
            return None

    recorded_at = str(payload.get("recorded_at") or now_iso())
    point = {
        "trip_id": trip_id,
        "latitude": lat,
        "longitude": lng,
        "speed": _num("speed"),
        "heading": _num("heading"),
        "accuracy": _num("accuracy"),
        "recorded_at": recorded_at,
        "source": payload.get("source", "device"),
    }
    await db.insert_one("locations", point)

    existing = await db.find_many("locations", {"trip_id": trip_id})
    if len(existing) > MAX_TRACK_POINTS:
        for stale in existing[: len(existing) - MAX_TRACK_POINTS]:
            await db.delete_one("locations", stale["_id"])

    return {"saved": True, "trip_id": trip_id, "point": point}