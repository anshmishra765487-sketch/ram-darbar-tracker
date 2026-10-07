"""Bilty PDF (ReportLab) - delivery ke time party ko dena hai."""

from __future__ import annotations

import io
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from database import db
from deps import add_trip_financials, current_user

router = APIRouter(prefix="/api/trips", tags=["bilty"])

SLATE = "#1e293b"
ORANGE = "#f97316"


def money(value: float) -> str:
    return f"{float(value):,.2f}"


@router.get("/{trip_id}/bilty.pdf")
async def bilty_pdf(trip_id: str, user: dict = Depends(current_user)):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas as pdf_canvas

    trip = await db.find_one("trips", {"_id": trip_id})
    if not trip:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Trip not found")

    expenses = await db.find_many("expenses", {"trip_id": trip_id}, sort=[("date", 1)])
    payments = await db.find_many("payments", {"trip_id": trip_id}, sort=[("date", 1)])
    trip = add_trip_financials([trip], expenses, payments)[0]

    truck = await db.find_one("trucks", {"_id": trip.get("truck_id")}) if trip.get("truck_id") else None
    driver = await db.find_one("drivers", {"_id": trip.get("driver_id")}) if trip.get("driver_id") else None

    buffer = io.BytesIO()
    pdf = pdf_canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    left, right = 18 * mm, width - 18 * mm
    y = height - 20 * mm

    def header(title: str):
        pdf.setFont("Helvetica-Bold", 18)
        pdf.setFillColor(colors.HexColor(ORANGE))
        pdf.drawString(left, y, title)
        pdf.setFont("Helvetica", 9)
        pdf.setFillColor(colors.HexColor(SLATE))
        pdf.drawRightString(right, y + 4, f"Bilty No: {trip_id[-8:].upper()}")
        pdf.drawRightString(right, y - 6, f"Date: {datetime.now().strftime('%d-%m-%Y')}")
        return y - 16 * mm

    def line(label: str, value: str, x: float, y_pos: float, w: float = 78 * mm):
        pdf.setFont("Helvetica", 9)
        pdf.setFillColor(colors.HexColor("#64748b"))
        pdf.drawString(x, y_pos, label.upper())
        pdf.setFont("Helvetica-Bold", 11)
        pdf.setFillColor(colors.HexColor(SLATE))
        pdf.drawString(x, y_pos - 5 * mm, str(value)[:70])

    def box(x: float, y_pos: float, w: float, h: float):
        pdf.setStrokeColor(colors.HexColor("#e2e8f0"))
        pdf.setFillColor(colors.HexColor("#f8fafc"))
        pdf.rect(x, y_pos - h, w, h, stroke=1, fill=1)

    y = header("BILTY / CONSIGNMENT NOTE")
    pdf.setStrokeColor(colors.HexColor(ORANGE))
    pdf.setLineWidth(1.2)
    pdf.line(left, y + 3 * mm, right, y + 3 * mm)
    pdf.setLineWidth(0.4)

    y -= 6 * mm
    box(left, y, right - left, 34 * mm)
    line("Party (Consignor)", trip.get("party_name", "-"), left + 5 * mm, y - 4 * mm)
    line("Goods", trip.get("goods", "-"), left + 5 * mm, y - 17 * mm)
    line("Consignee (Delivery)", trip.get("notes") or "Same as party", left + 100 * mm, y - 4 * mm)
    line("Truck No", (truck or {}).get("registration_no", "-"), left + 100 * mm, y - 17 * mm)

    y -= 42 * mm
    box(left, y, right - left, 24 * mm)
    line("From", trip.get("from_location", "-"), left + 5 * mm, y - 4 * mm)
    line("To", trip.get("to_location", "-"), left + 100 * mm, y - 4 * mm)
    line("Driver", (driver or {}).get("name", "-"), left + 5 * mm, y - 15 * mm)
    line("Trip Date", trip.get("date", "-"), left + 100 * mm, y - 15 * mm)

    y -= 34 * mm
    pdf.setFont("Helvetica-Bold", 12)
    pdf.setFillColor(colors.HexColor(SLATE))
    pdf.drawString(left, y, "Freight Summary")

    y -= 9 * mm
    rows = [
        ("Freight Amount", money(trip.get("freight_amount", 0))),
        ("Advance Given", money(trip.get("advance", 0))),
        ("Received (Payments)", money(max(float(trip.get("received_total", 0)) - float(trip.get("advance", 0)), 0))),
        ("Total Received", money(trip.get("received_total", 0))),
        ("Balance Due", money(max(float(trip.get("pending_amount", 0)), 0))),
        ("Trip Expenses", money(trip.get("expense_total", 0))),
        ("Net Profit", money(trip.get("profit", 0))),
        ("Status", trip.get("status", "-")),
    ]
    for label, value in rows:
        is_total = label in {"Balance Due", "Net Profit", "Total Received"}
        pdf.setFont("Helvetica-Bold" if is_total else "Helvetica", 10)
        pdf.setFillColor(colors.HexColor(SLATE))
        pdf.drawString(left + 4 * mm, y, label)
        pdf.drawRightString(right - 4 * mm, y, value)
        if is_total:
            pdf.setStrokeColor(colors.HexColor("#e2e8f0"))
            pdf.line(left + 4 * mm, y - 2 * mm, right - 4 * mm, y - 2 * mm)
        y -= 7 * mm

    y -= 4 * mm
    pdf.setFont("Helvetica-Bold", 10)
    pdf.setFillColor(colors.HexColor(SLATE))
    pdf.drawString(left, y, "Payment History")
    y -= 6 * mm
    if payments:
        pdf.setFont("Helvetica", 9)
        for payment in payments:
            pdf.drawString(left + 4 * mm, y, f"{payment.get('date')} - {payment.get('mode')} - {payment.get('reference') or '-'}")
            pdf.drawRightString(right - 4 * mm, y, money(payment.get("amount", 0)))
            y -= 5 * mm
    else:
        pdf.setFont("Helvetica", 9)
        pdf.setFillColor(colors.HexColor("#64748b"))
        pdf.drawString(left + 4 * mm, y, "Abhi tak koi payment record nahi")
        y -= 5 * mm

    y -= 14 * mm
    pdf.setStrokeColor(colors.HexColor("#cbd5e1"))
    for x in (left + 10 * mm, right - 70 * mm):
        pdf.line(x, y, x + 60 * mm, y)
    pdf.setFont("Helvetica", 9)
    pdf.setFillColor(colors.HexColor("#64748b"))
    pdf.drawCentredString(left + 40 * mm, y - 5 * mm, "Driver / Transport Signature")
    pdf.drawCentredString(right - 40 * mm, y - 5 * mm, "Party Signature")

    pdf.setFont("Helvetica", 7)
    pdf.drawString(left, 12 * mm, "Computer generated bilty - Transport Management System")
    pdf.drawRightString(right, 12 * mm, "Owner: " + user.get("email", ""))

    pdf.showPage()
    pdf.save()
    buffer.seek(0)

    filename = f"bilty-{trip.get('party_name', 'trip').replace(' ', '_')[:20]}-{trip_id[-6:]}.pdf"
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )