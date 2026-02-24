const express = require('express');
const router  = express.Router();
const { latLngToCell } = require('h3-js');

const { getDb }                              = require('../db/database');
const { authenticate, authorize, auditLog }  = require('../middleware/auth');

router.get('/', authenticate, (req, res) => {
  res.json(getDb().prepare('SELECT * FROM buses').all());
});

router.post('/', authenticate, authorize('admin'), (req, res) => {
  const { plate_number, model, capacity, latitude, longitude, status } = req.body;
  const db = getDb();

  if (!plate_number)
    return res.status(400).json({ error: 'plate_number обязателен' });

  if (db.prepare('SELECT id FROM buses WHERE plate_number=?').get(plate_number))
    return res.status(400).json({ error: 'Автобус с таким номером уже существует' });

  let h3_index = null;
  if (latitude != null && longitude != null) {
    h3_index = latLngToCell(Number(latitude), Number(longitude), 9);
  }

  const finalStatus = status || (latitude != null && longitude != null ? 'on_route' : 'idle');

  const r = db
    .prepare('INSERT INTO buses (plate_number, model, capacity, latitude, longitude, h3_index, status) VALUES (?,?,?,?,?,?,?)')
    .run(plate_number, model || '', capacity || 50, latitude ?? null, longitude ?? null, h3_index, finalStatus);

  auditLog(req.user.username, 'CREATE_BUS', 'buses', `plate=${plate_number},status=${finalStatus}`, req.ip);
  res.status(201).json({ id: r.lastInsertRowid, plate_number, model, capacity, latitude, longitude, h3_index, status: finalStatus });
});

router.delete('/:id', authenticate, authorize('admin'), (req, res) => {
  const db  = getDb();
  const bus = db.prepare('SELECT * FROM buses WHERE id=?').get(req.params.id);

  if (!bus)
    return res.status(404).json({ error: 'Автобус не найден' });

  db.prepare('DELETE FROM buses WHERE id=?').run(req.params.id);
  auditLog(req.user.username, 'DELETE_BUS', 'buses', `id=${req.params.id},plate=${bus.plate_number}`, req.ip);
  res.json({ message: 'Автобус удалён' });
});

module.exports = router;