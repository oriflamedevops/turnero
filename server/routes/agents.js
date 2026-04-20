const express  = require('express');
const bcrypt   = require('bcryptjs');
const supabase = require('../db');
const { requireAdmin } = require('../middleware/auth');

async function hashPassword(raw) {
  return raw ? bcrypt.hash(String(raw), 10) : null;
}

const router = express.Router();

// GET /api/agents — solo agentes activos (para kiosk)
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('agents')
    .select('id, name, code')
    .eq('active', 1)
    .order('name');
  if (error) throw error;
  res.json(data);
});

// GET /api/agents/all — todos con stats (para admin)
router.get('/all', requireAdmin, async (req, res) => {
  const { data, error } = await supabase.rpc('fn_agents_all');
  if (error) throw error;
  res.json(data);
});

// POST /api/agents — crear agente
router.post('/', requireAdmin, async (req, res) => {
  const { name, code, pin } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'name y code son requeridos' });
  if (name.length > 100) return res.status(400).json({ error: 'name muy largo (max 100)' });

  const { data, error } = await supabase
    .from('agents')
    .insert({ name: name.trim(), code: code.trim().toUpperCase(), pin: await hashPassword(pin) })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'El codigo ya existe' });
    throw error;
  }
  res.status(201).json({ id: data.id, name: name.trim(), code: code.trim().toUpperCase() });
});

// PATCH /api/agents/:id — actualizar nombre, código, pin o estado
router.patch('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;

  const { data: agent } = await supabase
    .from('agents').select('*').eq('id', id).maybeSingle();
  if (!agent) return res.status(404).json({ error: 'Agente no encontrado' });

  const updates = {
    name:   req.body.name   !== undefined ? req.body.name.trim()               : agent.name,
    code:   req.body.code   !== undefined ? req.body.code.trim().toUpperCase()  : agent.code,
    active: req.body.active !== undefined ? (req.body.active ? 1 : 0)           : agent.active,
    pin:    req.body.pin    !== undefined ? await hashPassword(req.body.pin) : agent.pin,
  };

  const { error } = await supabase.from('agents').update(updates).eq('id', id);
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'El codigo ya existe' });
    throw error;
  }
  res.json({ id: Number(id), ...updates });
});

module.exports = router;
