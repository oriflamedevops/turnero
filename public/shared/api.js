function getAdminToken() {
  return sessionStorage.getItem('adminToken') || '';
}

async function apiFetch(method, path, body) {
  const token = getAdminToken();
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    }
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Error del servidor'), { status: res.status });
  return data;
}

const api = {
  get:   (path)       => apiFetch('GET',   path),
  post:  (path, body) => apiFetch('POST',  path, body),
  patch: (path, body) => apiFetch('PATCH', path, body),
};

// Decodifica el payload del JWT sin librería externa
function tokenPayload(token) {
  try { return JSON.parse(atob(token.split('.')[1])); } catch { return null; }
}

function isTokenValid() {
  const token = getAdminToken();
  if (!token) return false;
  const p = tokenPayload(token);
  return p && p.exp > Date.now() / 1000;
}

function renderStars(score, max = 5) {
  let html = '<span class="stars">';
  for (let i = 1; i <= max; i++) {
    html += `<span class="${i <= score ? '' : 'empty'}">★</span>`;
  }
  return html + '</span>';
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
}
