const jwt = require('jsonwebtoken');
const { SECRET } = require('../../config');
const { getDb } = require('../db/database');

const createToken = (user) =>
  jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET, { expiresIn: '8h' });

const authenticate = (req, res, next) => {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer '))
    return res.status(401).json({ error: 'Токен не передан' });
  try {
    req.user = jwt.verify(h.slice(7), SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Токен недействителен или истёк' });
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    auditLog(req.user.username, 'ACCESS_DENIED', req.path, `role=${req.user.role}`, req.ip, false);
    return res.status(403).json({
      error: `Доступ запрещён. Нужна роль: ${roles.join(' или ')}. У вас: ${req.user.role}`,
    });
  }
  next();
};

const auditLog = (username, action, resource, details = '', ip = '', success = true) => {
  const now = new Date();
  now.setHours(now.getHours() + 5); // GMT+5
  const created_at = now.toISOString().replace('T', ' ').slice(0, 19);

  try {
    getDb()
      .prepare('INSERT INTO audit_logs (username,action,resource,details,ip,success,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(username || 'system', action, resource, details, ip, success ? 1 : 0, created_at);
  } catch {}
};

module.exports = { createToken, authenticate, authorize, auditLog };
