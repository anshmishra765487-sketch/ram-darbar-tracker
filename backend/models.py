"""Pydantic schemas (request validation)."""

from __future__ import annotations

from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field

TRIP_STATUSES = ["Pending", "In-Transit", "Delivered", "Paid", "Cancelled"]
TRUCK_STATUSES = ["Available", "On-Trip", "Maintenance"]
EXPENSE_CATEGORIES = ["Fuel", "Toll", "Maintenance", "Driver Advance", "Other"]
PAYMENT_MODES = ["Cash", "Bank", "UPI", "Cheque"]


class LoginRequest(BaseModel):
    identifier: str = ""
    email: str = ""
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    phone: str = ""


class SignupRequest(BaseModel):
    name: str = Field(min_length=2)
    phone: str
    email: str | None = None
    password: str = Field(min_length=6)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class OtpRequest(BaseModel):
    identifier: str
    via: str = "sms"


class OtpVerifyRequest(BaseModel):
    identifier: str
    code: str


class PhoneUpdate(BaseModel):
    phone: str


class PasswordResetRequest(BaseModel):
    identifier: str
    code: str
    new_password: str


class TruckBase(BaseModel):
    registration_no: str = Field(min_length=1)
    model: str = Field(min_length=1)
    capacity_tons: float = Field(gt=0)
    status: Literal["Available", "On-Trip", "Maintenance"] = "Available"


class TruckCreate(TruckBase):
    pass


class TruckUpdate(BaseModel):
    registration_no: Optional[str] = None
    model: Optional[str] = None
    capacity_tons: Optional[float] = Field(default=None, gt=0)
    status: Optional[Literal["Available", "On-Trip", "Maintenance"]] = None


class DriverBase(BaseModel):
    name: str = Field(min_length=1)
    phone: str = Field(min_length=6)
    license_no: str = Field(min_length=1)
    salary: float = Field(default=0, ge=0)
    advance: float = Field(default=0, ge=0)


class DriverCreate(DriverBase):
    pass


class DriverUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    license_no: Optional[str] = None
    salary: Optional[float] = Field(default=None, ge=0)
    advance: Optional[float] = Field(default=None, ge=0)


class TripBase(BaseModel):
    party_name: str = Field(min_length=1)
    from_location: str = Field(min_length=1)
    to_location: str = Field(min_length=1)
    goods: str = ""
    truck_id: Optional[str] = None
    driver_id: Optional[str] = None
    load_tons: float = Field(default=0, ge=0, le=100)
    freight_amount: float = Field(gt=0)
    advance: float = Field(default=0, ge=0)
    date: date
    status: Literal["Pending", "In-Transit", "Delivered", "Paid", "Cancelled"] = "Pending"
    notes: str = ""


class TripCreate(TripBase):
    pass


class TripUpdate(BaseModel):
    party_name: Optional[str] = None
    from_location: Optional[str] = None
    to_location: Optional[str] = None
    goods: Optional[str] = None
    truck_id: Optional[str] = None
    driver_id: Optional[str] = None
    load_tons: Optional[float] = Field(default=None, ge=0, le=100)
    freight_amount: Optional[float] = Field(default=None, gt=0)
    advance: Optional[float] = Field(default=None, ge=0)
    date: Optional[date] = None
    status: Optional[Literal["Pending", "In-Transit", "Delivered", "Paid", "Cancelled"]] = None
    notes: Optional[str] = None


class ExpenseBase(BaseModel):
    category: Literal["Fuel", "Toll", "Maintenance", "Driver Advance", "Other"]
    amount: float = Field(gt=0)
    date: date
    trip_id: Optional[str] = None
    truck_id: Optional[str] = None
    note: str = ""


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseUpdate(BaseModel):
    category: Optional[Literal["Fuel", "Toll", "Maintenance", "Driver Advance", "Other"]] = None
    amount: Optional[float] = Field(default=None, gt=0)
    date: Optional[date] = None
    trip_id: Optional[str] = None
    truck_id: Optional[str] = None
    note: Optional[str] = None


class PaymentBase(BaseModel):
    trip_id: str
    amount: float = Field(gt=0)
    date: date
    mode: Literal["Cash", "Bank", "UPI", "Cheque"]
    reference: str = ""
    note: str = ""


class PaymentCreate(PaymentBase):
    pass


class PaymentUpdate(BaseModel):
    amount: Optional[float] = Field(default=None, gt=0)
    date: Optional[date] = None
    mode: Optional[Literal["Cash", "Bank", "UPI", "Cheque"]] = None
    reference: Optional[str] = None
    note: Optional[str] = None