import { request } from "./localBackend";
import { beforeLogin, schedulePush } from "./cloudSync";

// Offline app: koi network / backend nahi. Sab kuch localStorage me chalta hai.
// Purana axios wala code hataya gaya, lekin response ka shape same rakha
// gaya hai ({ data, status }) taki baaki pages bina badle chalein.

export const api = {
  get: (url, config) => call("GET", url, undefined, config),
  post: (url, body, config) => call("POST", url, body, config),
  put: (url, body, config) => call("PUT", url, body, config),
  patch: (url, body, config) => call("PATCH", url, body, config),
  delete: (url, config) => call("DELETE", url, undefined, config),
};

async function call(method, url, body, config) {
  const upper = String(method).toUpperCase();
  const trimmed = String(url).split("?")[0];
  const skipPush = trimmed === "/auth/login" || trimmed === "/auth/otp/verify" || trimmed === "/auth/signup";

  // Login se pehle us number ka cloud data pull karo taaki is device par bhi dikhe.
  if (upper === "POST" && (trimmed === "/auth/login" || trimmed === "/auth/otp/verify")) {
    await beforeLogin(body && (body.identifier || body.phone));
  }

  const data = request(method, url, body);

  // Kisi bhi badlav ko cloud par bhej do (login/signup alag se handle hote hain).
  if (["POST", "PUT", "DELETE"].includes(upper) && !skipPush) {
    schedulePush();
  }

  if (config && config.responseType === "blob") {
    return { data, status: 200, config: config || {} };
  }
  return { data, status: 200, config: config || {} };
}

export function errorMessage(error, fallback = "Something went wrong") {
  const detail = error?.response?.data?.detail ?? error?.detail;
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
  if (error?.message && !error?.response) return error.message;
  return fallback;
}

// --- Bilty PDF (client side) ---------------------------------------------

const PDF_HELPER = {
  escape: (text) => String(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"),
  ascii: (text) => String(text).replace(/[^\x20-\x7E]/g, "?"),
};

function money(value) {
  const number = Number(value || 0);
  return `Rs ${number.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function biltyLines(trip) {
  const lines = [];
  const add = (text, opts = {}) => lines.push({ text, ...opts });
  const rule = () => add("------------------------------------------------------------", { size: 9 });
  const row = (label, value) => add(`${label} : ${value ?? "-"}`, { size: 11 });

  add("RAM DARBAR TRANSPORT", { size: 18, bold: true });
  add("Goods Consignment Note / Bilty", { size: 11 });
  rule();
  row("Bilty No", trip._id ? String(trip._id).slice(-8).toUpperCase() : "-");
  row("Date", trip.date || "-");
  rule();
  add("CONSIGNOR / PARTY DETAILS", { bold: true, size: 12 });
  row("Party", trip.party_name || "-");
  rule();
  add("TRIP DETAILS", { bold: true, size: 12 });
  row("From", trip.from_location || "-");
  row("To", trip.to_location || "-");
  row("Truck No", trip.truck_no || "-");
  row("Driver", trip.driver_name || "-");
  row("Status", trip.status || "-");
  rule();
  add("SALE & PAYMENT", { bold: true, size: 12 });
  row("Maal becha (Sale)", money(trip.sale_total ?? trip.freight_amount));
  row("Advance", money(trip.advance));
  row("Received (total)", money(trip.received_total));
  row("Pending", money(trip.pending_amount));
  rule();

  const driverPay = Number(trip.driver_pay_total || 0);
  if ((trip.expenses && trip.expenses.length) || driverPay > 0) {
    add("KHARCHA / EXPENSES", { bold: true, size: 12 });
    for (const expense of trip.expenses || []) {
      add(`${expense.date || ""}  ${expense.category || "-"}  ${expense.note || ""}`.trim(), { size: 10 });
      add(`   Amount: ${money(expense.amount)}`, { size: 10 });
    }
    row("Kharcha total", money(trip.expense_total));
    if (driverPay > 0) row("Driver payment", money(driverPay));
    row("Total kharcha", money(Number(trip.expense_total || 0) + driverPay));
    rule();
  }

  add("MAAL / TRADING", { bold: true, size: 12 });
  row("Maal kharida", money(trip.purchase_total));
  row("Maal becha", money(trip.sale_total));
  row("Extra kharcha", money(trip.extra_expense_total));
  row("Net profit", money(trip.trade_profit));
  rule();

  add("SUMMARY", { bold: true, size: 12 });
  row("Profit", money(trip.profit));
  if (trip.is_loss) add("NOTE: This trip is running at a LOSS.", { bold: true, size: 11 });
  rule();
  add("Thank you. Safe journey.", { size: 10 });
  return lines;
}

function buildPdf(lines) {
  const parts = ["BT", "50 800 Td"];
  let first = true;
  for (const line of lines) {
    const size = line.size || 11;
    const gap = first ? 0 : size + 6;
    parts.push(`${line.bold ? "/F2" : "/F1"} ${size} Tf`);
    parts.push(`0 -${gap} Td`);
    parts.push(`(${PDF_HELPER.escape(PDF_HELPER.ascii(line.text))}) Tj`);
    first = false;
  }
  parts.push("ET");
  const content = parts.join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((obj, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return pdf;
}

export async function downloadBilty(tripId, partyName) {
  const trip = request("GET", `/accounts/trip/${tripId}`);
  const pdf = buildPdf(biltyLines(trip));
  const blob = new Blob([pdf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `bilty-${(partyName || trip.party_name || "trip").replace(/\s+/g, "-").toLowerCase()}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// --- Owner report PDF (multi-page) ---------------------------------------

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const PAGE_LEFT = 36;
const PAGE_TOP = 806;
const PAGE_BOTTOM = 46;

function clip(value, width) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= width) return text;
  return `${text.slice(0, Math.max(width - 3, 0))}...`;
}

