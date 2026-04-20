function getAdminPin() {
  return sessionStorage.getItem('adminPin') || '';
}

async function apiFetch(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Admin-Pin': getAdminPin() }
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Error del servidor'), { status: res.status });
  return data;
}

const api = {
  get:   (path)         => apiFetch('GET',   path),
  post:  (path, body)   => apiFetch('POST',  path, body),
  patch: (path, body)   => apiFetch('PATCH', path, body),
};

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
