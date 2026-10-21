import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./lib/auth";
import { I18nProvider } from "./lib/i18n";
import { ensureSession } from "./lib/localBackend";
import { CONFIGURED } from "./lib/firebase";
import { resume as resumeCloud } from "./lib/cloudSync";
import "./index.css";

if (CONFIGURED) {
  // Cloud mode: login screen dikhao; session pehle se ho to data pull karo.
  if (localStorage.getItem("rdt_token")) resumeCloud();
} else {
  // Offline mode: bina login seedhe owner ke roop me kholo.
  ensureSession();
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <I18nProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
);