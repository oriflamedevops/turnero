// Verificar autenticación
if (!sessionStorage.getItem('adminPin')) window.location.href = '/admin/';

let chartDist = null;
let chartTrend = null;
let sortCol = 3;
let sortAsc = false;
let currentAgents = [];

function logout() {
  sessionStorage.removeItem('adminPin');
  window.location.href = '/admin/';
}

// ── Filtros ────────────────────────────────────────────────────────────────
function getFilters() {
  return {
    from:        document.getElementById('filter-from').value,
    to:          document.getElementById('filter-to').value,
    agent_id:    document.getElementById('filter-agent').value,
    granularity: document.getElementById('filter-granularity').value
  };
}

function buildQS(obj) {
  return Object.entries(obj).filter(([,v]) => v).map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}

function applyFilters() { loadDashboard(); }

function resetFilters() {
  document.getElementById('filter-from').value = '';
  document.getElementById('filter-to').value = '';
  document.getElementById('filter-agent').value = '';
  document.getElementById('filter-granularity').value = 'month';
  loadDashboard();
}

// ── Cargar todo ────────────────────────────────────────────────────────────
async function loadDashboard() {
  const { from, to, agent_id, granularity } = getFilters();
  const qs = buildQS({ from, to });
  const qsAgent = buildQS({ from, to, agent_id });

  try {
    const [summary, dist, trend, ratings] = await Promise.all([
      api.get('/api/reports/summary?' + qs),
      api.get('/api/reports/distribution?' + qsAgent),
      api.get('/api/reports/trend?' + buildQS({ from, to, agent_id, granularity })),
      api.get('/api/ratings?' + qsAgent)
    ]);

    renderKPIs(summary);
    renderDistChart(dist);
    renderTrendChart(trend, granularity);
    renderAgentsTable(summary.agents);
    renderFeed(ratings.data);
  } catch (e) {
    if (e.status === 401) { logout(); return; }
    console.error(e);
  }
}

// ── KPIs ───────────────────────────────────────────────────────────────────
function renderKPIs(summary) {
  const { overall, agents } = summary;
  document.getElementById('kpi-avg').textContent   = overall.avg_score ?? '—';
  document.getElementById('kpi-total').textContent = overall.total ?? 0;

  const withRatings = agents.filter(a => a.total_ratings > 0 && a.active);
  document.getElementById('kpi-agents').textContent = withRatings.length;

  const best = agents.filter(a => a.avg_score !== null).sort((a,b) => b.avg_score - a.avg_score)[0];
  if (best) {
    document.getElementById('kpi-best').textContent = best.name;
    document.getElementById('kpi-best-score').textContent = `${best.avg_score} ★  (${best.total_ratings} cal.)`;
  } else {
    document.getElementById('kpi-best').textContent = '—';
    document.getElementById('kpi-best-score').textContent = '';
  }
}

// ── Gráfica distribución ───────────────────────────────────────────────────
function renderDistChart(dist) {
  if (chartDist) chartDist.destroy();
  const ctx = document.getElementById('chart-dist').getContext('2d');
  const colors = ['#ef4444','#f97316','#eab308','#84cc16','#22c55e'];
  chartDist = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['1 ★','2 ★','3 ★','4 ★','5 ★'],
      datasets: [{ data: dist.map(d => d.count), backgroundColor: colors, borderRadius: 6 }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
    }
  });
}

// ── Gráfica tendencia ──────────────────────────────────────────────────────
function renderTrendChart(trend, granularity) {
  if (chartTrend) chartTrend.destroy();
  const ctx = document.getElementById('chart-trend').getContext('2d');
  chartTrend = new Chart(ctx, {
    type: 'line',
    data: {
      labels: trend.map(t => t.period),
      datasets: [{
        label: 'Promedio',
        data: trend.map(t => t.avg_score),
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37,99,235,0.08)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: '#2563eb'
      }]
    },
    options: {
      scales: { y: { min: 1, max: 5, ticks: { stepSize: 1 } } },
      plugins: { legend: { display: false } }
    }
  });
}

// ── Tabla de agentes ───────────────────────────────────────────────────────
function renderAgentsTable(agents) {
  currentAgents = agents;
  renderTableRows();
}

function sortTable(col) {
  if (sortCol === col) { sortAsc = !sortAsc; } else { sortCol = col; sortAsc = true; }
  document.querySelectorAll('.sort-arrow').forEach((el, i) => {
    el.textContent = i === col ? (sortAsc ? '↑' : '↓') : '↕';
    el.classList.toggle('active', i === col);
  });
  renderTableRows();
}

function renderTableRows() {
  const keys = ['name', 'code', 'active', 'total_ratings', 'avg_score', 'last_rating'];
  const sorted = [...currentAgents].sort((a, b) => {
    const va = a[keys[sortCol]] ?? '', vb = b[keys[sortCol]] ?? '';
    return sortAsc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
  });

  const tbody = document.getElementById('agents-tbody');
  const empty = document.getElementById('agents-empty');
  if (!sorted.length) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  const trendIcon = t => t === 'up' ? '<span class="trend-up">↑ Subiendo</span>'
                       : t === 'down' ? '<span class="trend-down">↓ Bajando</span>'
                       : '<span class="trend-stable">— Estable</span>';

  tbody.innerHTML = sorted.map(a => `
    <tr>
      <td>${escHtml(a.name)}</td>
      <td><code>${escHtml(a.code)}</code></td>
      <td><span class="badge ${a.active ? 'badge-success' : 'badge-gray'}">${a.active ? 'Activo' : 'Inactivo'}</span></td>
      <td>${a.total_ratings ?? 0}</td>
      <td>${a.avg_score !== null ? `${a.avg_score} ★` : '—'}</td>
      <td>${formatDate(a.last_rating)}</td>
      <td>${trendIcon(a.trend)}</td>
    </tr>
  `).join('');
}

// ── Feed ───────────────────────────────────────────────────────────────────
function renderFeed(ratings) {
  const feed = document.getElementById('feed');
  const empty = document.getElementById('feed-empty');
  if (!ratings || !ratings.length) {
    feed.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  feed.innerHTML = ratings.map(r => `
    <div class="feed-item">
      <div class="fi-agent">${escHtml(r.agent_name)}</div>
      <div class="fi-score">${'★'.repeat(r.score)}${'☆'.repeat(5-r.score)}</div>
      <div class="fi-comment">${r.comment ? escHtml(r.comment) : '<em style="opacity:.5">Sin comentario</em>'}</div>
      <div class="fi-date">${formatDate(r.created_at)}</div>
    </div>
  `).join('');
}

// ── CSV export ─────────────────────────────────────────────────────────────
function exportCsv() {
  const { from, to, agent_id } = getFilters();
  const qs = buildQS({ from, to, agent_id });
  const link = document.createElement('a');
  link.href = '/api/reports/export?' + qs;
  link.setAttribute('download', '');
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Cargar agentes en filtro ───────────────────────────────────────────────
async function loadAgentFilter() {
  try {
    const agents = await api.get('/api/agents/all');
    const sel = document.getElementById('filter-agent');
    agents.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = `${a.name} (${a.code})`;
      sel.appendChild(opt);
    });
  } catch {}
}

// ── Init ───────────────────────────────────────────────────────────────────
loadAgentFilter();
loadDashboard();
