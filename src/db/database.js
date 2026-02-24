const fs = require('fs');
const bcrypt = require('bcryptjs');
const initSqlJs = require('sql.js');
const { DB_PATH } = require('../../config');

let db;

function getDb() {
  return db;
}

function wrapDb(sqlDb) {
  const save = () => fs.writeFileSync(DB_PATH, Buffer.from(sqlDb.export()));

  const run = (sql, p = []) => {
    const flat =
      p.length === 1 && p[0] !== null && typeof p[0] === 'object' && !Array.isArray(p[0])
        ? Object.values(p[0])
        : p;
    return sqlDb.exec(sql, flat.length ? flat : undefined);
  };

  return {
    prepare: (sql) => ({
      run: (...p) => {
        run(sql, p);
        const id = sqlDb.exec('SELECT last_insert_rowid()')[0]?.values[0][0] || 0;
        save();
        return { lastInsertRowid: id };
      },
      get: (...p) => {
        const r = run(sql, p);
        if (!r.length || !r[0].values.length) return undefined;
        return Object.fromEntries(r[0].columns.map((c, i) => [c, r[0].values[0][i]]));
      },
      all: (...p) => {
        const r = run(sql, p);
        if (!r.length) return [];
        return r[0].values.map((row) =>
          Object.fromEntries(r[0].columns.map((c, i) => [c, row[i]]))
        );
      },
    }),
    exec: (sql) => { sqlDb.run(sql); save(); },
  };
}

async function initDatabase() {
  const SQL   = await initSqlJs();
  const sqlDb = fs.existsSync(DB_PATH)
    ? new SQL.Database(fs.readFileSync(DB_PATH))
    : new SQL.Database();

  db = wrapDb(sqlDb);

  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS users (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      username  TEXT UNIQUE NOT NULL,
      password  TEXT NOT NULL,
      role      TEXT NOT NULL CHECK(role IN ('admin','user')),
      full_name TEXT,
      is_active INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS buses (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      plate_number TEXT UNIQUE NOT NULL,
      model        TEXT,
      capacity     INTEGER DEFAULT 50,
      latitude     REAL,
      longitude    REAL,
      h3_index     TEXT,
      status       TEXT DEFAULT 'idle'
    );
    CREATE TABLE IF NOT EXISTS stops (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT NOT NULL,
      address   TEXT,
      latitude  REAL NOT NULL,
      longitude REAL NOT NULL,
      h3_index  TEXT
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      username   TEXT,
      action     TEXT NOT NULL,
      resource   TEXT,
      details    TEXT,
      ip         TEXT,
      success    INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS analytics_h3 (
      h3_index    TEXT PRIMARY KEY,
      bus_count   INTEGER DEFAULT 0,
      stop_count  INTEGER DEFAULT 0,
      last_update TEXT DEFAULT (datetime('now'))
    );
  `);
  fs.writeFileSync(DB_PATH, Buffer.from(sqlDb.export()));

  if ((db.prepare('SELECT COUNT(*) as c FROM users').get()?.c || 0) > 0) {
    return;
  }

  const users = [
    ['admin', bcrypt.hashSync('admin123', 10), 'admin', 'Администратор'],
    ['user1', bcrypt.hashSync('user123',  10), 'user',  'Nurmuhammed'],
  ];
  for (const [u, p, r, f] of users)
    db.prepare('INSERT INTO users (username,password,role,full_name) VALUES (?,?,?,?)').run(u, p, r, f);

  const buses = [
    ['010 ABC 01', 'Yutong ZK6180',   90, 43.2566, 76.9286, '892b59ac54bffff', 'on_route'],
    ['010 DEF 02', 'Mercedes Citaro', 80, 43.2614, 76.9455, '892b59ac553ffff', 'on_route'],
    ['010 GHI 03', 'MAN Lions City',  70, 43.2490, 76.9120, '892b59ac557ffff', 'on_route'],
    ['010 JKL 04', 'Volvo 7900',      60, 43.2700, 76.9600, '892b59ac4cbffff', 'idle'    ],
    ['010 MNO 05', 'Yutong ZK6118',  100, 43.2350, 76.8950, '892b59ac46bffff', 'on_route'],
  ];
  for (const [pl, mo, ca, la, ln, h3, st] of buses)
    db.prepare('INSERT INTO buses (plate_number,model,capacity,latitude,longitude,h3_index,status) VALUES (?,?,?,?,?,?,?)').run(pl, mo, ca, la, ln, h3, st);

  const stops = [
    ['Пл. Республики',    'пр. Достык, 1',       43.2566, 76.9286, '892b59ac54bffff'],
    ['Медеу',             'ул. Горная, 120',       43.1603, 77.0596, '892b59b2003ffff'],
    ['Алматы-1 (Вокзал)', 'ул. Сейфуллина, 521',  43.2614, 76.9455, '892b59ac553ffff'],
    ['КБТУ',              'ул. Толе би, 59',       43.2490, 76.9120, '892b59ac557ffff'],
    ['Аэропорт',          'пр. Суюнбая',           43.3521, 77.0407, '892b59ae057ffff'],
    ['Горбольница',       'ул. Байзакова, 215',    43.2470, 76.9430, '892b59ac553ffff'],
  ];
  for (const [n, a, la, ln, h3] of stops)
    db.prepare('INSERT INTO stops (name,address,latitude,longitude,h3_index) VALUES (?,?,?,?,?)').run(n, a, la, ln, h3);

  const busCells  = db.prepare('SELECT h3_index, COUNT(*) as cnt FROM buses WHERE h3_index IS NOT NULL GROUP BY h3_index').all();
  const stopCells = db.prepare('SELECT h3_index, COUNT(*) as cnt FROM stops WHERE h3_index IS NOT NULL GROUP BY h3_index').all();

  const cellMap = {};
  busCells.forEach(r  => { cellMap[r.h3_index] = { bus_count: r.cnt, stop_count: 0 }; });
  stopCells.forEach(r => {
    if (cellMap[r.h3_index]) cellMap[r.h3_index].stop_count = r.cnt;
    else cellMap[r.h3_index] = { bus_count: 0, stop_count: r.cnt };
  });

  for (const [h3_index, { bus_count, stop_count }] of Object.entries(cellMap))
    db.prepare('INSERT INTO analytics_h3 (h3_index, bus_count, stop_count) VALUES (?,?,?)').run(h3_index, bus_count, stop_count);
}

module.exports = { getDb, initDatabase };