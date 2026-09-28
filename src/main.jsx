import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/vazirmatn";
import "@fontsource-variable/estedad";

// The game by default; the original banner demo at #banner.
const Page = location.hash === "#banner" ? lazy(() => import("./crowd/Example.jsx")) : lazy(() => import("./game/Game.jsx"));
if (location.hash === "#banner") import("./crowd/coin-crowd.css");

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  </StrictMode>,
);
