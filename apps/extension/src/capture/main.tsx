import "../styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CapturePage } from "./CapturePage";

const draftId = new URLSearchParams(window.location.search).get("draft");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CapturePage draftId={draftId} />
  </StrictMode>,
);
