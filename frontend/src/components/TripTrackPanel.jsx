import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowClockwise, Crosshair, MapPin, QrCode } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api, errorMessage } from "../lib/api";
import { rupees } from "../lib/utils";
import { Button } from "./ui/button";
import { Card, CardBody, CardHeader } from "./ui/card";
import { Field, Input, Select } from "./ui/input";
import { Modal } from "./ui/modal";

const MODES = ["UPI", "Cash", "Bank", "Cheque"];

/** OpenStreetMap se map tile + marker (koi API key nahi chahiye). */
function TrackMap({ points }) {
  const frameRef = useRef(null);
  const ready = points.length > 0;

  const bounds = () => {
    const lats = points.map((p) => p.latitude);
    const lngs = points.map((p) => p.longitude);
    return {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs),
    };
  };

  const bbox = ready ? bounds() : null;
  const pad = 0.02;
  const url = ready
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${bbox.minLng - pad}%2C${bbox.minLat - pad}%2C${bbox.maxLng + pad}%2C${bbox.maxLat + pad}&layer=mapnik&marker=${points[points.length - 1].latitude}%2C${points[points.length - 1].longitude}`
    : "";

  if (!ready) {
    return (
      <div className="flex h-52 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-ink-200 bg-ink-50 text-center">
        <MapPin size={26} className="text-ink-400" />
        <p className="text-xs font-semibold text-ink-600">No GPS point yet</p>
        <p className="text-[11px] text-ink-400">
          Tap &quot;Share my location&quotu00a0below to start tracking this trip.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <iframe
        ref={frameRef}
        title="Trip GPS tracking map"
        src={url}
        className="h-52 w-full rounded-xl border border-ink-200"
        loading="lazy"
      />
      <div className="flex items-center justify-between text-[11px] text-ink-500">
        <span className="font-semibold text-ink-700">{points.length} GPS points</span>
        <span>
          Last: {points[points.length - 1].latitude}, {points[points.length - 1].longitude}
        </span>
      </div>
    </div>
  );
}

export default function TripTrackPanel({ trip, open, onClose }) {
  const [data, setData] = useState({ points: [], latest: null });
  const [request, setRequest] = useState(null);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("UPI");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);

  const tripId = trip?._id;
  const pending = Math.max(Number(trip?.pending_amount || 0), 0);

  const load = useCallback(async () => {
    if (!tripId) return;
    try {
      const [loc, req] = await Promise.all([
        api.get(`/trips/${tripId}/location`),
        api.get(`/payments/request/${tripId}`),
      ]);
      setData(loc.data);
      setRequest(req.data);
      setAmount(req.data.pending_amount > 0 ? String(req.data.pending_amount) : "");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }, [tripId]);

  useEffect(() => {
    if (open && tripId) load();
  }, [open, tripId, load]);

  const shareLocation = async () => {
    if (!navigator.geolocation) {
      toast.error("This browser does not support GPS");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await api.post(`/trips/${tripId}/location`, {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            speed: position.coords.speed,
            source: "driver-phone",
          });
          toast.success("Location saved");
          load();
        } catch (error) {
          toast.error(errorMessage(error));
        } finally {
          setBusy(false);
        }
      },
      () => {
        setBusy(false);
        toast.error("GPS permission denied - location share nahi ho paya");
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const confirmPayment = async () => {
    const value = Number(amount);
    if (!value || value <= 0) {
      toast.error("Enter the amount received");
      return;
    }
    setScanBusy(true);
    try {
      const res = await api.post(`/payments/request/${tripId}/scan`, {
        amount: value,
        mode,
        reference: reference.trim(),
        source: "scanner",
      });
      toast.success(res.data.message);
      setReference("");
      await load();
      onClose?.();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setScanBusy(false);
    }
  };

  if (!trip) return null;

  return (
    <Modal
      open={open}
      size="lg"
      title={`Track & Collect — ${trip.party_name}`}
      subtitle={`${trip.from_location} → ${trip.to_location} • ${Number(trip.load_tons || 0)} tons`}
      onClose={onClose}
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-ink-50 px-3 py-2">
            <p className="text-[11px] font-semibold text-ink-500">Freight</p>
            <p className="font-mono text-sm font-bold text-ink-800">{rupees(trip.freight_amount)}</p>
          </div>
          <div className="rounded-xl bg-emerald-50 px-3 py-2">
            <p className="text-[11px] font-semibold text-emerald-700">Received</p>
            <p className="font-mono text-sm font-bold text-emerald-700">{rupees(trip.received_total)}</p>
          </div>
          <div className="rounded-xl bg-rose-50 px-3 py-2">
            <p className="text-[11px] font-semibold text-rose-700">Pending</p>
            <p className="font-mono text-sm font-bold text-rose-700">{rupees(pending)}</p>
          </div>
        </div>

        <Card>
          <CardHeader
            icon={MapPin}
            title="GPS tracking"
            subtitle="Driver phone ya GPS device ka location"
            action={
              <Button size="sm" onClick={shareLocation} disabled={busy}>
                <Crosshair size={15} /> {busy ? "Locating…" : "Share my location"}
              </Button>
            }
          />
          <CardBody>
            <TrackMap points={data.points || []} />
            <p className="mt-2 text-[11px] text-ink-400">
              Har point automatically save hota hai. Truck ka live route yahan dikhega.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            icon={QrCode}
            title="UPI payment request"
            subtitle="Party ko QR bhejein, ya scanner se payment confirm karein"
          />
          <CardBody className="space-y-3">
            {pending <= 0 ? (
              <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
                Is trip ka pura payment aa chuka hai — order Paid.
              </div>
            ) : (
              <>
                <div className="flex flex-col items-center gap-3 rounded-xl border border-ink-200 bg-white p-4 sm:flex-row">
                  <div className="flex h-40 w-40 shrink-0 items-center justify-center rounded-xl bg-white p-2 ring-1 ring-ink-200">
                    {request?.upi_link ? (
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=4&data=${encodeURIComponent(request.upi_link)}`}
                        alt="UPI QR code"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="text-center">
                        <p className="text-[11px] font-bold text-ink-600">UPI VPA set nahi hai</p>
                        <p className="text-[10px] text-ink-400">Backend me UPI_VPA add karein</p>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 text-center sm:text-left">
                    <p className="text-xs font-bold text-ink-800">{request?.payee_name}</p>
                    {request?.vpa ? (
                      <p className="font-mono text-sm font-bold text-brand-600">{request.vpa}</p>
                    ) : null}
                    <p className="mt-1 font-mono text-2xl font-bold text-ink-900">
                      {rupees(request?.pending_amount || pending)}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-ink-500">{request?.message}</p>
                    {request?.upi_link ? (
                      <a
                        href={request.upi_link}
                        className="mt-2 inline-flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white"
                      >
                        Open UPI app
                      </a>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-3">
                  <p className="mb-2 text-xs font-bold text-ink-700">
                    Scanner se payment confirm karein
                  </p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Field label="Amount received (₹)">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="20000"
                      />
                    </Field>
                    <Field label="Mode">
                      <Select value={mode} onChange={(e) => setMode(e.target.value)}>
                        {MODES.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="UPI ref / Txn ID">
                      <Input
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        placeholder="TXN123456"
                      />
                    </Field>
                  </div>
                  <Button className="mt-3 w-full" onClick={confirmPayment} disabled={scanBusy}>
                    <ArrowClockwise size={16} /> {scanBusy ? "Recording…" : "Confirm payment received"}
                  </Button>
                  <p className="mt-2 text-[11px] text-ink-500">
                    Poora payment milte hi order automatically <strong>Paid</strong> ho jayega aur truck{" "}
                    <strong>Available</strong> ho jayega.
                  </p>
                </div>
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </Modal>
  );
}