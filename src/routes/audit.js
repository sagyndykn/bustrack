const express = require('express');
const router  = express.Router();

const { getDb } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/', authenticate, authorize('admin'), (req, res) => {
  res.json(
    getDb().prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100').all()
  );
});

module.exports = router;
