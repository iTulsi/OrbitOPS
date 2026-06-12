import { useEffect, useState } from "react";
import { orbitApi } from "../services/api";

function Reports() {
  const [health, setHealth] = useState(null);
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadReports() {
    try {
      setLoading(true);
      setError("");

      const [healthData, briefingData] = await Promise.all([
        orbitApi.health(),
        orbitApi.aiBriefing(),
      ]);

      setHealth(healthData);
      setBriefing(briefingData);
    } catch (err) {
      setError(err.message || "Unable to load OrbitOPS AI reports.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReports();
  }, []);

  const reportText =
    briefing?.briefing ||
    briefing?.report ||
    briefing?.summary ||
    briefing?.message ||
    "OrbitOPS AI briefing is currently unavailable. Live orbital monitoring is still active.";

  return (
    <main className="reports-page">
      <section className="page-header">
        <p className="eyebrow">OrbitOPS Intelligence</p>
        <h1>AI Mission Reports</h1>
        <p>
          Automated orbital intelligence generated from live satellite and debris data.
        </p>
      </section>

      {loading && (
        <section className="panel">
          <h2>Generating mission report...</h2>
          <p>Analyzing backend health, tracked objects, and orbital risk data.</p>
        </section>
      )}

      {error && (
        <section className="panel error-panel">
          <h2>Unable to load AI report</h2>
          <p>{error}</p>
          <button onClick={loadReports}>Retry</button>
        </section>
      )}

      {!loading && !error && (
        <>
          <section className="metrics-grid">
            <div className="metric-card">
              <span>Backend Status</span>
              <strong>{health?.backend_status || "unknown"}</strong>
            </div>

            <div className="metric-card">
              <span>Tracked Objects</span>
              <strong>{health?.objects ?? "—"}</strong>
            </div>

            <div className="metric-card">
              <span>Data Source</span>
              <strong>{health?.source || "unknown"}</strong>
            </div>

            <div className="metric-card">
              <span>System Status</span>
              <strong>{health?.status || "unknown"}</strong>
            </div>
          </section>

          <section className="panel report-panel">
            <h2>Current AI Briefing</h2>
            <p>{reportText}</p>
          </section>
        </>
      )}
    </main>
  );
}

export default Reports;
