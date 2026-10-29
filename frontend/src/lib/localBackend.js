// Offline backend - saara data phone/browser ke localStorage me rehta hai.
// Ye backend FastAPI ke endpoints ko JS me dobara likhta hai, isliye app
// bina kisi server ke chalti hai (kisi bhi network par, GitHub Pages par bhi).

const DB_KEY = "rdt_offline_db_v1";
const TOKEN_KEY = "rdt_token";
const USER_KEY = "rdt_user";
const COLLECTIONS = ["users", "trucks", "drivers", "trips", "expenses", "payments", "locations", "audit"];

const OWNER = {
  _id: "local-owner",
  email: "owner@ramdarbar.com",
  name: "Owner",
  phone: "9999999999",
  password_hash: "ramdarbar123",
  role: "owner",
};

const pendingOtps = new Map();

// --- helpers --------------------------------------------------------------

function nowIso() {
  return new Date().toISOString();
}

function uid() {
  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(12);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return Math.random().toString(16).slice(2).padEnd(12, "0") + Date.now().toString(16);
}

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function round3(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 1000) / 1000;
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  if (digits.startsWith("91") && digits.length === 12) return digits;
  return digits.replace(/^0+/, "");
}

function httpError(status, detail, extra = {}) {
  const error = new Error(detail);
  error.isLocalApi = true;
  error.status = status;
  error.code = `HTTP_${status}`;
  error.response = {
    status,
    data: { detail },
    headers: extra.headers || {},
    config: {},
  };
  return error;
}

// --- storage --------------------------------------------------------------

function freshDb() {
  const db = {};
  for (const name of COLLECTIONS) db[name] = [];
  db.users.push({ ...OWNER, created_at: nowIso() });
  return db;
}

function loadDb() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      for (const name of COLLECTIONS) if (!Array.isArray(parsed[name])) parsed[name] = [];
      if (!parsed.users.length) parsed.users.push({ ...OWNER, created_at: nowIso() });
      return parsed;
    }
  } catch {
    /* corrupted storage -> start fresh */
  }
  const db = freshDb();
  saveDb(db);
  return db;
}

function saveDb(db) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    /* storage full / disabled */
  }
}

let DB = loadDb();

function persist() {
  saveDb(DB);
}

// --- audit / activity log -------------------------------------------------
// Har login aur har data change yahan record hota hai, taaki owner ko pata rahe
// kis staff ne kab kya kiya.

const AUDIT_LIMIT = 3000;

function actorOf(user) {
  if (!user) return { user_id: null, user_name: "System", user_phone: "", role: "system" };
  return {
    user_id: user._id || null,
    user_name: user.name || user.email || "Owner",
    user_phone: user.phone || "",
    role: user.role || "user",
  };
}

function logEvent({ type = "action", action = "", entity = null, entity_id = null, summary = "", actor } = {}) {
  const who = actorOf(actor || currentUserRecord());
  const entry = { _id: uid(), at: nowIso(), type, action, entity, entity_id, summary, ...who };
  DB.audit.push(entry);
  if (DB.audit.length > AUDIT_LIMIT) DB.audit.splice(0, DB.audit.length - AUDIT_LIMIT);
  persist();
  return entry;
}

function stampCreate(doc) {
  const who = actorOf(currentUserRecord());
  return {
    ...doc,
    created_by: who.user_id,
    created_by_name: who.user_name,
    created_by_phone: who.user_phone,
    created_by_role: who.role,
  };
}

function stampUpdate(patch) {
  const who = actorOf(currentUserRecord());
  return { ...patch, updated_by: who.user_id, updated_by_name: who.user_name, updated_at: nowIso() };
}

// --- generic collection ops ----------------------------------------------

function matchFilter(doc, filter) {
  for (const [key, value] of Object.entries(filter || {})) {
    const actual = doc[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [op, operand] of Object.entries(value)) {
        if (op === "$ne" && actual === operand) return false;
        if (op === "$in" && !operand.includes(actual)) return false;
        if (op === "$gte" && !(actual >= operand)) return false;
        if (op === "$lte" && !(actual <= operand)) return false;
      }
    } else if (actual !== value) {
      return false;
    }
  }
  return true;
}

function findMany(collection, filter, sort) {
  let items = DB[collection].filter((doc) => matchFilter(doc, filter)).map((doc) => ({ ...doc }));
  if (sort) {
    for (const [field, direction] of [...sort].reverse()) {
      items.sort((a, b) => {
        const av = a[field];
        const bv = b[field];
        if (av === bv) return 0;
        if (av === undefined || av === null) return 1;
        if (bv === undefined || bv === null) return -1;
        return (av < bv ? -1 : 1) * (direction < 0 ? -1 : 1);
      });
    }
  }
  return items;
}

function findOne(collection, filter) {
  const found = DB[collection].find((doc) => matchFilter(doc, filter));
  return found ? { ...found } : null;
}

function insertOne(collection, doc) {
  const record = { ...doc };
  if (!record._id) record._id = uid();
  DB[collection].push(record);
  persist();
  return record._id;
}

function updateOne(collection, id, patch) {
  const doc = DB[collection].find((item) => item._id === id);
  if (!doc) return false;
  Object.assign(doc, patch);
  persist();
  return true;
}

function deleteOne(collection, id) {
  const index = DB[collection].findIndex((item) => item._id === id);
  if (index < 0) return false;
  DB[collection].splice(index, 1);
  persist();
  return true;
}

// --- auth helpers ---------------------------------------------------------

function looksLikePhone(value) {
  return /^\d{10,}$/.test(String(value || "").trim());
}

function findUser(identifier) {
  const value = String(identifier || "").trim();
  if (!value) return null;
  if (looksLikePhone(value)) {
    const target = normalizePhone(value);
    const found = DB.users.find((user) => normalizePhone(user.phone) === target);
    return found ? { ...found } : null;
  }
  return findOne("users", { email: value.toLowerCase() });
}

function findUserByPhone(value) {
  const target = normalizePhone(value);
  if (!target) return null;
  const found = DB.users.find((user) => normalizePhone(user.phone) === target);
  return found ? { ...found } : null;
}

function currentUserRecord() {
  const token = localStorage.getItem(TOKEN_KEY) || "";
  const match = /^offline:(.+)$/.exec(token);
  const id = match ? match[1] : OWNER._id;
  return findOne("users", { _id: id }) || findOne("users", { _id: OWNER._id }) || DB.users[0];
}

function publicUser(user) {
  if (!user) return { id: OWNER._id, email: OWNER.email, name: OWNER.name, phone: OWNER.phone };
  return {
    id: user._id,
    email: user.email || OWNER.email,
    name: user.name || "Owner",
    phone: user.phone || "",
    role: user.role || "user",
  };
}

function sessionFor(user) {
  return {
    access_token: `offline:${user._id}`,
    token_type: "bearer",
    user: publicUser(user),
  };
}

// --- trip financials ------------------------------------------------------

function addTripFinancials(trips, expenses, payments) {
  const expenseByTrip = {};
  const paymentByTrip = {};
  for (const expense of expenses) {
    if (expense.trip_id) expenseByTrip[expense.trip_id] = (expenseByTrip[expense.trip_id] || 0) + Number(expense.amount || 0);
  }
  for (const payment of payments) {
    if (payment.trip_id) paymentByTrip[payment.trip_id] = (paymentByTrip[payment.trip_id] || 0) + Number(payment.amount || 0);
  }
  for (const trip of trips) {
    const id = trip._id;
    const freight = Number(trip.freight_amount || 0);
    const advance = Number(trip.advance || 0);
    const tripExpense = expenseByTrip[id] || 0;
    const received = advance + (paymentByTrip[id] || 0);
    const loadTons = Number(trip.load_tons || 0);
    const purchase = Number(trip.purchase_amount || 0);
    const sale = Number(trip.sale_amount || 0);
    const extra = Number(trip.extra_expense || 0);
    const driverPay = Number(trip.driver_pay || 0);
    const income = freight > 0 ? freight : sale;
    trip.expense_total = round2(tripExpense);
    trip.received_total = round2(received);
    trip.pending_amount = round2(income - received);
    trip.profit = round2(income - tripExpense);
    trip.is_loss = trip.profit < 0;
    trip.load_tons = round3(loadTons);
    trip.rate_per_ton = loadTons > 0 ? round2(income / loadTons) : 0;
    trip.cost_per_ton = loadTons > 0 ? round2(tripExpense / loadTons) : 0;
    // Maal kharida / becha / extra kharcha
    trip.purchase_total = round2(purchase);
    trip.sale_total = round2(sale);
    trip.extra_expense_total = round2(extra);
    trip.driver_pay_total = round2(driverPay);
    trip.trade_expense = round2(tripExpense + extra);
    trip.trade_profit = round2(sale - purchase - extra - tripExpense - driverPay);
    trip.is_trade_loss = trip.trade_profit < 0;
    trip._date = String(trip.date || "");
  }
  return trips;
}

