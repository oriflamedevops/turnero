if (!isTokenValid()) window.location.href = '/admin/';

let editingId = null;

function logout() {
  sessionStorage.removeItem('adminToken');
  window.location.href = '/admin/';
}

function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Cargar agentes ─────────────────────────────────────────────────────────
async function loadAgents() {
  try {
    const agents = await api.get('/api/agents/all');
    const showInactive = document.getElementById('show-inactive').checked;
    const filtered = showInactive ? agents : agents.filter(a => a.active);

    const tbody = document.getElementById('agents-tbody');
    const empty = document.getElementById('agents-empty');

    if (!filtered.length) {
      tbody.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    tbody.innerHTML = filtered.map(a => `
      <tr id="row-${a.id}">
        <td><code>${escHtml(a.code)}</code></td>
        <td>${escHtml(a.name)}</td>
        <td>${a.has_pin ? '<span class="badge badge-success">✓ Configurado</span>' : '<span class="badge badge-gray">Sin PIN</span>'}</td>
        <td><span class="badge ${a.active ? 'badge-success' : 'badge-gray'}">${a.active ? 'Activo' : 'Inactivo'}</span></td>
        <td>${a.total_ratings ?? 0}</td>
        <td>${a.avg_score !== null ? `${a.avg_score} ★` : '—'}</td>
        <td style="display:flex;gap:0.5rem;flex-wrap:wrap">
          <button class="btn btn-sm" onclick="startEdit(${a.id}, '${escHtml(a.name)}', '${escHtml(a.code)}')">Editar</button>
          ${a.active
            ? `<button class="btn btn-sm btn-danger" onclick="toggleActive(${a.id}, false)">Desactivar</button>`
            : `<button class="btn btn-sm btn-success" onclick="toggleActive(${a.id}, true)">Activar</button>`
          }
        </td>
      </tr>
    `).join('');
  } catch (e) {
    if (e.status === 401) { logout(); return; }
    showAlert('agents-alert', 'Error al cargar agentes', 'error');
  }
}

// ── Guardar (crear o actualizar) ───────────────────────────────────────────
async function saveAgent() {
  const name = document.getElementById('agent-name').value.trim();
  const code = document.getElementById('agent-code').value.trim();
  const pin  = document.getElementById('agent-pin').value.trim() || undefined;
  const alertEl = document.getElementById('form-alert');
  alertEl.innerHTML = '';

  if (!name || !code) {
    showAlert('form-alert', 'El nombre y el código son requeridos', 'error');
    return;
  }

  const btn = document.getElementById('btn-save');
  btn.disabled = true;

  try {
    if (editingId) {
      await api.patch(`/api/agents/${editingId}`, { name, code, pin });
      showAlert('form-alert', 'Agente actualizado correctamente', 'success');
    } else {
      await api.post('/api/agents', { name, code, pin });
      showAlert('form-alert', 'Agente agregado correctamente', 'success');
    }
    cancelEdit();
    loadAgents();
  } catch (e) {
    showAlert('form-alert', e.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// ── Editar ─────────────────────────────────────────────────────────────────
function startEdit(id, name, code) {
  editingId = id;
  document.getElementById('agent-name').value = name;
  document.getElementById('agent-code').value = code;
  document.getElementById('agent-pin').value = '';
  document.getElementById('form-title').textContent = 'Editar agente';
  document.getElementById('btn-save').textContent = 'Guardar cambios';
  document.getElementById('btn-cancel').style.display = 'inline-flex';
  document.getElementById('form-card').scrollIntoView({ behavior: 'smooth' });
}

function cancelEdit() {
  editingId = null;
  document.getElementById('agent-name').value = '';
  document.getElementById('agent-code').value = '';
  document.getElementById('agent-pin').value = '';
  document.getElementById('form-title').textContent = 'Agregar agente';
  document.getElementById('btn-save').textContent = 'Agregar agente';
  document.getElementById('btn-cancel').style.display = 'none';
  document.getElementById('form-alert').innerHTML = '';
}

// ── Activar / desactivar ───────────────────────────────────────────────────
async function toggleActive(id, active) {
  const action = active ? 'activar' : 'desactivar';
  if (!confirm(`¿Deseas ${action} este agente?`)) return;
  try {
    await api.patch(`/api/agents/${id}`, { active });
    loadAgents();
    showAlert('agents-alert', `Agente ${active ? 'activado' : 'desactivado'} correctamente`, 'success');
  } catch (e) {
    showAlert('agents-alert', e.message, 'error');
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────
function showAlert(containerId, msg, type) {
  const el = document.getElementById(containerId);
  el.innerHTML = `<div class="alert alert-${type === 'error' ? 'error' : 'success'}">${escHtml(msg)}</div>`;
  setTimeout(() => { el.innerHTML = ''; }, 4000);
}

// Enter para guardar
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && ['agent-name','agent-code','agent-pin'].includes(document.activeElement.id)) {
    saveAgent();
  }
});

loadAgents();
