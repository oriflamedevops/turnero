require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express  = require('express');
const path     = require('path');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const supabase = require('./db');

const JWT_SECRET  = process.env.JWT_SECRET  || 'dev-secret-inseguro';
const ADMIN_PASS  = process.env.ADMIN_PASSWORD || 'admin1234';

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/agents',  require('./routes/agents'));
app.use('/api/ratings', require('./routes/ratings'));
app.use('/api/reports', require('./routes/reports'));

// Login del admin — devuelve JWT
app.post('/api/auth/verify', (req, res) => {
  const { password } = req.body;
  if (!password || password !== ADMIN_PASS) {
    return res.status(401).json({ ok: false, error: 'Contraseña incorrecta' });
  }
  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ ok: true, token });
});

// Login de estación (agente) — devuelve JWT
app.post('/api/auth/station', async (req, res) => {
  const { agent_id, pin } = req.body;
  if (!agent_id || !pin) return res.status(400).json({ error: 'agent_id y contraseña requeridos' });

  const { data: agent } = await supabase
    .from('agents')
    .select('id, name, code, pin')
    .eq('id', agent_id)
    .eq('active', 1)
    .maybeSingle();

  if (!agent || !agent.pin) return res.status(401).json({ error: 'Agente no encontrado o sin contraseña asignada' });

  // Compatibilidad con PINs viejos en texto plano — los migra a bcrypt automáticamente
  let valid = false;
  if (agent.pin.startsWith('$2b$')) {
    valid = await bcrypt.compare(String(pin), agent.pin);
  } else {
    valid = String(pin) === String(agent.pin);
    if (valid) {
      const hashed = await bcrypt.hash(String(pin), 10);
      await supabase.from('agents').update({ pin: hashed }).eq('id', agent_id);
    }
  }

  if (!valid) return res.status(401).json({ error: 'Contraseña incorrecta' });

  const token = jwt.sign(
    { role: 'station', agent_id: agent.id, agent_name: agent.name, agent_code: agent.code },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
  res.json({ ok: true, agent: { id: agent.id, name: agent.name, code: agent.code }, token });
});

// Fallback SPA
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Manejador de errores global
app.use((err, req, res, next) => {
  console.error('─── ERROR ───────────────────────────────');
  console.error('Ruta:', req.method, req.path);
  console.error(JSON.stringify(err, null, 2));
  console.error('─────────────────────────────────────────');
  const message = err?.message || JSON.stringify(err);
  res.status(500).json({ error: message });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`\n✓ Turnero corriendo en http://localhost:${port}`);
    console.log(`  Estacion: http://localhost:${port}/station/`);
    console.log(`  Admin:    http://localhost:${port}/admin/\n`);
  });
}

module.exports = app;