function ledgerTrips() {
  return addTripFinancials(findMany("trips"), findMany("expenses"), findMany("payments"));
}

function tripFinancials(tripId) {
  const trip = findOne("trips", { _id: tripId });
  if (!trip) return null;
  const payments = findMany("payments", { trip_id: tripId });
  const [withNumbers] = addTripFinancials([trip], [], payments);
  return withNumbers;
}

function markPaidIfComplete(tripId) {
  const trip = tripFinancials(tripId);
  if (!trip) return false;
  const freight = Number(trip.freight_amount || 0);
  const received = Number(trip.received_total || 0);
  if (trip.status === "Cancelled") return false;
  if (received >= freight - 0.01 && trip.status !== "Paid") {
    updateOne("trips", tripId, { status: "Paid", paid_at: nowIso() });
    if (trip.truck_id) updateOne("trucks", trip.truck_id, { status: "Available" });
    return true;
  }
  return false;
}

// --- endpoint implementations --------------------------------------------

function authLogin(body) {
  const identifier = String(body.identifier || body.email || "").trim();
  if (!identifier || !body.password) throw httpError(400, "Mobile number and password are required");
  const user = findUser(identifier);
  if (!user || user.password_hash !== String(body.password)) {
    throw httpError(401, "Wrong mobile number or password");
  }
  logEvent({
    type: "login",
    action: "auth.login",
    entity: "user",
    entity_id: user._id,
    summary: `${user.name || user.phone} logged in`,
    actor: user,
  });
  return sessionFor(user);
}

function authLogout() {
  const me = currentUserRecord();
  if (me) {
    logEvent({
      type: "logout",
      action: "auth.logout",
      entity: "user",
      entity_id: me._id,
      summary: `${me.name || me.phone} logged out`,
      actor: me,
    });
  }
  return { ok: true };
}

function authSignup(body) {
  const phone = normalizePhone(body.phone);
  if (phone.length < 11) throw httpError(400, "Enter a valid 10-digit mobile number");
  if (findUserByPhone(phone)) throw httpError(409, "This mobile number is already registered");
  if (String(body.password || "").length < 6) throw httpError(400, "Password must be at least 6 characters");

  let email = String(body.email || "").trim().toLowerCase();
  if (email) {
    if (findOne("users", { email })) throw httpError(409, "This email is already registered");
  } else {
    email = `user_${phone}@ramdarbar.local`;
  }
  const name = String(body.name || "").trim();
  const id = insertOne("users", {
    email,
    phone,
    password_hash: String(body.password),
    name,
    role: "user",
    created_at: nowIso(),
  });
  const created = { _id: id, email, name, phone, role: "user" };
  logEvent({
    type: "signup",
    action: "auth.signup",
    entity: "user",
    entity_id: id,
    summary: `${name || phone} created an account`,
    actor: created,
  });
  return sessionFor(created);
}

function authOtpRequest(body) {
  const identifier = String(body.identifier || "").trim();
  if (!identifier) throw httpError(400, "Enter your mobile number");
  const user = findUser(identifier);
  if (!user) throw httpError(404, "No account found for this mobile number");
  const phone = user.phone || "";
  if (!phone) throw httpError(400, "This account has no mobile number. Add one from Account settings.");

  const code = String(Math.floor(100000 + Math.random() * 900000));
  pendingOtps.set(`user:${user._id}`, { code, expires: Date.now() + 300000 });
  return {
    sent: true,
    via: "sms",
    channel: "demo",
    sent_to: `******${phone.slice(-4)}`,
    expires_in: 300,
    resend_after: 45,
    length: 6,
    demo: true,
    dev_code: code,
  };
}

function checkOtp(userId, code) {
  const entry = pendingOtps.get(`user:${userId}`);
  if (!entry) throw httpError(400, "Request an OTP first");
  if (entry.expires < Date.now()) {
    pendingOtps.delete(`user:${userId}`);
    throw httpError(400, "OTP expired, request a new one");
  }
  if (String(entry.code) !== String(code || "").trim()) throw httpError(400, "Wrong OTP");
  pendingOtps.delete(`user:${userId}`);
}

function authOtpVerify(body) {
  const user = findUser(String(body.identifier || "").trim());
  if (!user) throw httpError(404, "No account found for this mobile number");
  checkOtp(user._id, body.code);
  logEvent({
    type: "login",
    action: "auth.login_otp",
    entity: "user",
    entity_id: user._id,
    summary: `${user.name || user.phone} logged in with OTP`,
    actor: user,
  });
  return sessionFor(user);
}

function authPasswordReset(body) {
  if (String(body.new_password || "").length < 6) throw httpError(400, "New password must be at least 6 characters");
  const user = findUser(String(body.identifier || "").trim());
  if (!user) throw httpError(404, "No account found for this mobile number");
  checkOtp(user._id, body.code);
  updateOne("users", user._id, { password_hash: String(body.new_password) });
  logEvent({ type: "auth", action: "auth.password_reset", entity: "user", entity_id: user._id, summary: "Password reset with OTP", actor: user });
  return { ok: true };
}

function authSavePhone(body) {
  const phone = normalizePhone(body.phone);
  if (phone.length < 11) throw httpError(400, "Enter a valid 10-digit mobile number");
  const me = currentUserRecord();
  const taken = findUserByPhone(phone);
  if (taken && taken._id !== me._id) throw httpError(409, "This number is already used by another account");
  updateOne("users", me._id, { phone });
  return publicUser(findOne("users", { _id: me._id }));
}

function authChangePassword(body) {
  const me = findOne("users", { _id: currentUserRecord()._id });
  if (!me) throw httpError(404, "User not found");
  if (me.password_hash !== String(body.old_password)) throw httpError(401, "Current password is wrong");
  if (String(body.new_password || "").length < 6) throw httpError(400, "New password must be at least 6 characters");
  updateOne("users", me._id, { password_hash: String(body.new_password) });
  logEvent({ type: "auth", action: "auth.change_password", entity: "user", entity_id: me._id, summary: "Changed own password", actor: me });
  return { ok: true };
}

// --- trucks ---------------------------------------------------------------

function listTrucks() {
  return findMany("trucks", null, [["registration_no", 1]]);
}

function createTruck(body) {
  const registration_no = String(body.registration_no || "").trim().toUpperCase();
  const model = String(body.model || "").trim();
  const capacity_tons = Number(body.capacity_tons);
  if (!registration_no || !model || !capacity_tons) throw httpError(400, "Registration, model and capacity are required");
  if (findOne("trucks", { registration_no })) throw httpError(409, "This registration number already exists");
  const data = stampCreate({ registration_no, model, capacity_tons, status: body.status || "Available", created_at: nowIso() });
  const _id = insertOne("trucks", data);
  logEvent({ type: "create", action: "truck.created", entity: "truck", entity_id: _id, summary: `Truck ${registration_no} (${model}) added` });
  return { _id, ...data };
}

function updateTruck(id, body) {
  const current = findOne("trucks", { _id: id });
  if (!current) throw httpError(404, "Truck not found");
  const patch = { ...body };
  if (patch.registration_no !== undefined) {
    patch.registration_no = String(patch.registration_no).trim().toUpperCase();
    const clash = findOne("trucks", { registration_no: patch.registration_no });
    if (clash && clash._id !== id) throw httpError(409, "This registration number already exists");
  }
  if (patch.capacity_tons !== undefined) patch.capacity_tons = Number(patch.capacity_tons);
  updateOne("trucks", id, stampUpdate(patch));
  logEvent({
    type: "update",
    action: "truck.updated",
    entity: "truck",
    entity_id: id,
    summary: `Truck ${patch.registration_no || current.registration_no} updated`,
  });
  return findOne("trucks", { _id: id });
}

function deleteTruck(id) {
  if (findMany("trips", { truck_id: id }).length) throw httpError(409, "This truck has trips, delete those trips first");
  const current = findOne("trucks", { _id: id });
  if (!deleteOne("trucks", id)) throw httpError(404, "Truck not found");
  logEvent({
    type: "delete",
    action: "truck.deleted",
    entity: "truck",
    entity_id: id,
    summary: `Truck ${current?.registration_no || id} deleted`,
  });
  return { deleted: true };
}

// --- drivers --------------------------------------------------------------

function listDrivers() {
  return findMany("drivers", null, [["name", 1]]);
}

