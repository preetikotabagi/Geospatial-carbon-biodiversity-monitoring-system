import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import {
  listProjects,
  createProject as apiCreateProject,
  deleteProject as apiDeleteProject,
  listSites,
  createSite as apiCreateSite,
  getSiteAnalytics,
  addSiteMetric as apiAddSiteMetric,
} from "../api/endpoints";

import SummaryCards from "../components/SummaryCards";
import ProjectPanel from "../components/ProjectPanel";
import SiteForm from "../components/SiteForm";
import MapView from "../components/MapView";
import AnalyticsPanel from "../components/AnalyticsPanel";
import "../App.css";

function Dashboard() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const mapRef = useRef(null);
  const mapSectionRef = useRef(null);
  const analyticsPanelRef = useRef(null);

  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [analyticsById, setAnalyticsById] = useState({});

  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [siteFormProjectId, setSiteFormProjectId] = useState("");
  const [drawnGeometry, setDrawnGeometry] = useState(null);

  const [selectedSiteId, setSelectedSiteId] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // ---- Initial load -----------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      setLoading(true);
      setLoadError("");
      try {
        const [projectsData, sitesData] = await Promise.all([listProjects(), listSites()]);
        if (cancelled) return;

        setProjects(projectsData);
        setSites(sitesData);

        // Pre-fetch analytics for every site once, up front. This is what
        // lets the summary cards and the project filter update instantly
        // (from local state) without re-fetching analytics on every click.
        const entries = await Promise.all(
          sitesData.map(async (site) => {
            try {
              const analytics = await getSiteAnalytics(site.id);
              return [site.id, analytics];
            } catch {
              return [site.id, null];
            }
          })
        );
        if (cancelled) return;
        setAnalyticsById(Object.fromEntries(entries));
      } catch (err) {
        if (!cancelled) {
          setLoadError(err.response?.data?.detail || "Failed to load dashboard data.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadAll();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Derived state ------------------------------------------------------
  const filteredSites = useMemo(() => {
    if (!selectedProjectId) return sites;
    return sites.filter((site) => site.project_id === Number(selectedProjectId));
  }, [sites, selectedProjectId]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === Number(selectedProjectId)) || null,
    [projects, selectedProjectId]
  );

  const summary = useMemo(() => {
    const relevantAnalytics = filteredSites
      .map((site) => analyticsById[site.id])
      .filter(Boolean);

    const totalAreaHa = relevantAnalytics.reduce((sum, a) => sum + (a.area_hectares || 0), 0);
    const totalCarbon = relevantAnalytics.reduce(
      (sum, a) => sum + (a.current?.carbon_tco2e || 0),
      0
    );
    const avgBiodiversity =
      relevantAnalytics.length > 0
        ? relevantAnalytics.reduce((sum, a) => sum + (a.current?.biodiversity_score || 0), 0) /
          relevantAnalytics.length
        : 0;

    return {
      projectCount: projects.length,
      siteCount: filteredSites.length,
      totalAreaHa,
      totalCarbon,
      avgBiodiversity,
    };
  }, [filteredSites, analyticsById, projects.length]);

  const selectedSiteAnalytics = selectedSiteId ? analyticsById[selectedSiteId] : null;

  // When a project has no sites, bring the user directly to the map/site
  // section instead of leaving the empty state somewhere below the fold.
  useEffect(() => {
    if (!selectedProjectId || filteredSites.length > 0) return;

    const timer = window.setTimeout(() => {
      mapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);

    return () => window.clearTimeout(timer);
  }, [selectedProjectId, filteredSites.length]);

  // On smaller screens the analytics panel is below the map. Scroll it into
  // view after a site is selected so the charts are immediately visible.
  useEffect(() => {
    if (!selectedSiteId) return;

    const timer = window.setTimeout(() => {
      analyticsPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);

    return () => window.clearTimeout(timer);
  }, [selectedSiteId]);

  // ---- Handlers -----------------------------------------------------------
  const handleSelectProject = (projectId) => {
    setSelectedProjectId(projectId);
    setAnalyticsError("");

    // If the currently-open site analytics belong to a site outside the
    // newly selected project, close the panel so we never show stale data.
    if (selectedSiteId) {
      const site = sites.find((s) => s.id === selectedSiteId);
      if (projectId && site && site.project_id !== Number(projectId)) {
        setSelectedSiteId(null);
      }
    }
  };

  const handleCreateProject = async (payload) => {
    const newProject = await apiCreateProject(payload);
    setProjects((prev) => [newProject, ...prev]);
    setSelectedProjectId(String(newProject.id));
  };

  const handleDeleteProject = async (projectId) => {
    await apiDeleteProject(projectId);
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    setSites((prev) => prev.filter((s) => s.project_id !== projectId));
    if (Number(selectedProjectId) === projectId) {
      setSelectedProjectId("");
    }
    if (siteFormProjectId && Number(siteFormProjectId) === projectId) {
      setSiteFormProjectId("");
    }
    if (selectedSiteId) {
      const site = sites.find((s) => s.id === selectedSiteId);
      if (site && site.project_id === projectId) {
        setSelectedSiteId(null);
      }
    }
  };

  const handleSaveSite = async (payload) => {
    const created = await apiCreateSite(payload);

    // Build the full site object (with geometry) the way /sites/ returns it,
    // so the map can render it immediately without a full reload.
    const newSite = {
      id: created.id,
      project_id: created.project_id,
      name: created.name,
      description: created.description,
      geometry: payload.geometry,
      created_at: new Date().toISOString(),
    };

    setSites((prev) => [newSite, ...prev]);
    setDrawnGeometry(null);
    // Wipe the in-progress Mapbox Draw shape now that it has been
    // persisted as a real site polygon -- otherwise the raw drawn feature
    // stays visible on top of the newly-rendered site layer.
    mapRef.current?.clearDrawing();

    try {
      const analytics = await getSiteAnalytics(created.id);
      setAnalyticsById((prev) => ({ ...prev, [created.id]: analytics }));
    } catch {
      // Non-fatal: summary cards will just treat this site as having 0s
      // until the next refresh.
    }
  };

  const handleSiteClick = useCallback(
    async (siteId) => {
      const normalizedSiteId = Number(siteId);
      setSelectedSiteId(normalizedSiteId);
      setAnalyticsError("");

      if (!analyticsById[normalizedSiteId]) {
        setAnalyticsLoading(true);
        try {
          const analytics = await getSiteAnalytics(normalizedSiteId);
          setAnalyticsById((prev) => ({ ...prev, [normalizedSiteId]: analytics }));
        } catch (err) {
          setAnalyticsError(
            err.response?.data?.detail ||
              "Unable to load analytics for this site. Please try again."
          );
        } finally {
          setAnalyticsLoading(false);
        }
      }
    },
    [analyticsById]
  );

  const handleAddMetric = useCallback(async (siteId, metricPayload) => {
    const created = await apiAddSiteMetric(siteId, metricPayload);
    // Merge the new metric into local analytics state immediately so the
    // charts and current-value cards update without a re-fetch.
    setAnalyticsById((prev) => {
      const existing = prev[siteId];
      if (!existing) return prev;

      const historyWithoutSameYear = existing.history.filter((m) => m.year !== created.year);
      const nextHistory = [...historyWithoutSameYear, created].sort((a, b) => a.year - b.year);
      const latest = nextHistory[nextHistory.length - 1];

      return {
        ...prev,
        [siteId]: {
          ...existing,
          history: nextHistory,
          current: {
            carbon_tco2e: latest.carbon_tco2e,
            biodiversity_score: latest.biodiversity_score,
          },
        },
      };
    });
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  if (loading) {
    return (
      <div className="page-loading">
        <div className="spinner" />
        <p>Loading your monitoring dashboard...</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="logo-mark">DE</span>
          Darukaa.Earth
          <span className="topbar-tagline">
            Geospatial carbon &amp; biodiversity monitoring
          </span>
        </div>
        <button type="button" className="btn btn-secondary" onClick={handleLogout}>
          Log Out
        </button>
      </header>

      <main className="dashboard-body">
        {loadError && <div className="alert alert-error">{loadError}</div>}

        <SummaryCards {...summary} />

        <div className="panels-row">
          <ProjectPanel
            projects={projects}
            selectedProjectId={selectedProjectId}
            selectedProject={selectedProject}
            onSelectProject={handleSelectProject}
            onCreateProject={handleCreateProject}
            onDeleteProject={handleDeleteProject}
          />

          <SiteForm
            projects={projects}
            targetProjectId={siteFormProjectId}
            onTargetProjectChange={setSiteFormProjectId}
            drawnGeometry={drawnGeometry}
            onSaveSite={handleSaveSite}
          />
        </div>

        <div ref={mapSectionRef} className="card map-analytics-row">
          <div className="map-section">
            <div className="map-hint-overlay">
              <strong>How to add a site</strong>
              <span>1. Select a project</span>
              <span>2. Click the polygon tool in the top-left of the map</span>
              <span>3. Draw the boundary, then save the site details</span>
              <span>Click a shaded site anytime to view its analytics.</span>
            </div>

            <MapView
              ref={mapRef}
              sites={filteredSites}
              selectedSiteId={selectedSiteId}
              onSiteClick={handleSiteClick}
              onGeometryCreate={setDrawnGeometry}
              onGeometryDelete={() => setDrawnGeometry(null)}
            />

            {filteredSites.length === 0 && (
              <div className="site-empty-state">
                <div className="site-empty-icon" aria-hidden="true">⌖</div>
                <div>
                  <h3>{selectedProject ? "No sites found" : "No sites yet"}</h3>
                  <p>
                    {selectedProject
                      ? `There are no sites in "${selectedProject.name}" yet. Draw a polygon on the map above and save the site details to add one.`
                      : "No monitoring sites have been added yet. Select a project, draw a polygon on the map, and save the site details to create your first site."}
                  </p>
                </div>
              </div>
            )}
          </div>

          {selectedSiteId && (
            <div ref={analyticsPanelRef}>
              <AnalyticsPanel
                site={selectedSiteAnalytics}
                loading={analyticsLoading && !selectedSiteAnalytics}
                error={analyticsError}
                onClose={() => {
                  setSelectedSiteId(null);
                  setAnalyticsError("");
                }}
                onAddMetric={handleAddMetric}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default Dashboard;
