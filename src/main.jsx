import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import * as Tooltip from "@radix-ui/react-tooltip";
import App from "./App.jsx";
import Privacy from "./pages/Privacy.jsx";
import Terms from "./pages/Terms.jsx";
import Account from "./pages/Account.jsx";
import AdminPanel from "./pages/AdminPanel.jsx";
import { AuthProvider } from "./contexts/AuthContext.jsx";
import { ToastProvider } from "./components/Toast.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary
      title="TailorMyText couldn't start"
      description="An unexpected error broke the app. Reset to try again — your saved documents are safe."
      onReset={() => window.location.reload()}
    >
      <BrowserRouter>
        <Tooltip.Provider delayDuration={400} skipDelayDuration={100}>
          <AuthProvider>
            <ToastProvider>
              <Routes>
                <Route path="/" element={<App />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/account" element={<Account />} />
                <Route path="/admin" element={<AdminPanel />} />
              </Routes>
            </ToastProvider>
          </AuthProvider>
        </Tooltip.Provider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