function createDriver(body) {
  const data = {
    name: String(body.name || "").trim(),
    phone: String(body.phone || "").trim(),
    license_no: String(body.license_no || "").trim().toUpperCase(),
    salary: Number(body.salary || 0),
    advance: Number(body.advance || 0),
    created_at: nowIso(),
  };
  if (!data.name || !data.phone || !data.license_no) throw httpError(400, "Name, phone and license are required");
  const _id = insertOne("drivers", stampCreate(data));
  logEvent({ type: "create", action: "driver.created", entity: "driver", entity_id: _id, summary: `Driver ${data.name} added` });
  return { _id, ...data };
}

function updateDriver(id, body) {
  const current = findOne("drivers", { _id: id });
  if (!current) throw httpError(404, "Driver not found");
  const patch = { ...body };
  if (patch.license_no !== undefined) patch.license_no = String(patch.license_no).trim().toUpperCase();
  if (patch.salary !== undefined) patch.salary = Number(patch.salary || 0);
  if (patch.advance !== undefined) patch.advance = Number(patch.advance || 0);
  updateOne("drivers", id, stampUpdate(patch));
  logEvent({ type: "update", action: "driver.updated", entity: "driver", entity_id: id, summary: `Driver ${patch.name || current.name} updated` });
  return findOne("drivers", { _id: id });
}

function deleteDriver(id) {
  if (findMany("trips", { driver_id: id }).length) throw httpError(409, "This driver has trips, delete those trips first");
  const current = findOne("drivers", { _id: id });
  if (!deleteOne("drivers", id)) throw httpError(404, "Driver not found");
  logEvent({ type: "delete", action: "driver.deleted", entity: "driver", entity_id: id, summary: `Driver ${current?.name || id} deleted` });
  return { deleted: true };
}

// --- trips ----------------------------------------------------------------

function checkLoad(truckId, loadTons) {
  if (!truckId || loadTons <= 0) return;
  const truck = findOne("trucks", { _id: truckId });
  if (!truck) return;
  const capacity = Number(truck.capacity_tons || 0);
  if (capacity > 0 && loadTons > capacity) {
    throw httpError(400, `Load ${loadTons} tons exceeds ${truck.registration_no} capacity of ${capacity} tons`);
  }
}

function listTrips(query) {
  const status = query.get("status_filter");
  const filter = status ? { status } : null;
  return addTripFinancials(findMany("trips", filter, [["date", -1]]), findMany("expenses"), findMany("payments"));
}

function getTrip(id) {
  const trip = findOne("trips", { _id: id });
  if (!trip) throw httpError(404, "Trip not found");
  const expenses = findMany("expenses", { trip_id: id }, [["date", 1]]);
  const payments = findMany("payments", { trip_id: id }, [["date", 1]]);
  const [withNumbers] = addTripFinancials([trip], findMany("expenses"), findMany("payments"));
  withNumbers.expenses = expenses;
  withNumbers.payments = payments;
  return withNumbers;
}

function createTrip(body) {
  const data = { ...body };
  data.party_name = String(data.party_name || "").trim();
  data.date = data.date ? String(data.date) : nowIso().slice(0, 10);
  data.load_tons = Number(data.load_tons || 0);
  data.freight_amount = Number(data.freight_amount || 0);
  data.advance = Number(data.advance || 0);
  data.purchase_amount = Number(data.purchase_amount || 0);
  data.sale_amount = Number(data.sale_amount || 0);
  data.extra_expense = Number(data.extra_expense || 0);
  data.driver_pay = Number(data.driver_pay || 0);
  data.created_at = nowIso();
  checkLoad(data.truck_id, data.load_tons);
  const _id = insertOne("trips", stampCreate(data));
  if (data.truck_id) updateOne("trucks", data.truck_id, { status: "On-Trip" });
  logEvent({
    type: "create",
    action: "trip.created",
    entity: "trip",
    entity_id: _id,
    summary: `Trip ${data.party_name || ""} ${data.from_location || ""} to ${data.to_location || ""} (Rs ${data.freight_amount || data.sale_amount || 0})`.replace(/\s+/g, " ").trim(),
  });
  return addTripFinancials([{ _id, ...data }], findMany("expenses"), findMany("payments"))[0];
}

function updateTrip(id, body) {
  const current = findOne("trips", { _id: id });
  if (!current) throw httpError(404, "Trip not found");
  const patch = { ...body };
  if (patch.date !== undefined && patch.date !== null) patch.date = String(patch.date);
  if (patch.load_tons !== undefined) patch.load_tons = Number(patch.load_tons || 0);
  if (patch.freight_amount !== undefined) patch.freight_amount = Number(patch.freight_amount || 0);
  if (patch.advance !== undefined) patch.advance = Number(patch.advance || 0);
  if (patch.purchase_amount !== undefined) patch.purchase_amount = Number(patch.purchase_amount || 0);
  if (patch.sale_amount !== undefined) patch.sale_amount = Number(patch.sale_amount || 0);
  if (patch.extra_expense !== undefined) patch.extra_expense = Number(patch.extra_expense || 0);
  if (patch.driver_pay !== undefined) patch.driver_pay = Number(patch.driver_pay || 0);
  checkLoad(patch.truck_id || current.truck_id, Number(patch.load_tons !== undefined ? patch.load_tons : current.load_tons || 0));
  updateOne("trips", id, stampUpdate(patch));

  const newStatus = patch.status;
  if (["Delivered", "Paid", "Cancelled"].includes(newStatus) && current.truck_id) {
    updateOne("trucks", current.truck_id, { status: "Available" });
  } else if (newStatus === "In-Transit" && current.truck_id) {
    updateOne("trucks", current.truck_id, { status: "On-Trip" });
  }
  logEvent({
    type: "update",
    action: "trip.updated",
    entity: "trip",
    entity_id: id,
    summary: `Trip ${patch.party_name || current.party_name || ""} updated${newStatus ? ` -> ${newStatus}` : ""}`.replace(/\s+/g, " ").trim(),
  });
  const updated = findOne("trips", { _id: id });
  return addTripFinancials([updated], findMany("expenses"), findMany("payments"))[0];
}

function deleteTrip(id) {
  const trip = findOne("trips", { _id: id });
  if (!trip) throw httpError(404, "Trip not found");
  findMany("payments", { trip_id: id }).forEach((p) => deleteOne("payments", p._id));
  findMany("expenses", { trip_id: id }).forEach((e) => deleteOne("expenses", e._id));
  findMany("locations", { trip_id: id }).forEach((l) => deleteOne("locations", l._id));
  deleteOne("trips", id);
  if (trip.truck_id) updateOne("trucks", trip.truck_id, { status: "Available" });
  logEvent({
    type: "delete",
    action: "trip.deleted",
    entity: "trip",
    entity_id: id,
    summary: `Trip ${trip.party_name || ""} ${trip.from_location || ""} to ${trip.to_location || ""} deleted`.replace(/\s+/g, " ").trim(),
  });
  return { deleted: true };
}

function tripLocation(id) {
  if (!findOne("trips", { _id: id })) throw httpError(404, "Trip not found");
  const points = findMany("locations", { trip_id: id }, [["recorded_at", 1]]);
  return {
    trip_id: id,
    latest: points.length ? points[points.length - 1] : null,
    has_tracking: points.length > 0,
    points,
    point_count: points.length,
  };
}

function recordLocation(id, body) {
  if (!findOne("trips", { _id: id })) throw httpError(404, "Trip not found");
  const lat = Number(body.latitude ?? body.lat);
  const lng = Number(body.longitude ?? body.lng ?? body.long);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -180 || lat > 180 || lng < -180 || lng > 180) {
    throw httpError(400, "Valid latitude/longitude required");
  }
  const point = {
    trip_id: id,
    latitude: round3(lat),
    longitude: round3(lng),
    speed: Number.isFinite(Number(body.speed)) ? Number(body.speed) : null,
    heading: Number.isFinite(Number(body.heading)) ? Number(body.heading) : null,
    accuracy: Number.isFinite(Number(body.accuracy)) ? Number(body.accuracy) : null,
    recorded_at: String(body.recorded_at || nowIso()),
    source: body.source || "device",
  };
  insertOne("locations", point);
  const all = findMany("locations", { trip_id: id }, [["recorded_at", 1]]);
  if (all.length > 500) all.slice(0, all.length - 500).forEach((stale) => deleteOne("locations", stale._id));
  return { saved: true, trip_id: id, point };
}

// --- expenses -------------------------------------------------------------

