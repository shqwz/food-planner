async function parseJsonSafe(response) {
  const ct = (response.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("application/json")) {
    const t = await response.text();
    const err = new Error(t.slice(0, 200) || `HTTP ${response.status}`);
    err.status = response.status;
    throw err;
  }
  try {
    return await response.json();
  } catch {
    const err = new Error(`HTTP ${response.status}: ответ не JSON`);
    err.status = response.status;
    throw err;
  }
}

function rejectApi(response, data) {
  const message = data?.error || `HTTP ${response.status}`;
  const err = new Error(message);
  err.status = response.status;
  err.body = data;
  throw err;
}

export async function apiGet(path, params = {}) {
  const url = new URL(path, window.location.origin);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, String(v));
    }
  });
  const response = await fetch(url.toString());
  const data = await parseJsonSafe(response);
  if (!response.ok) {
    rejectApi(response, data);
  }
  return data;
}

export async function apiPost(path, payload = {}) {
  const url = new URL(path, window.location.origin).href;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await parseJsonSafe(response);
  if (!response.ok) {
    rejectApi(response, data);
  }
  return data;
}

export async function apiPut(path, payload = {}) {
  const url = new URL(path, window.location.origin).href;
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await parseJsonSafe(response);
  if (!response.ok) {
    rejectApi(response, data);
  }
  return data;
}

export async function apiPatch(path, payload = {}) {
  const url = new URL(path, window.location.origin).href;
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await parseJsonSafe(response);
  if (!response.ok) {
    rejectApi(response, data);
  }
  return data;
}

export async function apiDelete(path, params = {}) {
  const url = new URL(path, window.location.origin);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, String(v));
    }
  });
  const response = await fetch(url.toString(), { method: "DELETE" });
  const data = await parseJsonSafe(response);
  if (!response.ok) {
    rejectApi(response, data);
  }
  return data;
}
