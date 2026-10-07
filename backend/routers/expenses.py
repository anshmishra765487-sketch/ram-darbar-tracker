"""Expenses CRUD."""

from fastapi import APIRouter, Depends, HTTPException, status

from database import db, now_iso
from deps import current_user
from models import ExpenseCreate, ExpenseUpdate

router = APIRouter(prefix="/api/expenses", tags=["expenses"])


def to_json_ready(payload: ExpenseCreate | ExpenseUpdate) -> dict:
    data = payload.model_dump(exclude_none=True)
    if "date" in data and data["date"] is not None:
        data["date"] = str(data["date"])
    return data


@router.get("")
async def list_expenses(category: str | None = None, trip_id: str | None = None, user: dict = Depends(current_user)):
    flt: dict = {}
    if category:
        flt["category"] = category
    if trip_id:
        flt["trip_id"] = trip_id
    return await db.find_many("expenses", flt or None, sort=[("date", -1)])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_expense(payload: ExpenseCreate, user: dict = Depends(current_user)):
    data = to_json_ready(payload)
    data["created_at"] = now_iso()
    expense_id = await db.insert_one("expenses", data)
    return {"_id": expense_id, **data}


@router.put("/{expense_id}")
async def update_expense(expense_id: str, payload: ExpenseUpdate, user: dict = Depends(current_user)):
    if not await db.find_one("expenses", {"_id": expense_id}):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Expense not found")
    patch = to_json_ready(payload)
    if patch:
        await db.update_one("expenses", expense_id, patch)
    return await db.find_one("expenses", {"_id": expense_id})


@router.delete("/{expense_id}")
async def delete_expense(expense_id: str, user: dict = Depends(current_user)):
    if not await db.delete_one("expenses", expense_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Expense not found")
    return {"deleted": True}