function listExpenses(query) {
  const filter = {};
  if (query.get("category")) filter.category = query.get("category");
  if (query.get("trip_id")) filter.trip_id = query.get("trip_id");
  return findMany("expenses", filter, [["date", -1]]);
}

function createExpense(body) {
  const data = stampCreate({ ...body, amount: Number(body.amount), date: String(body.date || nowIso().slice(0, 10)), created_at: nowIso() });
  const _id = insertOne("expenses", data);
  logEvent({
    type: "create",
    action: "expense.created",
    entity: "expense",
    entity_id: _id,
    summary: `Expense ${data.category || "general"} Rs ${data.amount || 0}`,
  });
  return { _id, ...data };
}

function updateExpense(id, body) {
  const current = findOne("expenses", { _id: id });
  if (!current) throw httpError(404, "Expense not found");
  const patch = { ...body };
  if (patch.amount !== undefined) patch.amount = Number(patch.amount);
  if (patch.date !== undefined && patch.date !== null) patch.date = String(patch.date);
  updateOne("expenses", id, stampUpdate(patch));
  logEvent({
    type: "update",
    action: "expense.updated",
    entity: "expense",
    entity_id: id,
    summary: `Expense ${patch.category || current.category || "general"} updated (Rs ${patch.amount ?? current.amount ?? 0})`,
  });
  return findOne("expenses", { _id: id });
}

function deleteExpense(id) {
  const current = findOne("expenses", { _id: id });
  if (!deleteOne("expenses", id)) throw httpError(404, "Expense not found");
  logEvent({
    type: "delete",
    action: "expense.deleted",
    entity: "expense",
    entity_id: id,
    summary: `Expense ${current?.category || "general"} Rs ${current?.amount || 0} deleted`,
  });
  return { deleted: true };
}

// --- payments -------------------------------------------------------------

function listPayments(query) {
  const filter = query.get("trip_id") ? { trip_id: query.get("trip_id") } : null;
  return findMany("payments", filter, [["date", -1]]);
}

function createPayment(body) {
  const trip = findOne("trips", { _id: body.trip_id });
  if (!trip) throw httpError(400, "Trip not found");
  const amount = Number(body.amount);
  const previous = findMany("payments", { trip_id: body.trip_id });
  const already = Number(trip.advance || 0) + previous.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const income = Number(trip.freight_amount || 0) || Number(trip.sale_amount || 0);
  if (already + amount > income + 0.01) {
    throw httpError(400, "Payment is more than the trip amount");
  }
  const data = {
    trip_id: body.trip_id,
    party_name: trip.party_name || "",
    amount,
    date: String(body.date || nowIso().slice(0, 10)),
    mode: body.mode || "Cash",
    reference: body.reference || "",
    note: body.note || "",
    created_at: nowIso(),
  };
  const _id = insertOne("payments", stampCreate(data));
  const completed = markPaidIfComplete(body.trip_id);
  logEvent({
    type: "create",
    action: "payment.created",
    entity: "payment",
    entity_id: _id,
    summary: `Payment received from ${data.party_name || "party"} Rs ${data.amount}`,
  });
  return { _id, ...data, trip_status: completed ? "Paid" : trip.status || "", trip_completed: completed };
}

function updatePayment(id, body) {
  const existing = findOne("payments", { _id: id });
  if (!existing) throw httpError(404, "Payment not found");
  const patch = { ...body };
  if (patch.amount !== undefined) patch.amount = Number(patch.amount);
  if (patch.date !== undefined && patch.date !== null) patch.date = String(patch.date);
  updateOne("payments", id, stampUpdate(patch));
  markPaidIfComplete(existing.trip_id);
  logEvent({
    type: "update",
    action: "payment.updated",
    entity: "payment",
    entity_id: id,
    summary: `Payment ${existing.party_name || ""} updated (Rs ${patch.amount ?? existing.amount ?? 0})`.replace(/\s+/g, " ").trim(),
  });
  return findOne("payments", { _id: id });
}

function deletePayment(id) {
  const existing = findOne("payments", { _id: id });
  if (!deleteOne("payments", id)) throw httpError(404, "Payment not found");
  if (existing) markPaidIfComplete(existing.trip_id);
  logEvent({
    type: "delete",
    action: "payment.deleted",
    entity: "payment",
    entity_id: id,
    summary: `Payment ${existing?.party_name || ""} Rs ${existing?.amount || 0} deleted`.replace(/\s+/g, " ").trim(),
  });
  return { deleted: true };
}

function paymentRequest(tripId) {
  const trip = tripFinancials(tripId);
  if (!trip) throw httpError(404, "Trip not found");
  const pending = round2(Math.max(Number(trip.pending_amount || 0), 0));
  const note = `${trip.party_name || ""} ${trip.from_location || ""} to ${trip.to_location || ""}`.replace(/\s+/g, " ").trim().slice(0, 50);
  return {
    trip_id: tripId,
    party_name: trip.party_name || "",
    freight_amount: trip.freight_amount || 0,
    received_total: trip.received_total || 0,
    pending_amount: pending,
    currency: "INR",
    payee_name: "Ram Darbar Transport",
    vpa: "",
    note,
    upi_link: "",
    qr_payload: "",
    gateway_configured: false,
    status: trip.status || "",
    message: pending > 0 ? `Payment of Rs ${pending.toFixed(2)} pending - ${note}` : "This trip is fully paid",
  };
}

function scanPayment(tripId, body) {
  const trip = findOne("trips", { _id: tripId });
  if (!trip) throw httpError(404, "Trip not found");
  const amount = Number(body.amount);
  if (!amount || amount <= 0) throw httpError(400, "Enter the amount received");
  const mode = ["Cash", "Bank", "UPI", "Cheque"].includes(body.mode) ? body.mode : "UPI";
  const record = {
    trip_id: tripId,
    party_name: trip.party_name || "",
    amount: round2(amount),
    date: String(body.date || nowIso()).slice(0, 10),
    mode,
    reference: String(body.reference || body.txn_id || "").trim(),
    note: String(body.note || "Scanned payment").trim(),
    source: body.source || "scanner",
    created_at: nowIso(),
  };
  const payment_id = insertOne("payments", stampCreate(record));
  const completed = markPaidIfComplete(tripId);
  logEvent({
    type: "create",
    action: "payment.scanned",
    entity: "payment",
    entity_id: payment_id,
    summary: `Scanned payment ${record.party_name || ""} Rs ${record.amount}`.replace(/\s+/g, " ").trim(),
  });
  const updated = tripFinancials(tripId);
  const alreadyPaid = updated.status === "Paid";
  let message;
  if (completed) message = "Full payment received - trip automatically marked Paid";
  else if (alreadyPaid) message = "Trip was already fully paid; extra payment recorded";
  else message = `Payment recorded - Rs ${Math.max(Number(updated.pending_amount || 0), 0).toFixed(2)} still pending`;
  return {
    payment_id,
    received_total: updated.received_total || 0,
    pending_amount: round2(Math.max(Number(updated.pending_amount || 0), 0)),
    trip_status: updated.status || "",
    trip_completed: completed,
    message,
  };
}

// --- dashboard ------------------------------------------------------------

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthLabel(key) {
  const [year, month] = key.split("-");
  return `${MONTH_NAMES[Number(month) - 1]} ${year.slice(2)}`;
}

function lastSixMonths() {
  const months = [];
  const cursor = new Date();
  cursor.setDate(1);
  for (let i = 0; i < 6; i += 1) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
    cursor.setMonth(cursor.getMonth() - 1);
  }
  return months.reverse();
}

