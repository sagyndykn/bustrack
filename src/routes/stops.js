const express = require('express');
const router  = express.Router();
const { latLngToCell, gridDisk, isValidCell } = require('h3-js');

const { getDb }                          = require('../db/database');
const { authenticate, authorize, auditLog } = require('../middleware/auth');

router.get('/', authenticate, (req, res) => {
  res.json(getDb().prepare('SELECT * FROM stops').all());
});

router.post('/', authenticate, authorize('admin'), (req, res) => {
  const { name, address, latitude, longitude } = req.body;
  const db = getDb();

  if (!name || !latitude || !longitude)
    return res.status(400).json({ error: 'name, latitude, longitude — обязательны' });

  const h3_index = latLngToCell(Number(latitude), Number(longitude), 9);
  const r = db
    .prepare('INSERT INTO stops (name,address,latitude,longitude,h3_index) VALUES (?,?,?,?,?)')
    .run(name, address || '', latitude, longitude, h3_index);

  auditLog(req.user.username, 'CREATE_STOP', 'stops', `name=${name}`, req.ip);
  res.status(201).json({ id: r.lastInsertRowid, name, latitude, longitude, h3_index });
});

router.delete('/:id', authenticate, authorize('admin'), (req, res) => {
  const db   = getDb();
  const stop = db.prepare('SELECT * FROM stops WHERE id=?').get(req.params.id);

  if (!stop)
    return res.status(404).json({ error: 'Остановка не найдена' });

  db.prepare('DELETE FROM stops WHERE id=?').run(req.params.id);
  auditLog(req.user.username, 'DELETE_STOP', 'stops', `id=${req.params.id},name=${stop.name}`, req.ip);
  res.json({ message: 'Остановка удалена' });
});

router.get('/:id/nearby-buses', authenticate, (req, res) => {
  const db   = getDb();
  const stop = db.prepare('SELECT * FROM stops WHERE id=?').get(req.params.id);

  if (!stop)
    return res.status(404).json({ error: 'Остановка не найдена' });

  if (!stop.h3_index || !isValidCell(stop.h3_index))
    return res.status(400).json({ error: 'У остановки нет H3 индекса' });

  const rings = parseInt(req.query.rings) || 2;
  const cells = gridDisk(stop.h3_index, rings);
  const buses = db
    .prepare(`SELECT * FROM buses WHERE h3_index IN (${cells.map(() => '?').join(',')})`)
    .all(...cells);

  res.json({
    stop:         { id: stop.id, name: stop.name, h3_index: stop.h3_index },
    cells_searched: cells.length,
    nearby_buses: buses,
  });
});

module.exports = router;
