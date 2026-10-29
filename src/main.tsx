import React from "react";
import ReactDOM from "react-dom/client";
// Self-hosted, not the Google Fonts CDN: the app has to render the same with
// no network. Variable files, so the weight range costs one request each.
import "@fontsource-variable/familjen-grotesk";
import "@fontsource-variable/geist-mono";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