function dashboard() {
  const trips = ledgerTrips();
  const expenses = findMany("expenses");
  const active = trips.filter((t) => t.status !== "Cancelled");

  const totalRevenue = active.reduce((s, t) => s + (Number(t.freight_amount || 0) || Number(t.sale_total || 0)), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalReceived = active.reduce((s, t) => s + Number(t.received_total || 0), 0);
  const totalPending = active.reduce((s, t) => s + Math.max(Number(t.pending_amount || 0), 0), 0);
  const totalLoadTons = active.reduce((s, t) => s + Number(t.load_tons || 0), 0);
  const lossTrips = active.filter((t) => t.is_loss);
  const totalLoss = lossTrips.reduce((s, t) => s + Math.abs(Number(t.profit || 0)), 0);
  const profitTrips = active.filter((t) => !t.is_loss);

  const tripsByStatus = {};
  for (const trip of trips) tripsByStatus[trip.status || "Pending"] = (tripsByStatus[trip.status || "Pending"] || 0) + 1;

  const expenseByCategory = {};
  for (const expense of expenses) {
    expenseByCategory[expense.category || "Other"] = (expenseByCategory[expense.category || "Other"] || 0) + Number(expense.amount || 0);
  }

  const months = lastSixMonths();
  const revenueByMonth = {};
  for (const trip of active) {
    const key = String(trip.date || "").slice(0, 7);
    if (months.includes(key)) revenueByMonth[key] = (revenueByMonth[key] || 0) + (Number(trip.freight_amount || 0) || Number(trip.sale_total || 0));
  }
  const expensesByMonth = {};
  for (const expense of expenses) {
    const key = String(expense.date || "").slice(0, 7);
    if (months.includes(key)) expensesByMonth[key] = (expensesByMonth[key] || 0) + Number(expense.amount || 0);
  }
  const monthly = months.map((key) => ({
    month: key,
    label: monthLabel(key),
    revenue: round2(revenueByMonth[key] || 0),
    expenses: round2(expensesByMonth[key] || 0),
  }));

  const recent = [...active].sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))).slice(0, 6);

  return {
    kpi: {
      total_trips: active.length,
      total_revenue: round2(totalRevenue),
      total_expenses: round2(totalExpenses),
      total_received: round2(totalReceived),
      total_pending: round2(totalPending),
      net_profit: round2(totalRevenue - totalExpenses),
      total_load_tons: round3(totalLoadTons),
      avg_rate_per_ton: totalLoadTons > 0 ? round2(totalRevenue / totalLoadTons) : 0,
      loss_trip_count: lossTrips.length,
      total_loss: round2(totalLoss),
      profit_trip_count: profitTrips.length,
    },
    monthly,
    expense_by_category: Object.entries(expenseByCategory)
      .map(([category, amount]) => ({ category, amount: round2(amount) }))
      .sort((a, b) => b.amount - a.amount),
    trips_by_status: Object.entries(tripsByStatus).map(([status, count]) => ({ status, count })).sort((a, b) => a.status.localeCompare(b.status)),
    recent_trips: recent.map((t) => ({
      _id: t._id,
      party_name: t.party_name || "",
      from_location: t.from_location || "",
      to_location: t.to_location || "",
      load_tons: t.load_tons || 0,
      freight_amount: t.freight_amount || 0,
      profit: t.profit || 0,
      is_loss: t.is_loss || false,
      pending_amount: t.pending_amount || 0,
      status: t.status || "",
      date: String(t.date || ""),
    })),
    loss_trips: [...lossTrips].sort((a, b) => Number(a.profit || 0) - Number(b.profit || 0)).map((t) => ({
      _id: t._id,
      party_name: t.party_name || "",
      from_location: t.from_location || "",
      to_location: t.to_location || "",
      load_tons: t.load_tons || 0,
      freight_amount: t.freight_amount || 0,
      expense_total: t.expense_total || 0,
      loss: Math.abs(Number(t.profit || 0)),
      date: String(t.date || ""),
      status: t.status || "",
    })),
  };
}

// --- reports --------------------------------------------------------------

function reportsTrips() {
  const trips = ledgerTrips();
  const trucks = Object.fromEntries(findMany("trucks").map((t) => [t._id, t]));
  const drivers = Object.fromEntries(findMany("drivers").map((d) => [d._id, d]));
  const rows = [];
  let cancelled = 0;
  for (const trip of [...trips].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))) {
    if (trip.status === "Cancelled") {
      cancelled += 1;
      continue;
    }
    const truck = trucks[trip.truck_id];
    const driver = drivers[trip.driver_id];
    rows.push({
      _id: trip._id,
      date: String(trip.date || ""),
      party_name: trip.party_name || "",
      route: `${trip.from_location || ""} -> ${trip.to_location || ""}`,
      truck_no: truck ? truck.registration_no : "-",
      driver_name: driver ? driver.name : "-",
      status: trip.status || "",
      load_tons: trip.load_tons || 0,
      rate_per_ton: trip.rate_per_ton || 0,
      cost_per_ton: trip.cost_per_ton || 0,
      freight_amount: trip.freight_amount || trip.sale_amount || 0,
      sale_amount: trip.sale_amount || 0,
      expense_total: trip.expense_total || 0,
      received_total: trip.received_total || 0,
      pending_amount: trip.pending_amount || 0,
      profit: trip.profit || 0,
      is_loss: trip.is_loss || false,
    });
  }
  const totalTons = rows.reduce((s, r) => s + Number(r.load_tons), 0);
  const freightSum = rows.reduce((s, r) => s + Number(r.freight_amount), 0);
  const totals = {
    trips: rows.length,
    cancelled,
    freight: round2(freightSum),
    expenses: round2(rows.reduce((s, r) => s + Number(r.expense_total), 0)),
    received: round2(rows.reduce((s, r) => s + Number(r.received_total), 0)),
    pending: round2(rows.reduce((s, r) => s + Math.max(Number(r.pending_amount), 0), 0)),
    profit: round2(rows.reduce((s, r) => s + Number(r.profit), 0)),
    total_load_tons: round3(totalTons),
    avg_rate_per_ton: totalTons > 0 ? round2(freightSum / totalTons) : 0,
    loss_trips: rows.filter((r) => r.is_loss).length,
    total_loss: round2(rows.filter((r) => r.is_loss).reduce((s, r) => s + Math.abs(Number(r.profit)), 0)),
  };
  return { rows, totals };
}

function reportTripDetail(id) {
  const trip = findOne("trips", { _id: id });
  if (!trip) throw httpError(404, "Trip not found");
  const expenses = findMany("expenses", { trip_id: id }, [["date", 1]]);
  const payments = findMany("payments", { trip_id: id }, [["date", 1]]);
  const [withNumbers] = addTripFinancials([trip], expenses, payments);
  const truck = trip.truck_id ? findOne("trucks", { _id: trip.truck_id }) : null;
  const driver = trip.driver_id ? findOne("drivers", { _id: trip.driver_id }) : null;
  withNumbers.truck_no = truck ? truck.registration_no : null;
  withNumbers.driver_name = driver ? driver.name : null;
  withNumbers.expenses = expenses;
  withNumbers.payments = payments;
  return withNumbers;
}

// --- accounts -------------------------------------------------------------

function partyLedger() {
  const trips = ledgerTrips();
  const rows = {};
  for (const trip of trips) {
    if (trip.status === "Cancelled") continue;
    const party = trip.party_name || "Unknown";
    if (!rows[party]) {
      rows[party] = { party_name: party, trips: 0, freight: 0, expenses: 0, received: 0, pending: 0, profit: 0, last_trip_date: "" };
    }
    const row = rows[party];
    row.trips += 1;
    row.freight += Number(trip.freight_amount || 0) || Number(trip.sale_total || 0);
    row.expenses += Number(trip.expense_total || 0);
    row.received += Number(trip.received_total || 0);
    row.pending += Math.max(Number(trip.pending_amount || 0), 0);
    row.profit += Number(trip.profit || 0);
    const tripDate = String(trip.date || "");
    if (tripDate > row.last_trip_date) row.last_trip_date = tripDate;
  }
  const output = Object.values(rows).map((row) => ({
    ...row,
    freight: round2(row.freight),
    expenses: round2(row.expenses),
    received: round2(row.received),
    pending: round2(row.pending),
    profit: round2(row.profit),
  }));
  output.sort((a, b) => b.pending - a.pending);
  return {
    rows: output,
    totals: {
      parties: output.length,
      freight: round2(output.reduce((s, r) => s + r.freight, 0)),
      received: round2(output.reduce((s, r) => s + r.received, 0)),
      pending: round2(output.reduce((s, r) => s + r.pending, 0)),
      profit: round2(output.reduce((s, r) => s + r.profit, 0)),
    },
  };
}

function outstandingAging() {
  const trips = ledgerTrips();
  const today = new Date();
  const buckets = [
    { bucket: "0-30 days", min: 0, max: 30, trips: 0, amount: 0, parties: [] },
    { bucket: "31-60 days", min: 31, max: 60, trips: 0, amount: 0, parties: [] },
    { bucket: "61-90 days", min: 61, max: 90, trips: 0, amount: 0, parties: [] },
    { bucket: "90+ days", min: 91, max: 10000, trips: 0, amount: 0, parties: [] },
  ];
  const detail = [];
  for (const trip of trips) {
    if (trip.status === "Cancelled") continue;
    const pending = Math.max(Number(trip.pending_amount || 0), 0);
    if (pending <= 0) continue;
    const rawDate = String(trip.date || "").slice(0, 10);
    let age = 0;
    const parsed = new Date(rawDate);
    if (!Number.isNaN(parsed.getTime())) age = Math.floor((today - parsed) / 86400000);
    const bucket = buckets.find((b) => age >= b.min && age <= b.max);
    if (bucket) {
      bucket.trips += 1;
      bucket.amount += pending;
      bucket.parties.push(trip.party_name || "");
    }
    detail.push({
      _id: trip._id,
      party_name: trip.party_name || "",
      date: rawDate,
      age_days: Math.max(age, 0),
      route: `${trip.from_location || ""} -> ${trip.to_location || ""}`,
    freight_amount: Number(trip.freight_amount || 0) || Number(trip.sale_total || 0),
      received_total: trip.received_total || 0,
      pending: round2(pending),
      status: trip.status || "",
    });
  }
  for (const bucket of buckets) {
    bucket.amount = round2(bucket.amount);
    bucket.parties = [...new Set(bucket.parties)].sort();
  }
  detail.sort((a, b) => b.age_days - a.age_days);
  return {
    buckets: buckets.map(({ min, max, ...rest }) => rest),
    rows: detail,
    total_pending: round2(detail.reduce((s, r) => s + r.pending, 0)),
  };
}

