import "../styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CaptureError } from "./CaptureError";
import { CapturePage } from "./CapturePage";

const params = new URLSearchParams(window.location.search);
const error = params.get("error");

createRoot(document.getElementById("root")!).render(
  <StrictMode>{error ? <CaptureError reason={error} /> : <CapturePage draftId={params.get("draft")} />}</StrictMode>,
);
