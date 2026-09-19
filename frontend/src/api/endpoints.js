import apiClient from "./client";

export const listProjects = () => apiClient.get("/projects/").then((r) => r.data);

export const createProject = (payload) =>
  apiClient.post("/projects/", payload).then((r) => r.data);

export const deleteProject = (projectId) =>
  apiClient.delete(`/projects/${projectId}`).then((r) => r.data);

export const listSites = () => apiClient.get("/sites/").then((r) => r.data);

export const createSite = (payload) => apiClient.post("/sites/", payload).then((r) => r.data);

export const getSiteAnalytics = (siteId) =>
  apiClient.get(`/sites/${siteId}/analytics`).then((r) => r.data);

export const addSiteMetric = (siteId, payload) =>
  apiClient.post(`/sites/${siteId}/metrics`, payload).then((r) => r.data);

export const updateSiteMetric = (siteId, year, payload) =>
  apiClient.put(`/sites/${siteId}/metrics/${year}`, { ...payload, year }).then((r) => r.data);
