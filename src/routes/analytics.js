const express = require('express');
const router  = express.Router();
const { getDb }                   = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/h3', authenticate, (req, res) => {
  const rows = getDb().prepare('SELECT * FROM analytics_h3 ORDER BY bus_count DESC').all();
  res.json(rows);
});

router.post('/h3/refresh', authenticate, authorize('admin'), (req, res) => {
  const db = getDb();

  const busCells  = db.prepare('SELECT h3_index, COUNT(*) as cnt FROM buses WHERE h3_index IS NOT NULL GROUP BY h3_index').all();
  const stopCells = db.prepare('SELECT h3_index, COUNT(*) as cnt FROM stops WHERE h3_index IS NOT NULL GROUP BY h3_index').all();

  const cellMap = {};
  busCells.forEach(r  => { cellMap[r.h3_index] = { bus_count: r.cnt, stop_count: 0 }; });
  stopCells.forEach(r => {
    if (cellMap[r.h3_index]) cellMap[r.h3_index].stop_count = r.cnt;
    else cellMap[r.h3_index] = { bus_count: 0, stop_count: r.cnt };
  });

  db.prepare('DELETE FROM analytics_h3').run();
  for (const [h3_index, { bus_count, stop_count }] of Object.entries(cellMap))
    db.prepare('INSERT INTO analytics_h3 (h3_index, bus_count, stop_count, last_update) VALUES (?,?,?,datetime(\'now\'))').run(h3_index, bus_count, stop_count);

  res.json({ message: 'Аналитика обновлена', cells: Object.keys(cellMap).length });
});

module.exports = router;