function cell(value, width, align = "left") {
  const text = clip(value, width);
  return align === "right" ? text.padStart(width) : text.padEnd(width);
}

function tableRow(values, widths, aligns = []) {
  return values.map((value, index) => cell(value, widths[index], aligns[index] || "left")).join(" ");
}

function tableLine(widths) {
  return widths.map((width) => "-".repeat(width)).join(" ");
}

function dayText(value) {
  const raw = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw || "-";
  const [year, month, day] = raw.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function stampText(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function inr(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function buildReportPdf(pages, footer) {
  const fontObjects = [
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>",
  ];

  const pageStreams = pages.map((page, index) => {
    const parts = ["BT"];
    for (const line of page) {
      const font = line.monoBold ? "F4" : line.mono ? "F3" : line.bold ? "F2" : "F1";
      const size = line.size || 10;
      parts.push(`/${font} ${size} Tf`);
      parts.push(`1 0 0 1 ${PAGE_LEFT} ${line.y} Tm`);
      parts.push(`(${PDF_HELPER.escape(PDF_HELPER.ascii(line.text))}) Tj`);
    }
    parts.push("/F1 8 Tf");
    parts.push(`1 0 0 1 ${PAGE_LEFT} 26 Tm`);
    parts.push(`(${PDF_HELPER.escape(PDF_HELPER.ascii(`${footer.line} - Page ${index + 1} of ${pages.length}`))}) Tj`);
    parts.push("ET");
    return parts.join("\n");
  });

  const totalObjects = 6 + pages.length * 2;
  const objects = new Array(totalObjects + 1);
  const kids = pages.map((_, index) => `${7 + index * 2} 0 R`).join(" ");

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`;
  objects[3] = fontObjects[0];
  objects[4] = fontObjects[1];
  objects[5] = fontObjects[2];
  objects[6] = fontObjects[3];

  pageStreams.forEach((stream, index) => {
    const pageObj = 7 + index * 2;
    const contentObj = pageObj + 1;
    objects[pageObj] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >> >> /Contents ${contentObj} 0 R >>`;
    objects[contentObj] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (let index = 1; index <= totalObjects; index += 1) {
    offsets.push(pdf.length);
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return pdf;
}

export function buildOwnerReportPdf(report) {
  const lines = [];
  const add = (text = "", options = {}) => {
    lines.push({
      text,
      size: options.size || 10,
      bold: Boolean(options.bold),
      mono: Boolean(options.mono),
      monoBold: Boolean(options.monoBold),
      gap: options.gap,
      pageBreak: Boolean(options.pageBreak),
    });
  };
  const blank = (gap = 6) => add("", { size: 1, gap });
  const section = (title) => {
    blank(6);
    add(title, { size: 12, bold: true });
  };

  add("RAM DARBAR TRACKER", { size: 18, bold: true });
  add("Owner Report - Staff Activity & Business Data", { size: 11 });
  add(`Period: ${dayText(report.range.from)} to ${dayText(report.range.to)}`, { size: 10 });
  add(`Generated: ${stampText(report.generated_at)}`, { size: 9 });
  add(`Owner: ${report.owner.name || "Owner"}${report.owner.phone ? ` (+91 ${report.owner.phone})` : ""}`, { size: 9 });

  section("BUSINESS SUMMARY");
  add(`Trips booked          : ${report.totals.trips}`, { size: 10, mono: true });
  add(`Freight booked        : ${inr(report.totals.freight)}`, { size: 10, mono: true });
  add(`Payments received     : ${inr(report.totals.received)}`, { size: 10, mono: true });
  add(`Pending from parties  : ${inr(report.totals.pending)}`, { size: 10, mono: true });
  add(`Expenses recorded     : ${inr(report.totals.expenses)}`, { size: 10, mono: true });
  add(`Logins in this period : ${report.totals.logins}`, { size: 10, mono: true });

  section("STAFF ACTIVITY");
  const staffWidths = [22, 7, 7, 6, 15, 13, 15, 9];
  add(tableRow(["Name", "Role", "Logins", "Trips", "Freight", "Expense", "Received", "Actions"], staffWidths, ["left", "left", "right", "right", "right", "right", "right", "right"]), { size: 8.5, monoBold: true });
  add(tableLine(staffWidths), { size: 8.5, mono: true });
  for (const row of report.staff) {
    add(
      tableRow(
        [row.name, row.role, row.logins, row.trips, inr(row.freight), inr(row.expenses_amount), inr(row.payments_amount), row.actions],
        staffWidths,
        ["left", "left", "right", "right", "right", "right", "right", "right"],
      ),
      { size: 8.5, mono: true },
    );
  }

  section("LOGIN HISTORY");
  if (report.logins.length) {
    const loginWidths = [20, 22, 15, 8, 9];
    add(tableRow(["Time", "Name", "Mobile", "Role", "Method"], loginWidths), { size: 8.5, monoBold: true });
    add(tableLine(loginWidths), { size: 8.5, mono: true });
    for (const login of report.logins) {
      add(tableRow([stampText(login.at), login.name, login.phone ? `+${login.phone}` : "-", login.role, login.action], loginWidths), { size: 8.5, mono: true });
    }
  } else {
    add("No logins recorded in this period.", { size: 9 });
  }

  section("RECENT ACTIONS (WHO DID WHAT)");
  if (report.actions.length) {
    for (const action of report.actions) {
      add(`${stampText(action.at)}  ${clip(action.name, 18)} (${clip(action.role, 7)})  ${clip(action.summary, 70)}`, { size: 8 });
    }
  } else {
    add("No actions recorded in this period.", { size: 9 });
  }

  section(`TRIPS (${report.trips.length})`);
  if (report.trips.length) {
    const tripWidths = [11, 18, 23, 11, 10, 10, 14];
    add(tableRow(["Date", "Party", "From - To", "Freight", "Pending", "Status", "Added by"], tripWidths, ["left", "left", "left", "right", "right", "left", "left"]), { size: 7.5, monoBold: true });
    add(tableLine(tripWidths), { size: 7.5, mono: true });
    for (const trip of report.trips) {
      add(
        tableRow(
          [dayText(trip.date), trip.party, `${trip.from} - ${trip.to}`, inr(trip.freight), inr(trip.pending), trip.status, trip.created_by],
          tripWidths,
          ["left", "left", "left", "right", "right", "left", "left"],
        ),
        { size: 7.5, mono: true },
      );
    }
  } else {
    add("No trips in this period.", { size: 9 });
  }

  section(`EXPENSES (${report.expenses.length})`);
  if (report.expenses.length) {
    const expenseWidths = [11, 14, 11, 28, 14, 14];
    add(tableRow(["Date", "Category", "Amount", "Note", "Party", "Added by"], expenseWidths, ["left", "left", "right", "left", "left", "left"]), { size: 7.5, monoBold: true });
    add(tableLine(expenseWidths), { size: 7.5, mono: true });
    for (const expense of report.expenses) {
      add(
        tableRow([dayText(expense.date), expense.category, inr(expense.amount), expense.note, expense.party, expense.created_by], expenseWidths, ["left", "left", "right", "left", "left", "left"]),
        { size: 7.5, mono: true },
      );
    }
  } else {
    add("No expenses in this period.", { size: 9 });
  }

  section(`PAYMENTS RECEIVED (${report.payments.length})`);
  if (report.payments.length) {
    const paymentWidths = [11, 24, 12, 9, 16];
    add(tableRow(["Date", "Party", "Amount", "Mode", "Added by"], paymentWidths, ["left", "left", "right", "left", "left"]), { size: 7.5, monoBold: true });
    add(tableLine(paymentWidths), { size: 7.5, mono: true });
    for (const payment of report.payments) {
      add(tableRow([dayText(payment.date), payment.party, inr(payment.amount), payment.mode, payment.created_by], paymentWidths, ["left", "left", "right", "left", "left"]), { size: 7.5, mono: true });
    }
  } else {
    add("No payments in this period.", { size: 9 });
  }

  blank(8);
  add("Note: data is saved in this device's browser storage. Take a backup regularly from Admin > Backup & data.", { size: 8 });
  add("Ram Darbar Tracker - offline transport accounting", { size: 8 });

  // Automatic pagination.
  const pages = [];
  let page = [];
  let y = PAGE_TOP;
  for (const line of lines) {
    const height = line.gap || (line.size + 4);
    if (line.pageBreak || (page.length && y - height < PAGE_BOTTOM)) {
      pages.push(page);
      page = [];
      y = PAGE_TOP;
    }
    y -= height;
    page.push({ ...line, y });
  }
  if (page.length) pages.push(page);

  return buildReportPdf(pages, {
    line: `Ram Darbar Tracker - ${report.range.from} to ${report.range.to}`,
  });
}

export function downloadOwnerReport(report) {
  const pdf = buildOwnerReportPdf(report);
  const blob = new Blob([pdf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ram-darbar-owner-report-${report.range.from}-to-${report.range.to}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
