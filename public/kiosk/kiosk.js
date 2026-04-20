const LABELS = ['', 'Muy malo', 'Malo', 'Regular', 'Bueno', '¡Excelente!'];

let selectedAgent = null;
let selectedScore = 0;
let countdownTimer = null;

// ── Pantallas ──────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function goBack() {
  selectedScore = 0;
  selectedAgent = null;
  resetStars();
  document.getElementById('comment-input').value = '';
  document.getElementById('char-count').textContent = '0/280';
  document.getElementById('btn-submit').disabled = true;
  document.getElementById('rate-error').style.display = 'none';
  showScreen('screen-select');
}

// ── Cargar agentes ─────────────────────────────────────────────────────────
async function loadAgents() {
  try {
    const agents = await api.get('/api/agents');
    const grid = document.getElementById('agent-grid');
    const empty = document.getElementById('no-agents');

    if (!agents.length) {
      grid.style.display = 'none';
      empty.style.display = 'block';
      return;
    }

    grid.innerHTML = agents.map(a => `
      <button class="agent-btn" onclick="selectAgent(${a.id}, '${escHtml(a.name)}')">
        <div class="avatar">${a.name.charAt(0).toUpperCase()}</div>
        <div class="agent-name">${escHtml(a.name)}</div>
        <div class="agent-code">${escHtml(a.code)}</div>
      </button>
    `).join('');
  } catch (e) {
    document.getElementById('agent-grid').innerHTML =
      '<p style="color:white;text-align:center">Error al cargar agentes. Recarga la página.</p>';
  }
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Seleccionar agente ─────────────────────────────────────────────────────
function selectAgent(id, name) {
  selectedAgent = id;
  document.getElementById('rate-agent-name').textContent = name;
  showScreen('screen-rate');
}

// ── Estrellas ──────────────────────────────────────────────────────────────
function resetStars() {
  document.querySelectorAll('.star-btn').forEach(b => b.classList.remove('active', 'hovered'));
  document.getElementById('score-label').textContent = 'Toca una estrella';
  selectedScore = 0;
}

document.querySelectorAll('.star-btn').forEach(btn => {
  const score = parseInt(btn.dataset.score);

  btn.addEventListener('mouseenter', () => {
    document.querySelectorAll('.star-btn').forEach(b => {
      b.classList.toggle('hovered', parseInt(b.dataset.score) <= score);
    });
    document.getElementById('score-label').textContent = LABELS[score];
  });

  btn.addEventListener('mouseleave', () => {
    document.querySelectorAll('.star-btn').forEach(b => b.classList.remove('hovered'));
    document.getElementById('score-label').textContent = selectedScore ? LABELS[selectedScore] : 'Toca una estrella';
  });

  btn.addEventListener('click', () => {
    selectedScore = score;
    document.querySelectorAll('.star-btn').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.score) <= score);
      b.classList.remove('hovered');
    });
    document.getElementById('score-label').textContent = LABELS[score];
    document.getElementById('btn-submit').disabled = false;
  });
});

// Contador de caracteres
document.getElementById('comment-input').addEventListener('input', function () {
  document.getElementById('char-count').textContent = `${this.value.length}/280`;
});

// ── Enviar calificación ────────────────────────────────────────────────────
async function submitRating() {
  const btn = document.getElementById('btn-submit');
  const errEl = document.getElementById('rate-error');
  btn.disabled = true;
  btn.textContent = 'Enviando…';
  errEl.style.display = 'none';

  try {
    await api.post('/api/ratings', {
      agent_id: selectedAgent,
      score: selectedScore,
      comment: document.getElementById('comment-input').value.trim() || null
    });
    showThanks();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Enviar calificación';
  }
}

// ── Pantalla de gracias ────────────────────────────────────────────────────
function showThanks() {
  showScreen('screen-thanks');
  let n = 5;
  document.getElementById('countdown-num').textContent = n;
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    n--;
    document.getElementById('countdown-num').textContent = n;
    if (n <= 0) {
      clearInterval(countdownTimer);
      document.getElementById('comment-input').value = '';
      document.getElementById('char-count').textContent = '0/280';
      resetStars();
      selectedAgent = null;
      selectedScore = 0;
      document.getElementById('btn-submit').disabled = true;
      showScreen('screen-select');
    }
  }, 1000);
}

// ── Init ───────────────────────────────────────────────────────────────────
loadAgents();
