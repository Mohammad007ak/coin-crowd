import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/vazirmatn";
import "@fontsource-variable/estedad";
import "./crowd/coin-crowd.css";
import Example from "./crowd/Example.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Example />
  </StrictMode>,
);
