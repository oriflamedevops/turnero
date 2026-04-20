const express = require('express');
const supabase = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Rate limiting: 5 segundos por agente (evita doble-tap accidental)
const recentSubmits = new Map();

setInterval(() => {
  const cutoff = Date.now() - 10 * 1000;
  for (const [key, ts] of recentSubmits) {
    if (ts < cutoff) recentSubmits.delete(key);
  }
}, 60 * 1000);

async function checkRateLimit(agentId) {
  const now = Date.now();
  const last = recentSubmits.get(agentId);
  if (last && now - last < 5000) return false;

  // Verificar en DB para cubrir reinicios del servidor
  const fiveSecsAgo = new Date(now - 5000).toISOString();
  const { data } = await supabase
    .from('ratings')
    .select('id')
    .eq('agent_id', agentId)
    .gte('created_at', fiveSecsAgo)
    .limit(1);

  if (data && data.length > 0) {
    recentSubmits.set(agentId, now);
    return false;
  }

  recentSubmits.set(agentId, now);
  return true;
}

// POST /api/ratings — enviar calificacion
router.post('/', async (req, res) => {
  const { agent_id, score, comment } = req.body;
  if (!agent_id || !score) return res.status(400).json({ error: 'agent_id y score son requeridos' });

  const scoreNum = parseInt(score);
  if (isNaN(scoreNum) || scoreNum < 1 || scoreNum > 5) {
    return res.status(400).json({ error: 'score debe ser entre 1 y 5' });
  }

  const { data: agent } = await supabase
    .from('agents').select('id').eq('id', agent_id).eq('active', 1).maybeSingle();
  if (!agent) return res.status(404).json({ error: 'Agente no encontrado o inactivo' });

  if (!await checkRateLimit(agent_id)) {
    return res.status(429).json({ error: 'Espera un momento antes de enviar otra calificación.' });
  }

  const safeComment = comment ? String(comment).slice(0, 280) : null;
  const { data, error } = await supabase
    .from('ratings')
    .insert({ agent_id, score: scoreNum, comment: safeComment })
    .select('id')
    .single();

  if (error) throw error;
  res.status(201).json({ id: data.id });
});

// GET /api/ratings — listado paginado (admin)
router.get('/', requireAdmin, async (req, res) => {
  const { agent_id, from, to, page = 1 } = req.query;

  const { data, error } = await supabase.rpc('fn_ratings_paged', {
    p_agent_id: agent_id ? parseInt(agent_id) : null,
    p_from:     from || null,
    p_to:       to   || null,
    p_page:     parseInt(page)
  });

  if (error) throw error;
  res.json(data);
});

module.exports = router;
