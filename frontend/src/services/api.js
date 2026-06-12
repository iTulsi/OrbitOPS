const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? "http://127.0.0.1:5050" : "");

async function request(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;

  try {
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(data?.error || data?.message || `Request failed: ${url}`);
    }

    return data;
  } catch (error) {
    console.error(`[OrbitOPS API Error] ${url}:`, error);
    throw new Error(error.message || "Load failed");
  }
}

export const orbitApi = {
  health: () => request("/api/health"),
  debris: () => request("/api/debris"),
  objects: () => request("/api/objects"),
  stats: () => request("/api/stats"),
  risk: () => request("/api/risk"),
  highRisk: () => request("/api/high-risk"),
  aiBriefing: () => request("/api/ai/briefing"),
  forceFetch: () =>
    request("/api/force_fetch", {
      method: "POST",
    }),
};
