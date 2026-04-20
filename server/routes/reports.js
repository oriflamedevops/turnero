const express = require('express');
const supabase = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAdmin);

// GET /api/reports/summary
router.get('/summary', async (req, res) => {
  const { from, to } = req.query;
  const { data, error } = await supabase.rpc('fn_reports_summary', {
    p_from: from || null,
    p_to:   to   || null
  });
  if (error) throw error;
  res.json(data);
});

// GET /api/reports/distribution
router.get('/distribution', async (req, res) => {
  const { agent_id, from, to } = req.query;
  const { data, error } = await supabase.rpc('fn_reports_distribution', {
    p_agent_id: agent_id ? parseInt(agent_id) : null,
    p_from:     from || null,
    p_to:       to   || null
  });
  if (error) throw error;
  res.json(data);
});

// GET /api/reports/trend
router.get('/trend', async (req, res) => {
  const { agent_id, granularity = 'day', from, to } = req.query;
  if (!['day', 'week', 'month'].includes(granularity)) {
    return res.status(400).json({ error: 'granularity debe ser day, week o month' });
  }
  const { data, error } = await supabase.rpc('fn_reports_trend', {
    p_agent_id:    agent_id ? parseInt(agent_id) : null,
    p_granularity: granularity,
    p_from:        from || null,
    p_to:          to   || null
  });
  if (error) throw error;
  res.json(data || []);
});

// GET /api/reports/export — CSV
router.get('/export', async (req, res) => {
  const { from, to, agent_id } = req.query;
  const { data, error } = await supabase.rpc('fn_reports_export', {
    p_agent_id: agent_id ? parseInt(agent_id) : null,
    p_from:     from || null,
    p_to:       to   || null
  });
  if (error) throw error;

  const rows = data || [];
  const headers = ['id', 'agente_codigo', 'agente_nombre', 'calificacion', 'comentario', 'fecha'];
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => {
      const val = r[h] === null || r[h] === undefined ? '' : String(r[h]);
      return val.includes(',') || val.includes('"') || val.includes('\n')
        ? `"${val.replace(/"/g, '""')}"` : val;
    }).join(','))
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="calificaciones_${new Date().toISOString().slice(0,10)}.csv"`);
  res.send('\uFEFF' + csv);
});

module.exports = router;
