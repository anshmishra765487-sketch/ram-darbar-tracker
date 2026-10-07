"""Drivers CRUD."""

from fastapi import APIRouter, Depends, HTTPException, status

from database import db, now_iso
from deps import current_user
from models import DriverCreate, DriverUpdate

router = APIRouter(prefix="/api/drivers", tags=["drivers"])


@router.get("")
async def list_drivers(user: dict = Depends(current_user)):
    return await db.find_many("drivers", sort=[("name", 1)])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_driver(payload: DriverCreate, user: dict = Depends(current_user)):
    data = {
        "name": payload.name.strip(),
        "phone": payload.phone.strip(),
        "license_no": payload.license_no.strip().upper(),
        "salary": payload.salary,
        "advance": payload.advance,
    }
    data.update(created_at=now_iso())
    driver_id = await db.insert_one("drivers", data)
    return {"_id": driver_id, **data}


@router.put("/{driver_id}")
async def update_driver(driver_id: str, payload: DriverUpdate, user: dict = Depends(current_user)):
    if not await db.find_one("drivers", {"_id": driver_id}):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Driver not found")
    patch = payload.model_dump(exclude_none=True)
    if "license_no" in patch:
        patch["license_no"] = patch["license_no"].strip().upper()
    if not patch:
        return await db.find_one("drivers", {"_id": driver_id})
    await db.update_one("drivers", driver_id, patch)
    return await db.find_one("drivers", {"_id": driver_id})


@router.delete("/{driver_id}")
async def delete_driver(driver_id: str, user: dict = Depends(current_user)):
    used = await db.find_many("trips", {"driver_id": driver_id})
    if used:
        raise HTTPException(status.HTTP_409_CONFLICT, "This driver has trips, delete those trips first")
    if not await db.delete_one("drivers", driver_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Driver not found")
    return {"deleted": True}