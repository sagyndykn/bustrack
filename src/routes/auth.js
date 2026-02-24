const express = require('express');
const bcrypt  = require('bcryptjs');
const router  = express.Router();

const { getDb } = require('../db/database');
const { createToken, authenticate, auditLog } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const db   = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username=? AND is_active=1').get(username);

  if (!user || !bcrypt.compareSync(password, user.password)) {
    auditLog(username, 'LOGIN_FAILED', 'auth', '', req.ip, false);
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }

  auditLog(username, 'LOGIN_SUCCESS', 'auth', `role=${user.role}`, req.ip);
  res.json({
    token:     createToken(user),
    username:  user.username,
    role:      user.role,
    full_name: user.full_name,
  });
});

router.get('/me', authenticate, (req, res) => {
  const user = getDb()
    .prepare('SELECT id,username,role,full_name FROM users WHERE id=?')
    .get(req.user.id);
  res.json(user);
});

module.exports = router;
