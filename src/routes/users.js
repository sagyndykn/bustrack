const express = require('express');
const bcrypt  = require('bcryptjs');
const router  = express.Router();

const { getDb } = require('../db/database');
const { authenticate, authorize, auditLog } = require('../middleware/auth');
const { ROLES } = require('../../config');

router.get('/', authenticate, authorize('admin'), (req, res) => {
  res.json(getDb().prepare('SELECT id,username,role,full_name,is_active FROM users').all());
});

router.post('/', authenticate, authorize('admin'), (req, res) => {
  const { username, password, role, full_name } = req.body;
  const db = getDb();

  if (!username || !password || !role)
    return res.status(400).json({ error: 'username, password, role — обязательны' });

  if (!ROLES.includes(role))
    return res.status(400).json({ error: `role должна быть: ${ROLES.join(' или ')}` });

  if (db.prepare('SELECT id FROM users WHERE username=?').get(username))
    return res.status(400).json({ error: 'Пользователь уже существует' });

  const r = db
    .prepare('INSERT INTO users (username,password,role,full_name) VALUES (?,?,?,?)')
    .run(username, bcrypt.hashSync(password, 10), role, full_name || '');

  auditLog(req.user.username, 'CREATE_USER', 'users', `username=${username},role=${role}`, req.ip);
  res.status(201).json({ id: r.lastInsertRowid, username, role, full_name });
});

router.delete('/:id', authenticate, authorize('admin'), (req, res) => {
  getDb().prepare('UPDATE users SET is_active=0 WHERE id=?').run(req.params.id);
  auditLog(req.user.username, 'DEACTIVATE_USER', 'users', `id=${req.params.id}`, req.ip);
  res.json({ message: 'Пользователь деактивирован' });
});

module.exports = router;
