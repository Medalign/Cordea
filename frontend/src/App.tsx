import React, { useEffect, useState } from "react";
import Banner from "./components/Banner";
import GuardRailForm from "./components/GuardRailForm";
import TrendView from "./components/TrendView";
import { checkHealth } from "./api/client";

const App: React.FC = () => {
  const [apiHealthy, setApiHealthy] = useState<"unknown" | "ok" | "error">("unknown");

  useEffect(() => {
    let cancelled = false;
    const verify = async () => {
      const healthy = await checkHealth();
      if (!cancelled) {
        setApiHealthy(healthy ? "ok" : "error");
      }
    };
    verify();
    const interval = window.setInterval(verify, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <>
      <Banner />
      <main>
        <header style={{ marginBottom: "2rem" }}>
          <h1>DxLM ECG Assist — Lifespan demo</h1>
          <p className="helper-text" style={{ marginBottom: "0.5rem" }}>
            Rapid overview for NHS clinicians to review GuardRail interval checks and TrendView QTc
            monitoring on synthetic cases.
          </p>
          <p className="small-text" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <span
              style={{
                display: "inline-block",
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                backgroundColor: apiHealthy === "ok" ? "#2e8540" : apiHealthy === "error" ? "#d4351c" : "#b1b4b6",
              }}
              aria-hidden="true"
            />
            API connection: {apiHealthy === "ok" ? "Connected" : apiHealthy === "error" ? "Check backend" : "Checking…"}
          </p>
        </header>

        <GuardRailForm />
        <TrendView />
      </main>
    </>
  );
};

export default App;
