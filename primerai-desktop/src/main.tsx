import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { CookieConsent } from "./components/CookieConsent";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
    <CookieConsent />
  </React.StrictMode>,
);
