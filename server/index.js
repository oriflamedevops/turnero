require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const path = require('path');
const supabase = require('./db');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api/agents',  require('./routes/agents'));
app.use('/api/ratings', require('./routes/ratings'));
app.use('/api/reports', require('./routes/reports'));

// Verificar PIN (para login del admin)
app.post('/api/auth/verify', (req, res) => {
  const { pin } = req.body;
  if (String(pin) === String(process.env.ADMIN_PIN || '1234')) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ ok: false, error: 'PIN incorrecto' });
  }
});

// Login de estación (agente)
app.post('/api/auth/station', async (req, res) => {
  const { agent_id, pin } = req.body;
  if (!agent_id || !pin) return res.status(400).json({ error: 'agent_id y pin requeridos' });

  const { data: agent } = await supabase
    .from('agents')
    .select('id, name, code, pin')
    .eq('id', agent_id)
    .eq('active', 1)
    .maybeSingle();

  if (!agent || !agent.pin) return res.status(401).json({ error: 'Agente no encontrado o sin PIN asignado' });
  if (String(pin) !== String(agent.pin)) return res.status(401).json({ error: 'PIN incorrecto' });
  res.json({ ok: true, agent: { id: agent.id, name: agent.name, code: agent.code } });
});

// Fallback: servir index.html para rutas del cliente
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Manejador de errores global
app.use((err, req, res, next) => {
  console.error('─── ERROR ───────────────────────────────');
  console.error('Ruta:', req.method, req.path);
  console.error(JSON.stringify(err, null, 2));
  console.error('─────────────────────────────────────────');
  const message = err?.message || err?.error_description || JSON.stringify(err);
  res.status(500).json({ error: message });
});

// Iniciar servidor (local) o exportar para Vercel
if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`\n✓ Turnero corriendo en http://localhost:${port}`);
    console.log(`  Estacion: http://localhost:${port}/station/`);
    console.log(`  Admin:    http://localhost:${port}/admin/`);
    if (String(process.env.ADMIN_PIN || '1234') === '1234') {
      console.warn('\n  ⚠ ADVERTENCIA: El PIN de administrador sigue siendo el valor por defecto (1234).');
      console.warn('  Cambia ADMIN_PIN en .env antes de poner en producción.\n');
    }
  });
}

module.exports = app;