function truckWise() {
  const trucks = findMany("trucks");
  const trips = ledgerTrips();
  const rows = trucks.map((truck) => {
    const truckTrips = trips.filter((t) => t.truck_id === truck._id && t.status !== "Cancelled");
    const freight = truckTrips.reduce((s, t) => s + (Number(t.freight_amount || 0) || Number(t.sale_total || 0)), 0);
    const expenses = truckTrips.reduce((s, t) => s + Number(t.expense_total || 0), 0);
    const received = truckTrips.reduce((s, t) => s + Number(t.received_total || 0), 0);
    const pending = truckTrips.reduce((s, t) => s + Math.max(Number(t.pending_amount || 0), 0), 0);
    const profit = freight - expenses;
    return {
      _id: truck._id,
      registration_no: truck.registration_no || "",
      model: truck.model || "",
      capacity_tons: truck.capacity_tons || 0,
      status: truck.status || "",
      trips: truckTrips.length,
      freight: round2(freight),
      expenses: round2(expenses),
      received: round2(received),
      pending: round2(pending),
      profit: round2(profit),
      profit_per_trip: truckTrips.length ? round2(profit / truckTrips.length) : 0,
    };
  });
  rows.sort((a, b) => b.profit - a.profit);
  return {
    rows,
    totals: {
      freight: round2(rows.reduce((s, r) => s + r.freight, 0)),
      expenses: round2(rows.reduce((s, r) => s + r.expenses, 0)),
      profit: round2(rows.reduce((s, r) => s + r.profit, 0)),
    },
  };
}

function driverPayouts() {
  const drivers = findMany("drivers");
  const trips = ledgerTrips();
  const rows = drivers.map((driver) => {
    const driverTrips = trips.filter((t) => t.driver_id === driver._id && t.status !== "Cancelled");
    const salary = Number(driver.salary || 0);
    const advance = Number(driver.advance || 0);
    const tripPay = driverTrips.reduce((s, t) => s + Number(t.driver_pay || 0), 0);
    return {
      _id: driver._id,
      name: driver.name || "",
      phone: driver.phone || "",
      license_no: driver.license_no || "",
      trips: driverTrips.length,
      freight: round2(driverTrips.reduce((s, t) => s + Number(t.freight_amount || 0), 0)),
      trip_pay: round2(tripPay),
      salary,
      advance,
      balance: round2(tripPay - advance),
    };
  });
  rows.sort((a, b) => b.balance - a.balance);
  return {
    rows,
    totals: {
      drivers: rows.length,
      trip_pay: round2(rows.reduce((s, r) => s + r.trip_pay, 0)),
      salary: round2(rows.reduce((s, r) => s + r.salary, 0)),
      advance: round2(rows.reduce((s, r) => s + r.advance, 0)),
      balance: round2(rows.reduce((s, r) => s + r.balance, 0)),
    },
  };
}

function profitLoss() {
  const trips = findMany("trips");
  const expenses = findMany("expenses");
  const payments = findMany("payments");
  const ledger = addTripFinancials(trips, expenses, payments);
  const active = ledger.filter((t) => t.status !== "Cancelled");

  const incomeByStatus = {};
  for (const trip of active) {
    const status = trip.status || "Pending";
    incomeByStatus[status] = (incomeByStatus[status] || 0) + (Number(trip.freight_amount || 0) || Number(trip.sale_total || 0));
  }
  const expenseByCategory = {};
  for (const expense of expenses) {
    const category = expense.category || "Other";
    expenseByCategory[category] = (expenseByCategory[category] || 0) + Number(expense.amount || 0);
  }

  const received = active.reduce((s, t) => s + Number(t.received_total || 0), 0);
  const billed = active.reduce((s, t) => s + (Number(t.freight_amount || 0) || Number(t.sale_total || 0)), 0);
  const totalExpenses = Object.values(expenseByCategory).reduce((s, v) => s + v, 0);
  const cashExpenses = expenses.filter((e) => e.category !== "Driver Advance").reduce((s, e) => s + Number(e.amount || 0), 0);

  return {
    income: Object.entries(incomeByStatus).sort((a, b) => a[0].localeCompare(b[0])).map(([label, amount]) => ({ label, amount: round2(amount) })),
    expenses: Object.entries(expenseByCategory).map(([label, amount]) => ({ label, amount: round2(amount) })).sort((a, b) => b.amount - a.amount),
    summary: {
      freight_billed: round2(billed),
      received: round2(received),
      pending: round2(billed - received),
      total_expenses: round2(totalExpenses),
      cash_expenses: round2(cashExpenses),
      driver_advance: round2(expenseByCategory["Driver Advance"] || 0),
      net_profit: round2(billed - totalExpenses),
      margin_percent: billed ? round2(((billed - totalExpenses) / billed) * 100) : 0,
      trips: active.length,
    },
  };
}

function accountTrip(id) {
  const trip = findOne("trips", { _id: id });
  if (!trip) throw httpError(404, "Trip not found");
  const expenses = findMany("expenses", { trip_id: id }, [["date", 1]]);
  const payments = findMany("payments", { trip_id: id }, [["date", 1]]);
  const [withNumbers] = addTripFinancials([trip], expenses, payments);
  const truck = trip.truck_id ? findOne("trucks", { _id: trip.truck_id }) : null;
  const driver = trip.driver_id ? findOne("drivers", { _id: trip.driver_id }) : null;
  withNumbers.truck_no = truck ? truck.registration_no : null;
  withNumbers.driver_name = driver ? driver.name : null;
  withNumbers.expenses = expenses;
  withNumbers.payments = payments;
  withNumbers.cash_expenses = round2(expenses.filter((e) => e.category !== "Driver Advance").reduce((s, e) => s + Number(e.amount || 0), 0));
  delete withNumbers._date;
  return withNumbers;
}

function adminReset() {
  const cleared = {};
  for (const collection of ["trips", "payments", "expenses", "trucks", "drivers"]) {
    cleared[collection] = DB[collection].length;
    DB[collection] = [];
  }
  persist();
  logEvent({ type: "admin", action: "data.cleared", entity: "business", summary: "All business data cleared by owner" });
  return { cleared };
}

// --- admin panel ----------------------------------------------------------

const ADMIN_ROLES = ["owner", "admin", "staff"];

function requireOwner() {
  const me = currentUserRecord();
  if (!me || me.role !== "owner") throw httpError(403, "Only the owner can open the admin panel");
  return me;
}

function adminStats() {
  const me = requireOwner();
  const roles = {};
  for (const user of DB.users) {
    const role = ADMIN_ROLES.includes(user.role) ? user.role : "staff";
    roles[role] = (roles[role] || 0) + 1;
  }
  return {
    storage: "offline",
    counts: {
      users: DB.users.length,
      trucks: DB.trucks.length,
      drivers: DB.drivers.length,
      trips: DB.trips.length,
      expenses: DB.expenses.length,
      payments: DB.payments.length,
      locations: DB.locations.length,
    },
    roles,
    activity_total: DB.audit.length,
    current_user: publicUser(me),
  };
}

function adminUsers() {
  const me = requireOwner();
  return DB.users
    .map((user) => ({
      id: user._id,
      name: user.name || "",
      email: user.email || "",
      phone: user.phone || "",
      role: ADMIN_ROLES.includes(user.role) ? user.role : "staff",
      created_at: user.created_at || null,
      is_me: user._id === me._id,
    }))
    .sort((a, b) => {
      if (a.role !== b.role) return a.role === "owner" ? -1 : b.role === "owner" ? 1 : a.role.localeCompare(b.role);
      return (a.name || "").localeCompare(b.name || "");
    });
}

