import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
});

// GitHub Pages jaisa sub-path deployment (e.g. /ram-darbar-tracker/) ke liye.
const BASE = import.meta.env.BASE_URL || "/";

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("rdt_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const onLoginPage = window.location.pathname === `${BASE}login`.replace("//", "/");
    const isLoginCall = error?.config?.url?.includes("/auth/login");
    if (status === 401 && !onLoginPage && !isLoginCall) {
      localStorage.removeItem("rdt_token");
      localStorage.removeItem("rdt_user");
      const from = window.location.pathname + window.location.search;
      sessionStorage.setItem("rdt_expired", "1");
      const loginPath = `${BASE}login`.replace("//", "/");
      window.location.assign(`${loginPath}${from && from !== "/" ? `?from=${encodeURIComponent(from)}` : ""}`);
    }
    return Promise.reject(error);
  },
);

export function errorMessage(error, fallback = "Something went wrong") {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
  if (error?.code === "ERR_NETWORK") return "Cannot reach the backend (is uvicorn running?)";
  return fallback;
}

export async function downloadBilty(tripId, partyName) {
  const response = await api.get(`/trips/${tripId}/bilty.pdf`, { responseType: "blob" });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = `bilty-${(partyName || "trip").replace(/\s+/g, "-").toLowerCase()}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}