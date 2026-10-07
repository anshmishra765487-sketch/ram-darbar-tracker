"""Smoke test - pure in-process. Run: python test_api.py

Login required (AUTH_REQUIRED defaults to true). App starts with an empty
database, so the test creates the owner user first, then logs in.
"""

import asyncio

from fastapi.testclient import TestClient

import database
from database import db
from main import app, ensure_owner_user
from security import hash_password

client = TestClient(app)

ok = True


def check(label: str, condition: bool, extra: str = "") -> None:
    global ok
    ok = ok and condition
    print(("PASS  " if condition else "FAIL  ") + label + (f"  {extra}" if extra else ""))


def run(coro):
    return asyncio.run(coro)


with client:
    run(ensure_owner_user())

    health = client.get("/api/health").json()
    check("health endpoint", health["status"] == "ok", str(health))
    check("app starts empty", all(v == 0 for v in health["counts"].values()), str(health["counts"]))
    check("auth required", health["auth_required"] is True)

    check("no token -> 401", client.get("/api/trips").status_code == 401)
    check("garbage token -> 401", client.get("/api/trips", headers={"Authorization": "Bearer nope"}).status_code == 401)

    bad = client.post("/api/auth/login", json={"identifier": "owner@ramdarbar.com", "password": "wrong"})
    check("wrong password -> 401", bad.status_code == 401, bad.json().get("detail", ""))

    # identifier trim + lowercase
    res = client.post(
        "/api/auth/login", json={"identifier": "  OWNER@RamDarbar.COM ", "password": "ramdarbar123"}
    )
    check("login works", res.status_code == 200, str(res.status_code))
    headers = {"Authorization": f"Bearer {res.json()['access_token']}"}

    again = client.post("/api/auth/login", json={"identifier": "owner@ramdarbar.com", "password": "ramdarbar123"})
    check("login repeat (password hash intact)", again.status_code == 200, str(again.status_code))
    headers = {"Authorization": f"Bearer {again.json()['access_token']}"}

    codes = [
        client.post("/api/auth/login", json={"identifier": "owner@ramdarbar.com", "password": "nope"}).status_code
        for _ in range(5)
    ]
    check("5 wrong attempts -> 429 lockout", codes[-1] == 429, str(codes))
    locked = client.post("/api/auth/login", json={"identifier": "owner@ramdarbar.com", "password": "ramdarbar123"})
    check("lockout blocks correct password", locked.status_code == 429, str(locked.status_code))
    from routers.auth import _failures

    _failures.clear()

    # --- signup: create new user ---
    import otp as otp_service

    check(
        "signup short password -> 422",
        client.post(
            "/api/auth/signup",
            json={"name": "New User", "phone": "9000000001", "password": "abc"},
        ).status_code
        == 422,
    )
    check(
        "signup bad phone -> 400",
        client.post(
            "/api/auth/signup", json={"name": "New User", "phone": "123", "password": "secret123"}
        ).status_code
        == 400,
    )
    signup = client.post(
        "/api/auth/signup", json={"name": "Ravi Kumar", "phone": "90000 00001", "password": "secret123"}
    )
    check("signup creates user", signup.status_code == 200, str(signup.status_code))
    new_user = signup.json().get("user", {})
    check("signup returns token", bool(signup.json().get("access_token")), str(signup.json().keys()))
    check("signup phone normalized", new_user.get("phone") == "919000000001", str(new_user.get("phone")))
    new_token = signup.json().get("access_token")
    check(
        "new user can login",
        client.post("/api/auth/login", json={"identifier": "9000000001", "password": "secret123"}).status_code
        == 200,
    )
    check(
        "duplicate signup blocked",
        client.post(
            "/api/auth/signup", json={"name": "Ravi Kumar", "phone": "9000000001", "password": "secret123"}
        ).status_code
        == 409,
    )
    check(
        "new user token works",
        client.get(
            "/api/auth/me", headers={"Authorization": f"Bearer {new_token}"}
        ).status_code
        == 200,
    )

    # --- OTP: SMS only ---
    import sms as sms_service

    check(
        "otp unknown identifier -> 404",
        client.post("/api/auth/otp/request", json={"identifier": "nobody@x.com"}).status_code == 404,
    )
    check(
        "otp empty identifier -> 400",
        client.post("/api/auth/otp/request", json={"identifier": "  "}).status_code == 400,
    )

    saved = client.put("/api/auth/phone", headers=headers, json={"phone": "98765 43210"})
    check("save phone", saved.status_code == 200, str(saved.status_code))
    check("phone normalized", saved.json().get("phone") == "919876543210", str(saved.json().get("phone")))
    check(
        "short phone -> 400",
        client.put("/api/auth/phone", headers=headers, json={"phone": "123"}).status_code == 400,
    )

    # No gateway configured -> must fail loudly, never return the code.
    otp_service.clear()
    no_gw = client.post("/api/auth/otp/request", json={"identifier": "9876543210"})
    check(
        "otp without gateway -> 502 (no dev code)",
        no_gw.status_code == 502 and "dev_code" not in no_gw.text,
        f"{no_gw.status_code} {no_gw.text[:80]}",
    )

    # Real gateway path: stub the provider call and capture the code.
    sent: dict[str, str] = {}

    def _fake_send(phone: str, code: str, minutes: int) -> str:
        sent["phone"] = phone
        sent["code"] = code
        return "sms"

    real_send = sms_service.send
    sms_service.send = _fake_send

    otp_service.clear()
    sms = client.post("/api/auth/otp/request", json={"identifier": "9876543210"})
    check("otp sms request ok", sms.status_code == 200, str(sms.status_code))
    sms_body = sms.json()
    check("otp channel sms", sms_body.get("channel") == "sms", str(sms_body))
    check("otp sent_to masked", sms_body.get("sent_to") == "******3210", str(sms_body.get("sent_to")))
    check("no dev code in response", "dev_code" not in sms_body, str(sms_body))
    check("otp sent to right number", sent.get("phone") == "919876543210", str(sent.get("phone")))
    check(
        "otp resend blocked -> 429",
        client.post("/api/auth/otp/request", json={"identifier": "9876543210"}).status_code == 429,
    )
    check(
        "otp verify unknown identifier -> 404",
        client.post("/api/auth/otp/verify", json={"identifier": "x@y.com", "code": "123456"}).status_code == 404,
    )
    check(
        "otp wrong code -> 400",
        client.post(
            "/api/auth/otp/verify", json={"identifier": "9876543210", "code": "000000"}
        ).status_code
        == 400,
    )
    otp_res = client.post(
        "/api/auth/otp/verify", json={"identifier": "9876543210", "code": sms_body and sent["code"]}
    )
    check("otp sms verify -> token", otp_res.status_code == 200, str(otp_res.status_code))
    otp_headers = {"Authorization": f"Bearer {otp_res.json()['access_token']}"}
    check("otp token works", client.get("/api/auth/me", headers=otp_headers).status_code == 200)
    check(
        "me returns phone",
        client.get("/api/auth/me", headers=otp_headers).json().get("phone") == "919876543210",
    )
    check(
        "otp single use",
        client.post(
            "/api/auth/otp/verify", json={"identifier": "9876543210", "code": sent["code"]}
        ).status_code
        == 400,
    )

    # password reset via SMS OTP (no login required)
    otp_service.clear()
    client.post("/api/auth/otp/request", json={"identifier": "9876543210"})
    reset_code = sent["code"]
    check(
        "password reset short -> 400",
        client.post(
            "/api/auth/password-reset",
            json={"identifier": "9876543210", "code": reset_code, "new_password": "abc"},
        ).status_code
        == 400,
    )
    check(
        "password reset wrong code -> 400",
        client.post(
            "/api/auth/password-reset",
            json={"identifier": "9876543210", "code": "000000", "new_password": "reset-pass-123"},
        ).status_code
        == 400,
    )
    otp_service.clear()
    client.post("/api/auth/otp/request", json={"identifier": "9876543210"})
    check(
        "password reset via otp",
        client.post(
            "/api/auth/password-reset",
            json={"identifier": "9876543210", "code": sent["code"], "new_password": "reset-pass-123"},
        ).status_code
        == 200,
    )
    new_login = client.post(
        "/api/auth/login", json={"identifier": "owner@ramdarbar.com", "password": "reset-pass-123"}
    )
    check("login with new password", new_login.status_code == 200, str(new_login.status_code))
    client.post(
        "/api/auth/change-password",
        headers={"Authorization": f"Bearer {new_login.json()['access_token']}"},
        json={"old_password": "reset-pass-123", "new_password": "ramdarbar123"},
    )
    otp_service.clear()
    sms_service.send = real_send

    check("me endpoint", client.get("/api/auth/me", headers=headers).status_code == 200)
    check("me hides password hash", "password_hash" not in client.get("/api/auth/me", headers=headers).json())
    check(
        "login still works after /me",
        client.post("/api/auth/login", json={"identifier": "owner@ramdarbar.com", "password": "ramdarbar123"}).status_code
        == 200,
    )

    change = client.post(
        "/api/auth/change-password",
        headers=headers,
        json={"old_password": "ramdarbar123", "new_password": "ramdarbar123"},
    )
    check("change password", change.status_code == 200, str(change.status_code))

    client.post("/api/admin/reset", headers=headers)
    res = client.post("/api/auth/login", json={"identifier": "owner@ramdarbar.com", "password": "ramdarbar123"})
    headers = {"Authorization": f"Bearer {res.json()['access_token']}"}

    truck = client.post(
        "/api/trucks",
        headers=headers,
        json={"registration_no": "MH 12 AB 1234", "model": "Tata Prima 407", "capacity_tons": 9.5, "status": "Available"},
    ).json()
    check("truck create", bool(truck.get("_id")), truck.get("registration_no", ""))

    dup = client.post(
        "/api/trucks",
        headers=headers,
        json={"registration_no": "MH 12 AB 1234", "model": "Dup", "capacity_tons": 5, "status": "Available"},
    )
    check("duplicate registration blocked", dup.status_code == 409, dup.json().get("detail", ""))

    bad_truck = client.post("/api/trucks", headers=headers, json={"registration_no": "", "model": "", "capacity_tons": 0})
    check("truck validation", bad_truck.status_code in (400, 422), str(bad_truck.status_code))

    driver = client.post(
        "/api/drivers",
        headers=headers,
        json={"name": "Ramesh Kumar", "phone": "9876543210", "license_no": "MH1420199912", "salary": 18000, "advance": 4000},
    ).json()
    check("driver create", bool(driver.get("_id")), driver.get("name", ""))

    trip = client.post(
        "/api/trips",
        headers=headers,
        json={
            "party_name": "Sharma Traders",
            "from_location": "Delhi",
            "to_location": "Jaipur",
            "goods": "Cement Bags (200)",
            "truck_id": truck["_id"],
            "driver_id": driver["_id"],
            "freight_amount": 28000,
            "advance": 10000,
            "date": "2026-01-15",
            "status": "Delivered",
        },
    ).json()
    check("trip create", bool(trip.get("_id")), trip.get("party_name", ""))

    trip2 = client.post(
        "/api/trips",
        headers=headers,
        json={
            "party_name": "Sharma Traders",
            "from_location": "Delhi",
            "to_location": "Kota",
            "goods": "Bricks",
            "truck_id": truck["_id"],
            "driver_id": driver["_id"],
            "freight_amount": 15000,
            "advance": 0,
            "date": "2026-02-10",
            "status": "Pending",
        },
    ).json()
    check("second trip create", bool(trip2.get("_id")))

    trip3 = client.post(
        "/api/trips",
        headers=headers,
        json={
            "party_name": "Verma Steel",
            "from_location": "Alwar",
            "to_location": "Delhi",
            "goods": "TMT Bars",
            "truck_id": truck["_id"],
            "driver_id": driver["_id"],
            "freight_amount": 22000,
            "advance": 5000,
            "date": "2026-02-20",
            "status": "Cancelled",
        },
    ).json()

    for amount, category in ((8500, "Fuel"), (1200, "Toll"), (3000, "Driver Advance")):
        res = client.post(
            "/api/expenses",
            headers=headers,
            json={"category": category, "amount": amount, "date": "2026-01-16", "trip_id": trip["_id"], "truck_id": truck["_id"], "note": "test"},
        )
        check(f"expense create ({category})", res.status_code in (200, 201), str(res.status_code))

    pay = client.post(
        "/api/payments",
        headers=headers,
        json={"trip_id": trip["_id"], "amount": 8000, "date": "2026-01-20", "mode": "Bank", "reference": "NEFT-1"},
    )
    check("payment create", pay.status_code in (200, 201), str(pay.status_code))

    bad_pay = client.post(
        "/api/payments", headers=headers, json={"trip_id": "", "amount": 100, "date": "2026-01-20", "mode": "Cash"}
    )
    check("payment needs trip", bad_pay.status_code in (400, 422), str(bad_pay.status_code))

    trips = client.get("/api/trips", headers=headers).json()
    target = next(t for t in trips if t["_id"] == trip["_id"])
    check("trip expense total", target["expense_total"] == 12700, str(target["expense_total"]))
    check("trip received total", target["received_total"] == 18000, str(target["received_total"]))
    check("trip pending", target["pending_amount"] == 10000, str(target["pending_amount"]))
    check("trip profit", target["profit"] == 15300, str(target["profit"]))

    bilty = client.get(f"/api/trips/{trip['_id']}/bilty.pdf", headers=headers)
    check("bilty pdf", bilty.status_code == 200 and bilty.content[:4] == b"%PDF", f"{bilty.status_code} {len(bilty.content)}b")

    dash = client.get("/api/dashboard", headers=headers).json()
    check("dashboard excludes cancelled", dash["kpi"]["total_trips"] == 2, str(dash["kpi"]["total_trips"]))
    check("dashboard revenue", dash["kpi"]["total_revenue"] == 43000, str(dash["kpi"]["total_revenue"]))
    check("dashboard 6 months", len(dash["monthly"]) == 6, str(len(dash["monthly"])))

    report = client.get("/api/reports/trips", headers=headers).json()
    check("report rows exclude cancelled", len(report["rows"]) == 2, str(len(report["rows"])))
    check("report counts cancelled", report["totals"]["cancelled"] == 1, str(report["totals"]["cancelled"]))

    parties = client.get("/api/accounts/parties", headers=headers).json()
    sharma = next((r for r in parties["rows"] if r["party_name"] == "Sharma Traders"), None)
    check("party ledger row", sharma is not None)
    if sharma:
        check("party freight", sharma["freight"] == 43000, str(sharma["freight"]))
        check("party pending", sharma["pending"] == 25000, str(sharma["pending"]))
    check("cancelled party hidden", all(r["party_name"] != "Verma Steel" for r in parties["rows"]))

    aging = client.get("/api/accounts/outstanding-aging", headers=headers).json()
    check("aging buckets", len(aging["buckets"]) == 4, str(len(aging["buckets"])))
    check("aging total", aging["total_pending"] == 25000, str(aging["total_pending"]))
    check("aging rows", len(aging["rows"]) == 2, str(len(aging["rows"])))

    truck_pl = client.get("/api/accounts/truck-wise", headers=headers).json()
    check("truck pnl row", len(truck_pl["rows"]) == 1, str(len(truck_pl["rows"])))
    check("truck profit", truck_pl["rows"][0]["profit"] == 30300, str(truck_pl["rows"][0]["profit"]))

    payouts = client.get("/api/accounts/driver-payouts", headers=headers).json()
    check("driver payout row", len(payouts["rows"]) == 1, str(len(payouts["rows"])))
    check("driver balance", payouts["rows"][0]["balance"] == 14000, str(payouts["rows"][0]["balance"]))
    check(
        "driver advance untouched by trip advance",
        payouts["rows"][0]["advance"] == 4000,
        str(payouts["rows"][0]["advance"]),
    )

    pnl = client.get("/api/accounts/profit-loss", headers=headers).json()
    check("pnl trips", pnl["summary"]["trips"] == 2, str(pnl["summary"]["trips"]))
    check("pnl net profit", pnl["summary"]["net_profit"] == 30300, str(pnl["summary"]["net_profit"]))
    check("pnl driver advance split", pnl["summary"]["driver_advance"] == 3000, str(pnl["summary"]["driver_advance"]))

    ledger = client.get(f"/api/accounts/trip/{trip['_id']}", headers=headers).json()
    check("trip ledger detail", ledger.get("truck_no") == "MH 12 AB 1234", str(ledger.get("truck_no")))
    check("trip ledger expenses", len(ledger.get("expenses", [])) == 3, str(len(ledger.get("expenses", []))))
    check("trip ledger payments", len(ledger.get("payments", [])) == 1, str(len(ledger.get("payments", []))))

    missing = client.get("/api/accounts/trip/does-not-exist", headers=headers)
    check("trip ledger 404", missing.status_code == 404, str(missing.status_code))

    check("trip delete", client.delete(f"/api/trips/{trip3['_id']}", headers=headers).status_code == 200)
    busy_truck = client.delete(f"/api/trucks/{truck['_id']}", headers=headers)
    check("truck with trips blocked", busy_truck.status_code == 409, busy_truck.json().get("detail", ""))
    check("trip delete 2", client.delete(f"/api/trips/{trip['_id']}", headers=headers).status_code == 200)
    check("trip delete 3", client.delete(f"/api/trips/{trip2['_id']}", headers=headers).status_code == 200)
    check("truck delete", client.delete(f"/api/trucks/{truck['_id']}", headers=headers).status_code == 200)
    check("driver delete", client.delete(f"/api/drivers/{driver['_id']}", headers=headers).status_code == 200)

    check("demo endpoint removed", client.post("/api/admin/demo-data", headers=headers).status_code == 404)

    check("reset", client.post("/api/admin/reset", headers=headers).status_code == 200)
    check("empty after reset", client.get("/api/health").json()["counts"]["trips"] == 0)
    check(
        "owner survives reset",
        client.post("/api/auth/login", json={"identifier": "owner@ramdarbar.com", "password": "ramdarbar123"}).status_code
        == 200,
    )

print("\nRESULT:", "ALL PASS" if ok else "SOME FAILED")