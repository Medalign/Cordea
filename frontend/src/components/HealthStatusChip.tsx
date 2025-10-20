import React, { useEffect, useState } from "react";
import { healthz } from "../api/client";

type Status = "checking" | "healthy" | "unhealthy";

const STATUS_LABEL: Record<Status, string> = {
  healthy: "Green",
  checking: "Amber",
  unhealthy: "Red",
};

const STATUS_DESCRIPTION: Record<Status, string> = {
  healthy: "API connection healthy",
  checking: "Verifying API availability",
  unhealthy: "API connection unavailable",
};

const HealthStatusChip: React.FC = () => {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    let cancelled = false;

    const probe = async () => {
      const ok = await healthz();
      if (!cancelled) {
        setStatus(ok ? "healthy" : "unhealthy");
      }
    };

    probe();
    const intervalId = window.setInterval(() => {
      setStatus((prev) => (prev === "unhealthy" ? prev : "checking"));
      void probe();
    }, 10_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <span className={`health-chip ${status}`} role="status" aria-live="polite" aria-label={STATUS_DESCRIPTION[status]}>
      API: <strong>{STATUS_LABEL[status]}</strong>
    </span>
  );
};

export default HealthStatusChip;
