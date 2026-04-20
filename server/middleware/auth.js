const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-inseguro';

function requireAdmin(req, res, next) {
  const header = req.headers['authorization'];
  const token = header && header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autorizado' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'admin') return res.status(401).json({ error: 'No autorizado' });
    next();
  } catch {
    res.status(401).json({ error: 'Sesión expirada. Iniciá sesión nuevamente.' });
  }
}

module.exports = { requireAdmin };