function adminCreateUser(body) {
  requireOwner();
  const name = String(body.name || "").trim();
  const phone = normalizePhone(body.phone);
  const password = String(body.password || "");
  const role = body.role === "admin" ? "admin" : "staff";
  if (name.length < 2) throw httpError(400, "Enter a name");
  if (phone.length < 11) throw httpError(400, "Enter a valid 10-digit mobile number");
  if (findUserByPhone(phone)) throw httpError(409, "This mobile number already has an account");
  if (password.length < 6) throw httpError(400, "Password must be at least 6 characters");

  const email = `user_${phone}@ramdarbar.local`;
  const id = insertOne("users", {
    email,
    phone,
    password_hash: password,
    name,
    role,
    created_at: nowIso(),
  });
  logEvent({
    type: "admin",
    action: "user.created",
    entity: "user",
    entity_id: id,
    summary: `${name} added as ${role}`,
  });
  return { id, email, name, phone, role, created_at: nowIso() };
}

function adminUpdateUser(id, body) {
  const me = requireOwner();
  const user = findOne("users", { _id: id });
  if (!user) throw httpError(404, "User not found");

  const patch = {};
  if (body.role !== undefined) {
    if (user._id === me._id) throw httpError(400, "You cannot change your own role");
    if (!["admin", "staff"].includes(body.role)) throw httpError(400, "Invalid role");
    patch.role = body.role;
  }
  if (body.password !== undefined) {
    if (String(body.password).length < 6) throw httpError(400, "Password must be at least 6 characters");
    patch.password_hash = String(body.password);
  }
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (name.length < 2) throw httpError(400, "Enter a name");
    patch.name = name;
  }
  if (!Object.keys(patch).length) throw httpError(400, "Nothing to update");

  updateOne("users", id, patch);
  const parts = [];
  if (patch.role) parts.push(`role -> ${patch.role}`);
  if (patch.password_hash) parts.push("password reset");
  if (patch.name) parts.push(`name -> ${patch.name}`);
  logEvent({
    type: "admin",
    action: "user.updated",
    entity: "user",
    entity_id: id,
    summary: `${user.name || user.phone}: ${parts.join(", ")}`,
  });
  return { ok: true };
}

function adminDeleteUser(id) {
  const me = requireOwner();
  if (id === me._id) throw httpError(400, "You cannot delete your own account");
  const user = findOne("users", { _id: id });
  if (!user) throw httpError(404, "User not found");
  if (user.role === "owner") throw httpError(400, "The owner account cannot be deleted");
  DB.users = DB.users.filter((row) => row._id !== id);
  persist();
  logEvent({
    type: "delete",
    action: "user.deleted",
    entity: "user",
    entity_id: id,
    summary: `${user.name || user.phone} account deleted`,
  });
  return { deleted: true };
}

function adminExport() {
  requireOwner();
  return { exported_at: nowIso(), app: "Ram Darbar Tracker", db: getDatabase() };
}

function adminImport(body) {
  requireOwner();
  const incoming = body && body.db;
  if (!incoming || typeof incoming !== "object") throw httpError(400, "Invalid backup file");
  setDatabase(incoming);
  logEvent({ type: "admin", action: "data.restored", entity: "business", summary: "Backup restored by owner" });
  return { ok: true, counts: Object.fromEntries(COLLECTIONS.map((name) => [name, DB[name].length])) };
}

// Owner ko dikhta hai: har user ne kitna kaam kiya + poora activity log.
function adminActivity(query) {
  requireOwner();
  const limit = Math.min(Number(query.get("limit")) || 250, 1000);
  return {
    total: DB.audit.length,
    entries: DB.audit.slice(-limit).reverse(),
    logins: DB.audit.filter((entry) => entry.type === "login").slice(-300).reverse(),
  };
}

function reportRange(query) {
  const today = nowIso().slice(0, 10);
  const first = `${today.slice(0, 7)}-01`;
  const from = String(query.get("from") || first).slice(0, 10);
  const to = String(query.get("to") || today).slice(0, 10);
  return from <= to ? { from, to } : { from: to, to: from };
}

function inDayRange(value, range) {
  const day = String(value || "").slice(0, 10);
  return Boolean(day) && day >= range.from && day <= range.to;
}

