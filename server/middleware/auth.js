function requireAdmin(req, res, next) {
  const pin = req.headers['x-admin-pin'];
  if (!pin || pin !== String(process.env.ADMIN_PIN || '1234')) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}

module.exports = { requireAdmin };
