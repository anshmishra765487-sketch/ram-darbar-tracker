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
  add("FREIGHT & LOAD", { bold: true, size: 12 });
  row("Load (tons)", Number(trip.load_tons || 0).toFixed(3));
  row("Rate / ton", money(trip.rate_per_ton));
  row("Freight", money(trip.freight_amount));
  row("Advance", money(trip.advance));
  row("Received (total)", money(trip.received_total));
  row("Pending", money(trip.pending_amount));
  rule();

  if (trip.expenses && trip.expenses.length) {
    add("EXPENSES", { bold: true, size: 12 });
    for (const expense of trip.expenses) {
      add(`${expense.date || ""}  ${expense.category || "-"}  ${expense.note || ""}`.trim(), { size: 10 });
      add(`   Amount: ${money(expense.amount)}`, { size: 10 });
    }
    row("Expense total", money(trip.expense_total));
    rule();
  }

  add("SUMMARY", { bold: true, size: 12 });
  row("Profit", money(trip.profit));
  row("Cost / ton", money(trip.cost_per_ton));
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
