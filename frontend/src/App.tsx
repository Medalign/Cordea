import React from "react";
import Banner from "./components/Banner";
import GuardRailForm from "./components/GuardRailForm";
import TrendView from "./components/TrendView";
import HealthStatusChip from "./components/HealthStatusChip";

const App: React.FC = () => {
  return (
    <div className="page-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <Banner />
      <main id="main-content" tabIndex={-1}>
        <header className="page-header">
          <div>
            <h1>ECG Assist</h1>
            <p className="helper-text">
              Clinician-facing demonstration of GuardRail interval checks and TrendView QTc monitoring
              using fully synthetic cases.
            </p>
          </div>
          <HealthStatusChip />
        </header>

        <GuardRailForm />
        <TrendView />
      </main>
    </div>
  );
};

export default App;