function adminReport(query) {
  const me = requireOwner();
  const range = reportRange(query);

  const truckById = Object.fromEntries(DB.trucks.map((truck) => [truck._id, truck]));
  const driverById = Object.fromEntries(DB.drivers.map((driver) => [driver._id, driver]));

  const rows = DB.users.map((user) => ({
    id: user._id,
    name: user.name || user.email || "User",
    phone: user.phone || "",
    role: ADMIN_ROLES.includes(user.role) ? user.role : "staff",
    logins: 0,
    last_login: null,
    trips: 0,
    freight: 0,
    expenses_count: 0,
    expenses_amount: 0,
    payments_count: 0,
    payments_amount: 0,
    actions: 0,
    pending: 0,
  }));
  const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
  const legacy = {
    id: "__untracked",
    name: "Purana data (before tracking)",
    phone: "",
    role: "-",
    logins: 0,
    last_login: null,
    trips: 0,
    freight: 0,
    expenses_count: 0,
    expenses_amount: 0,
    payments_count: 0,
    payments_amount: 0,
    actions: 0,
    pending: 0,
  };
  let legacyUsed = false;
  const bucketFor = (id) => {
    if (id && byId[id]) return byId[id];
    legacyUsed = true;
    return legacy;
  };

  const expensesByTrip = {};
  const receivedByTrip = {};
  for (const expense of DB.expenses) {
    if (expense.trip_id) expensesByTrip[expense.trip_id] = (expensesByTrip[expense.trip_id] || 0) + Number(expense.amount || 0);
  }
  for (const payment of DB.payments) {
    if (payment.trip_id) receivedByTrip[payment.trip_id] = (receivedByTrip[payment.trip_id] || 0) + Number(payment.amount || 0);
  }

  const trips = DB.trips
    .filter((trip) => inDayRange(trip.date || trip.created_at, range))
    .map((trip) => {
      const income = Number(trip.freight_amount || 0) || Number(trip.sale_amount || 0);
      const received = Number(trip.advance || 0) + (receivedByTrip[trip._id] || 0);
      const pending = Math.max(income - received, 0);
      const row = bucketFor(trip.created_by);
      row.trips += 1;
      row.freight += income;
      row.pending += pending;
      return {
        id: trip._id,
        date: String(trip.date || ""),
        party: trip.party_name || "",
        from: trip.from_location || "",
        to: trip.to_location || "",
        truck_no: truckById[trip.truck_id]?.registration_no || "",
        driver_name: driverById[trip.driver_id]?.name || "",
        freight: round2(income),
        received: round2(received),
        pending: round2(pending),
        status: trip.status || "Pending",
        created_by: trip.created_by_name || "Purana data",
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const expenses = DB.expenses
    .filter((expense) => inDayRange(expense.date || expense.created_at, range))
    .map((expense) => {
      const row = bucketFor(expense.created_by);
      row.expenses_count += 1;
      row.expenses_amount += Number(expense.amount || 0);
      const trip = expense.trip_id ? DB.trips.find((item) => item._id === expense.trip_id) : null;
      return {
        id: expense._id,
        date: String(expense.date || ""),
        category: expense.category || "Other",
        amount: round2(Number(expense.amount || 0)),
        note: expense.note || "",
        party: trip?.party_name || "",
        created_by: expense.created_by_name || "Purana data",
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const payments = DB.payments
    .filter((payment) => inDayRange(payment.date || payment.created_at, range))
    .map((payment) => {
      const row = bucketFor(payment.created_by);
      row.payments_count += 1;
      row.payments_amount += Number(payment.amount || 0);
      return {
        id: payment._id,
        date: String(payment.date || ""),
        party: payment.party_name || "",
        amount: round2(Number(payment.amount || 0)),
        mode: payment.mode || "Cash",
        created_by: payment.created_by_name || "Purana data",
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const logins = DB.audit
    .filter((entry) => entry.type === "login" && inDayRange(entry.at, range))
    .map((entry) => {
      const row = byId[entry.user_id];
      if (row) {
        row.logins += 1;
        if (!row.last_login || entry.at > row.last_login) row.last_login = entry.at;
      }
      return {
        at: entry.at,
        name: entry.user_name || "",
        phone: entry.user_phone || "",
        role: entry.role || "",
        action: entry.action === "auth.login_otp" ? "OTP" : "Password",
      };
    })
    .reverse();

  // "Last login" range ke bahar bhi dikhna chahiye.
  for (const entry of DB.audit) {
    if (entry.type !== "login") continue;
    const row = byId[entry.user_id];
    if (row && (!row.last_login || entry.at > row.last_login)) row.last_login = entry.at;
  }

  const actions = DB.audit
    .filter((entry) => !["login", "logout"].includes(entry.type) && inDayRange(entry.at, range))
    .slice(-300)
    .reverse()
    .map((entry) => {
      const row = byId[entry.user_id];
      if (row) row.actions += 1;
      return {
        at: entry.at,
        name: entry.user_name || "",
        role: entry.role || "",
        type: entry.type,
        summary: entry.summary || entry.action || "",
      };
    });

  const staff = rows.concat(legacyUsed ? [legacy] : []).map((row) => ({
    ...row,
    freight: round2(row.freight),
    expenses_amount: round2(row.expenses_amount),
    payments_amount: round2(row.payments_amount),
    pending: round2(row.pending),
  }));

  const totalFreight = trips.reduce((sum, trip) => sum + trip.freight, 0);
  const totalReceived = trips.reduce((sum, trip) => sum + trip.received, 0);
  const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const totalPayments = payments.reduce((sum, payment) => sum + payment.amount, 0);

  return {
    generated_at: nowIso(),
    range,
    owner: { name: me.name || "Owner", phone: me.phone || "" },
    staff,
    logins,
    actions,
    trips,
    expenses,
    payments,
    totals: {
      users: rows.length,
      trips: trips.length,
      logins: logins.length,
      freight: round2(totalFreight),
      received: round2(totalReceived),
      pending: round2(Math.max(totalFreight - totalReceived, 0)),
      expenses: round2(totalExpenses),
      payments: round2(totalPayments),
    },
  };
}

// --- router ---------------------------------------------------------------

const ROUTES = [
  ["POST", /^\/auth\/login$/, (m, body) => authLogin(body)],
  ["POST", /^\/auth\/logout$/, () => authLogout()],
  ["POST", /^\/auth\/signup$/, (m, body) => authSignup(body)],
  ["POST", /^\/auth\/otp\/request$/, (m, body) => authOtpRequest(body)],
  ["POST", /^\/auth\/otp\/verify$/, (m, body) => authOtpVerify(body)],
  ["POST", /^\/auth\/password-reset$/, (m, body) => authPasswordReset(body)],
  ["PUT", /^\/auth\/phone$/, (m, body) => authSavePhone(body)],
  ["POST", /^\/auth\/change-password$/, (m, body) => authChangePassword(body)],
  ["GET", /^\/auth\/me$/, () => publicUser(currentUserRecord())],

  ["GET", /^\/trucks$/, () => listTrucks()],
  ["POST", /^\/trucks$/, (m, body) => createTruck(body)],
  ["PUT", /^\/trucks\/([^/]+)$/, (m, body) => updateTruck(m[1], body)],
  ["DELETE", /^\/trucks\/([^/]+)$/, (m) => deleteTruck(m[1])],

  ["GET", /^\/drivers$/, () => listDrivers()],
  ["POST", /^\/drivers$/, (m, body) => createDriver(body)],
  ["PUT", /^\/drivers\/([^/]+)$/, (m, body) => updateDriver(m[1], body)],
  ["DELETE", /^\/drivers\/([^/]+)$/, (m) => deleteDriver(m[1])],

  ["GET", /^\/trips$/, (m, body, query) => listTrips(query)],
  ["POST", /^\/trips$/, (m, body) => createTrip(body)],
  ["GET", /^\/trips\/([^/]+)\/location$/, (m) => tripLocation(m[1])],
  ["POST", /^\/trips\/([^/]+)\/location$/, (m, body) => recordLocation(m[1], body)],
  ["GET", /^\/trips\/([^/]+)$/, (m) => getTrip(m[1])],
  ["PUT", /^\/trips\/([^/]+)$/, (m, body) => updateTrip(m[1], body)],
  ["DELETE", /^\/trips\/([^/]+)$/, (m) => deleteTrip(m[1])],

  ["GET", /^\/expenses$/, (m, body, query) => listExpenses(query)],
  ["POST", /^\/expenses$/, (m, body) => createExpense(body)],
  ["PUT", /^\/expenses\/([^/]+)$/, (m, body) => updateExpense(m[1], body)],
  ["DELETE", /^\/expenses\/([^/]+)$/, (m) => deleteExpense(m[1])],

  ["GET", /^\/payments$/, (m, body, query) => listPayments(query)],
  ["POST", /^\/payments$/, (m, body) => createPayment(body)],
  ["GET", /^\/payments\/request\/([^/]+)$/, (m) => paymentRequest(m[1])],
  ["POST", /^\/payments\/request\/([^/]+)\/scan$/, (m, body) => scanPayment(m[1], body)],
  ["PUT", /^\/payments\/([^/]+)$/, (m, body) => updatePayment(m[1], body)],
  ["DELETE", /^\/payments\/([^/]+)$/, (m) => deletePayment(m[1])],

  ["GET", /^\/dashboard$/, () => dashboard()],

  ["GET", /^\/reports\/trips$/, () => reportsTrips()],
  ["GET", /^\/reports\/trips\/([^/]+)$/, (m) => reportTripDetail(m[1])],

  ["GET", /^\/accounts\/parties$/, () => partyLedger()],
  ["GET", /^\/accounts\/outstanding-aging$/, () => outstandingAging()],
  ["GET", /^\/accounts\/truck-wise$/, () => truckWise()],
  ["GET", /^\/accounts\/driver-payouts$/, () => driverPayouts()],
  ["GET", /^\/accounts\/profit-loss$/, () => profitLoss()],
  ["GET", /^\/accounts\/trip\/([^/]+)$/, (m) => accountTrip(m[1])],

  ["POST", /^\/admin\/reset$/, () => adminReset()],
  ["GET", /^\/admin\/stats$/, () => adminStats()],
  ["GET", /^\/admin\/users$/, () => adminUsers()],
  ["POST", /^\/admin\/users$/, (m, body) => adminCreateUser(body)],
  ["PUT", /^\/admin\/users\/([^/]+)$/, (m, body) => adminUpdateUser(m[1], body)],
  ["DELETE", /^\/admin\/users\/([^/]+)$/, (m) => adminDeleteUser(m[1])],
  ["GET", /^\/admin\/export$/, () => adminExport()],
  ["POST", /^\/admin\/import$/, (m, body) => adminImport(body)],
  ["GET", /^\/admin\/activity$/, (m, body, query) => adminActivity(query)],
  ["GET", /^\/admin\/report$/, (m, body, query) => adminReport(query)],
  ["GET", /^\/owner$/, () => ({ email: OWNER.email, name: "Owner", auth_required: true })],
  ["GET", /^\/health$/, () => ({
    status: "ok",
    storage: "offline",
    auth_required: true,
    counts: Object.fromEntries(COLLECTIONS.filter((c) => c !== "users").map((c) => [c, DB[c].length])),
  })],
];

export function request(method, url, body) {
  const [rawPath, rawQuery] = String(url).split("?");
  let path = rawPath.startsWith("/api") ? rawPath.slice(4) : rawPath;
  if (!path.startsWith("/")) path = `/${path}`;
  const query = new URLSearchParams(rawQuery || "");

  for (const [routeMethod, pattern, handler] of ROUTES) {
    if (routeMethod !== String(method).toUpperCase()) continue;
    const match = pattern.exec(path);
    if (match) return handler(match, body || {}, query);
  }
  throw httpError(404, `No local handler for ${method} ${path}`);
}

export function ensureSession() {
  try {
    if (localStorage.getItem(TOKEN_KEY)) return;
    const owner = findOne("users", { _id: OWNER._id }) || DB.users[0];
    localStorage.setItem(TOKEN_KEY, `offline:${owner._id}`);
    localStorage.setItem(USER_KEY, JSON.stringify(publicUser(owner)));
  } catch {
    /* ignore */
  }
}

export function resetLocalData() {
  DB = freshDb();
  persist();
}

// --- cloud bridge (Firebase sync ke liye) --------------------------------

export function phoneKey(value) {
  return normalizePhone(value);
}

export function getActivePhone() {
  const user = currentUserRecord();
  return user ? normalizePhone(user.phone) : "";
}

export function getDatabase() {
  return JSON.parse(JSON.stringify(DB));
}

export function setDatabase(next) {
  if (!next || typeof next !== "object") return;
  const rebuilt = {};
  for (const name of COLLECTIONS) rebuilt[name] = Array.isArray(next[name]) ? next[name] : [];
  if (!rebuilt.users.length) rebuilt.users.push({ ...OWNER, created_at: nowIso() });
  DB = rebuilt;
  persist();
}
