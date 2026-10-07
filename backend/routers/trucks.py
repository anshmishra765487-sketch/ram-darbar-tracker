"""Trucks CRUD (duplicate registration number blocked)."""

from fastapi import APIRouter, Depends, HTTPException, status

from database import db, now_iso
from deps import current_user
from models import TruckCreate, TruckUpdate

router = APIRouter(prefix="/api/trucks", tags=["trucks"])


def clean(payload: TruckCreate) -> dict:
    return {
        "registration_no": payload.registration_no.strip().upper(),
        "model": payload.model.strip(),
        "capacity_tons": payload.capacity_tons,
        "status": payload.status,
    }


@router.get("")
async def list_trucks(user: dict = Depends(current_user)):
    return await db.find_many("trucks", sort=[("registration_no", 1)])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_truck(payload: TruckCreate, user: dict = Depends(current_user)):
    data = clean(payload)
    existing = await db.find_one("trucks", {"registration_no": data["registration_no"]})
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "This registration number already exists")
    data.update(created_at=now_iso())
    truck_id = await db.insert_one("trucks", data)
    return {"_id": truck_id, **data}


@router.put("/{truck_id}")
async def update_truck(truck_id: str, payload: TruckUpdate, user: dict = Depends(current_user)):
    current = await db.find_one("trucks", {"_id": truck_id})
    if not current:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Truck not found")
    patch = payload.model_dump(exclude_none=True)
    if "registration_no" in patch:
        patch["registration_no"] = patch["registration_no"].strip().upper()
        clash = await db.find_one("trucks", {"registration_no": patch["registration_no"]})
        if clash and clash["_id"] != truck_id:
            raise HTTPException(status.HTTP_409_CONFLICT, "This registration number already exists")
    if not patch:
        return current
    await db.update_one("trucks", truck_id, patch)
    return await db.find_one("trucks", {"_id": truck_id})


@router.delete("/{truck_id}")
async def delete_truck(truck_id: str, user: dict = Depends(current_user)):
    active = await db.find_many("trips", {"truck_id": truck_id})
    if active:
        raise HTTPException(status.HTTP_409_CONFLICT, "This truck has trips, delete those trips first")
    if not await db.delete_one("trucks", truck_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Truck not found")
    return {"deleted": True}