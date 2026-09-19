import { useEffect, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const chartOptions = (yAxisLabel) => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      titleFont: { size: 14 },
      bodyFont: { size: 14 },
      padding: 10,
    },
  },
  scales: {
    x: {
      title: { display: true, text: "Year", font: { size: 14, weight: "600" } },
      ticks: { font: { size: 14 } },
    },
    y: {
      title: { display: true, text: yAxisLabel, font: { size: 14, weight: "600" } },
      ticks: { font: { size: 14 } },
      beginAtZero: true,
    },
  },
});

const currentYear = new Date().getFullYear();

function AddMetricForm({ siteId, history = [], onAddMetric }) {
  const latestYear = history.length
    ? Math.max(...history.map((item) => Number(item.year)))
    : currentYear - 1;
  const nextYear = latestYear + 1;
  const [year, setYear] = useState(String(nextYear));
  const [carbon, setCarbon] = useState("");
  const [biodiversity, setBiodiversity] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setYear(String(nextYear));
    setCarbon("");
    setBiodiversity("");
    setError("");
    setOpen(false);
  }, [siteId, nextYear]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const yearNum = Number(year);
    const carbonNum = Number(carbon);
    const bioNum = Number(biodiversity);

    if (!year || Number.isNaN(yearNum)) {
      setError("Enter a valid year.");
      return;
    }
    if (carbon === "" || Number.isNaN(carbonNum) || carbonNum < 0) {
      setError("Enter a valid carbon value (tCO\u2082e).");
      return;
    }
    if (biodiversity === "" || Number.isNaN(bioNum) || bioNum < 0 || bioNum > 100) {
      setError("Enter a biodiversity score between 0 and 100.");
      return;
    }

    setSaving(true);
    try {
      await onAddMetric(siteId, {
        year: yearNum,
        carbon_tco2e: carbonNum,
        biodiversity_score: bioNum,
      });
      setCarbon("");
      setBiodiversity("");
      setYear(String(Math.max(yearNum + 1, latestYear + 2)));
      setOpen(false);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to save this year's metrics.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-secondary btn-block"
        onClick={() => setOpen(true)}
      >
        + Add a yearly metric
      </button>
    );
  }

  return (
    <form className="metric-form" onSubmit={handleSubmit}>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="metric-form-grid">
        <div className="field">
          <label htmlFor="metric-year">Year</label>
          <input
            id="metric-year"
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="metric-carbon">Carbon (tCO₂e)</label>
          <input
            id="metric-carbon"
            type="number"
            min="0"
            placeholder="e.g. 320"
            value={carbon}
            onChange={(e) => setCarbon(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="metric-bio">Biodiversity (0-100)</label>
          <input
            id="metric-bio"
            type="number"
            min="0"
            max="100"
            placeholder="e.g. 68"
            value={biodiversity}
            onChange={(e) => setBiodiversity(e.target.value)}
          />
        </div>
      </div>
      <div className="metric-form-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setOpen(false);
            setError("");
          }}
        >
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving..." : "Save metric"}
        </button>
      </div>
    </form>
  );
}

function AnalyticsPanel({ site, loading, error, onClose, onAddMetric }) {
  if (loading) {
    return (
      <div className="analytics-panel">
        <div className="panel-actions-row">
          <div className="spinner" />
          <span className="hint-text">Loading analytics...</span>
        </div>
      </div>
    );
  }

  if (error && !site && !loading) {
    return (
      <div className="analytics-panel analytics-error-panel">
        <div className="analytics-header">
          <div>
            <h2>Analytics unavailable</h2>
            <p className="site-desc">The selected site could not be loaded.</p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close analytics panel"
          >
            &times;
          </button>
        </div>
        <div className="alert alert-error">{error}</div>
        <p className="hint-text">The map and site data are still available. You can select another site or try again after checking the API connection.</p>
      </div>
    );
  }

  if (!site) return null;

  const hasHistory = Boolean(site.history && site.history.length > 0);

  const carbonChartData = {
    labels: (site.history || []).map((item) => item.year),
    datasets: [
      {
        label: "Carbon (tCO\u2082e)",
        data: (site.history || []).map((item) => item.carbon_tco2e),
        borderColor: "#1f7a4c",
        backgroundColor: "rgba(31, 122, 76, 0.15)",
        pointBackgroundColor: "#1f7a4c",
        pointRadius: 4,
        tension: 0.3,
        fill: true,
      },
    ],
  };

  const biodiversityChartData = {
    labels: (site.history || []).map((item) => item.year),
    datasets: [
      {
        label: "Biodiversity Score",
        data: (site.history || []).map((item) => item.biodiversity_score),
        borderColor: "#2f6f9e",
        backgroundColor: "rgba(47, 111, 158, 0.15)",
        pointBackgroundColor: "#2f6f9e",
        pointRadius: 4,
        tension: 0.3,
        fill: true,
      },
    ],
  };

  return (
    <div className="analytics-panel">
      <div className="analytics-header">
        <div>
          <h2>{site.site.name}</h2>
          {site.site.description && <p className="site-desc">{site.site.description}</p>}
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={onClose}
          aria-label="Close analytics panel"
        >
          &times;
        </button>
      </div>

      <div className="analytics-metrics">
        <div className="analytics-metric">
          <p className="label">Area</p>
          <p className="value">{site.area_hectares.toFixed(2)}</p>
          <p className="unit">hectares</p>
        </div>
        <div className="analytics-metric">
          <p className="label">Carbon</p>
          <p className="value">{site.current.carbon_tco2e}</p>
          <p className="unit">tCO₂e</p>
        </div>
        <div className="analytics-metric">
          <p className="label">Biodiversity</p>
          <p className="value">{site.current.biodiversity_score}</p>
          <p className="unit">score / 100</p>
        </div>
      </div>

      {hasHistory ? (
        <>
          <div className="chart-block">
            <div className="chart-block-header">
              <h4>Carbon Performance Over Time</h4>
              <span className="badge badge-muted">Demo data</span>
            </div>
            <div className="chart-canvas">
              <Line data={carbonChartData} options={chartOptions("tCO\u2082e")} />
            </div>
          </div>

          <div className="chart-block">
            <div className="chart-block-header">
              <h4>Biodiversity Performance Over Time</h4>
              <span className="badge badge-muted">Demo data</span>
            </div>
            <div className="chart-canvas">
              <Line data={biodiversityChartData} options={chartOptions("Score")} />
            </div>
          </div>
        </>
      ) : (
        <div className="empty-state empty-state-panel">
          No historical metrics recorded for this site yet. Add one below to see it plotted on
          the performance charts.
        </div>
      )}

      <div className="metric-form-wrapper">
        <p className="hint-text metric-form-hint">
          Carbon and biodiversity figures are illustrative demo values for this MVP, entered
          manually below &mdash; only <strong>area</strong> is a real, computed measurement.
        </p>
        <AddMetricForm siteId={site.site.id} history={site.history || []} onAddMetric={onAddMetric} />
      </div>
    </div>
  );
}

export default AnalyticsPanel;
