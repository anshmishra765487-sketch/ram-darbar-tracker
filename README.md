# Ram Darbar Tracker — Truck Transport Management

> **Live demo:** https://clips-tale-eleven-allowance.trycloudflare.com
> (temporary Cloudflare quick tunnel — data resets when server restarts.
> Login screen se "Create a new account" karke apna account banao.)

Complete transport business accounting in one place: trips (consignment), trucks, drivers,
expenses, party payments, accounting reports and printable **bilty PDF**.
The entire UI is **English only**.

Stack: **React 19 + Vite + Tailwind CSS v4 + Recharts + Phosphor Icons + Sonner + axios**
(frontend) aur **Python FastAPI + Motor (MongoDB) + PyJWT + bcrypt + ReportLab** (backend).
Design: Slate + Orange, mobile par bottom navigation.

---

## Chalane ka tareeka (2 terminal)

### Terminal 1 — Backend
```bash
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

### Terminal 2 — Frontend
```bash
cd frontend
npm install
npm run dev
```

Browser me kholein: **http://localhost:5173**

**Login zaroori hai.** 2 tarike hain:

1. **Mobile OTP** — apna 10-digit number daalein, "Send OTP" dabayein, SMS par aaya code daalein.
2. **Password** — user ka password `ADMIN_PASSWORD` / Account page se set hota hai
   (owner default `ramdarbar123`). Ye login screen par **nahi** dikhaya jata.
   Password bhool gaye to OTP tab se "Password bhool gaye?" dabayein.

**Create account**: Login screen par "Create a new account" dabayein — naam, mobile number
aur password (min 6 characters). Account banate hi app open ho jata hai.

Apna number Account page se save kar sakte hain, ya `.env` me `ADMIN_PHONE`.
**Real SMS ke liye SMS gateway zaroori hai** — koi demo/log mode nahi hai:

```bash
ADMIN_PHONE=9876543210
SMS_PROVIDER=fast2sms      # ya msg91 / twilio
FAST2SMS_KEY=xxxx
```

Gateway set nahi hai to OTP request `502` fail hoti hai aur code kabhi screen ya terminal par
dikhata nahi.

Database app start par **khali** rehta hai — apna data khud add karein:
Trucks → Drivers → Trips → Expenses/Payments. Koi demo data seed nahi hota.

Reset karna ho: Account page par **Clear all data**, ya `POST /api/admin/reset`.
Reset sirf business data mita hai — user accounts safe rehte hain, logout nahi hota.

---

## MongoDB ke baare me

- MongoDB installed hai → app khud use kar legi (`MONGO_URI` se connect).
- MongoDB **nahi** hai → app automatically **in-memory** store pe chal jayegi aur terminal me
  likh degi `[db] storage = memory`. Data server restart pe reset hoga, baaki sab kaam karega.
- Settings badalne ke liye `backend/.env.example` ko `backend/.env` banaayein
  (`MONGO_URI`, `AUTH_REQUIRED`, `ADMIN_PASSWORD`, `JWT_SECRET`, `CORS_ORIGINS`).

### Login

`AUTH_REQUIRED=true` (default) → login screen. Har API par JWT token chahiye.

Apna password `.env` me set karein, ya login ke baad Account page se badal dein:

```bash
ADMIN_PASSWORD=apna-strong-password
```

`AUTH_REQUIRED=false` sirf local testing ke liye — us case me app bina login khul jayegi.

---

## Features

| Page | Kya karta hai |
|---|---|
| **Dashboard** | 5 KPI cards, Net Profit + margin, 6-month Revenue vs Expenses chart, expense breakdown, status-wise trips, recent trips. Naya: **Top Party**, **Best Truck**, **Outstanding Alert** insight cards. |
| **Trips** | Party, route, goods, truck, driver, freight, advance, date, status. Status dropdown, edit/delete, **Bilty PDF**, aur **Ledger** button. |
| **Trips → Ledger** | Naya: ek trip ka poora hisaab — Charges (freight + expenses) vs Receipts (advance + payments), item-wise lists, balance due, profit aur margin. |
| **Trucks** | Registration number (duplicate blocked), model, capacity (ton), status. |
| **Drivers** | Naam, phone (tap-to-call), license, salary, advance. |
| **Expenses** | Fuel / Toll / Maintenance / Driver Advance / Other, amount, date, trip-truck link, category cards. |
| **Payments** | Party se aaya paisa: amount, date, mode (Cash/Bank/UPI/Cheque), reference, trip linked. |
| **Reports** | Har trip ka hisaab + total footer + CSV export + **Clear all data**. Cancelled trips alag count hote hain. |
| **Accounts** | Naya: 5 accounting tabs — Party Ledger, Outstanding Aging (0-30/31-60/61-90/90+), Truck-wise P&L, Driver Payouts, aur Profit & Loss. |

Extra: Hindi/English toggle, mobile bottom nav, Sonner toasts, slate/orange theme, Recharts.

---

## Bilty PDF

`GET /api/trips/{id}/bilty.pdf` → ReportLab se A4 PDF: bilty number, party/consignee, maal,
route, truck, driver, freight summary (freight, advance, received, **balance due**),
expenses, profit, payment history aur signature lines. Delivery ke time party ko dete hain.

---

## Accounting reports (Accounts page)

| Endpoint | Kya deta hai |
|---|---|
| `GET /api/accounts/parties` | Party-wise: trips, freight, expenses, received, pending, profit (pending descending). |
| `GET /api/accounts/outstanding-aging` | Pending amount age-wise buckets + oldest-first trip list. |
| `GET /api/accounts/truck-wise` | Har truck ka trips, freight, expense, profit, profit-per-trip. |
| `GET /api/accounts/driver-payouts` | Driver-wise trips, freight, salary, advance, balance payable. |
| `GET /api/accounts/profit-loss` | Income by status, expense head-wise, cash vs driver-advance split, net profit, margin. |
| `GET /api/accounts/trip/{id}` | Single trip ka poora ledger (charges, receipts, expense/payment items). |

Cancelled trips in sabhi reports se bahar rehte hain.

---

## API

Sabhi endpoints par login chahiye (`AUTH_REQUIRED=true`): pehle `POST /api/auth/login` se token lo,
phir har request me `Authorization: Bearer <token>` bhejo. Sirf `GET /api/health` aur
`GET /api/owner` public hain.

```
GET    /api/health
GET    /api/dashboard
GET    /api/trips                   POST /api/trips
GET    /api/trips/{id}              PUT  /api/trips/{id}       DELETE /api/trips/{id}
GET    /api/trips/{id}/bilty.pdf
GET    /api/trucks                  POST /api/trucks          PUT/DELETE /api/trucks/{id}
GET    /api/drivers                 POST /api/drivers         PUT/DELETE /api/drivers/{id}
GET    /api/expenses                POST /api/expenses        PUT/DELETE /api/expenses/{id}
GET    /api/payments                POST /api/payments        PUT/DELETE /api/payments/{id}
GET    /api/reports/trips           GET  /api/reports/trips/{id}
GET    /api/accounts/parties | outstanding-aging | truck-wise | driver-payouts | profit-loss
GET    /api/accounts/trip/{id}
POST   /api/admin/reset | /api/admin/set-password
POST   /api/auth/login              GET  /api/auth/me | /api/owner
POST   /api/auth/signup             POST /api/auth/change-password    PUT  /api/auth/phone
POST   /api/auth/otp/request        POST /api/auth/otp/verify
POST   /api/auth/password-reset
```

---

## Test

```bash
cd backend
python test_api.py
```

Login + 90+ checks — 401 without token, wrong password, owner login, password hash
survives `/auth/me`, change password, 5-attempt lockout, signup (create + duplicate block +
new user login), poora SMS OTP flow (no-gateway 502 with no code leak, cooldown, wrong code,
single use, token), phone save, OTP se password reset, duplicate truck block, trip ledger math,
over-payment block, dashboard 6 months, reports totals, bilty PDF, saare 6 accounting
endpoints, cascade delete, reset.

---

## File map

```
backend/
    main.py                 FastAPI app, CORS, startup, admin endpoints
    database.py             Motor/MongoDB + in-memory fallback (same API)
otp.py                  OTP: generate, expiry, cooldown, SMS delivery
    sms.py                  SMS gateway (fast2sms / msg91 / twilio) — real SMS only
    models.py               Pydantic schemas (validation)
    security.py             bcrypt hashing (pbkdf2 fallback) + JWT
    deps.py                 auth dependency + trip ledger math
    routers/                auth, trucks, drivers, trips, expenses, payments,
                             dashboard, reports, bilty (PDF), accounts
    test_api.py             smoke tests

frontend/
    src/App.jsx             routes (login + protected app)
    src/main.jsx            I18nProvider + AuthProvider + router
    src/lib/                api.js (axios + token), auth.jsx (login/signup/OTP/logout),
                             i18n.jsx (English strings), utils.js
    src/components/         AppShell (sidebar + bottom nav + logout),
                             TripLedger, ui/ (button, card, input, table, modal)
    src/pages/              Login (Mobile OTP / Password / Create account), Dashboard,
                             Trips, Trucks, Drivers, Expenses, Payments, Reports,
                             Accounts, Account
    vite.config.js          dev server + /api proxy → 127.0.0.1:8000
```