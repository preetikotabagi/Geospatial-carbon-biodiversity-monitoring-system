import { useState } from "react";

function ProjectPanel({
  projects,
  selectedProjectId,
  selectedProject,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Please enter a project name.");
      return;
    }

    setCreating(true);
    try {
      await onCreateProject({ name: name.trim(), description: description.trim() });
      setName("");
      setDescription("");
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to create project.");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedProjectId || !selectedProject) return;

    const confirmed = window.confirm(
      `Delete "${selectedProject.name}"? All of its sites and analytics will also be deleted. This cannot be undone.`
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      await onDeleteProject(selectedProject.id);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to delete project.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="card panel">
      <div className="panel-heading">
        <h3>Projects</h3>
        <span className="badge">{projects.length} total</span>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="project-select-row">
        <div className="field">
          <label htmlFor="project-select">Viewing</label>
          <select
            id="project-select"
            value={selectedProjectId}
            onChange={(e) => onSelectProject(e.target.value)}
          >
            <option value="">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="btn btn-danger"
          onClick={handleDelete}
          disabled={!selectedProjectId || deleting}
        >
          {deleting ? "Deleting..." : "Delete Project"}
        </button>
      </div>

      <p className="viewing-label">
        Viewing: <strong>{selectedProject ? selectedProject.name : "All Projects"}</strong>
        {selectedProject?.description ? ` \u2014 ${selectedProject.description}` : ""}
      </p>

      {projects.length === 0 ? (
        <p className="hint-text">
          You don&apos;t have any projects yet. Create one below to get started.
        </p>
      ) : null}

      <hr className="panel-divider" />

      <h3>Create Project</h3>
      <form onSubmit={handleCreate}>
        <div className="field">
          <label htmlFor="project-name">Name</label>
          <input
            id="project-name"
            type="text"
            placeholder="e.g. Western Ghats Restoration"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="project-description">Description</label>
          <input
            id="project-description"
            type="text"
            placeholder="Optional short description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={creating}>
          {creating ? "Creating..." : "Create Project"}
        </button>
      </form>
    </div>
  );
}

export default ProjectPanel;
