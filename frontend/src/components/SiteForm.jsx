import { useState } from "react";

function SiteForm({
  projects,
  targetProjectId,
  onTargetProjectChange,
  drawnGeometry,
  onSaveSite,
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");

    if (!targetProjectId) {
      setError("Please select a project for this site.");
      return;
    }
    if (!drawnGeometry) {
      setError("Please draw a polygon on the map first.");
      return;
    }
    if (!name.trim()) {
      setError("Please enter a site name.");
      return;
    }

    setSaving(true);
    try {
      await onSaveSite({
        project_id: Number(targetProjectId),
        name: name.trim(),
        description: description.trim(),
        geometry: drawnGeometry,
      });
      setName("");
      setDescription("");
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to create site.");
    } finally {
      setSaving(false);
    }
  };

  const projectChosen = Boolean(targetProjectId);
  const polygonDrawn = Boolean(drawnGeometry);

  return (
    <div className="card panel">
      <div className="panel-heading">
        <h3>Add Site</h3>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="step-list" aria-hidden="true">
        <div className={`step-list-item${projectChosen ? " done" : ""}`}>
          <span className="step-badge">1</span>
          Select a project
        </div>
        <div className={`step-list-item${polygonDrawn ? " done" : ""}`}>
          <span className="step-badge">2</span>
          Draw a polygon on the map
        </div>
        <div className={`step-list-item${projectChosen && polygonDrawn ? " done" : ""}`}>
          <span className="step-badge">3</span>
          Enter site details and save
        </div>
      </div>

      <div className="field">
        <label htmlFor="site-project">Project</label>
        <select
          id="site-project"
          value={targetProjectId}
          onChange={(e) => onTargetProjectChange(e.target.value)}
        >
          <option value="">Select a project...</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </div>

      <p className="hint-text">
        {drawnGeometry
          ? "Polygon drawn \u2014 fill in the details and save."
          : "Use the polygon tool on the map to draw this site's boundary."}
      </p>

      <form onSubmit={handleSave}>
        <div className="field">
          <label htmlFor="site-name">Site name</label>
          <input
            id="site-name"
            type="text"
            placeholder="e.g. North Block Plot 4"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="site-description">Description</label>
          <input
            id="site-description"
            type="text"
            placeholder="Optional short description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={saving || !targetProjectId || !drawnGeometry}
        >
          {saving ? "Saving..." : "Save Site"}
        </button>
      </form>
    </div>
  );
}

export default SiteForm;
