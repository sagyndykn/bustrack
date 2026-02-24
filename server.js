const express = require('express');
const cors    = require('cors');
const path    = require('path');

const { PORT }       = require('./config');
const { initDatabase } = require('./src/db/database');

// Роуты
const authRoutes  = require('./src/routes/auth');
const userRoutes  = require('./src/routes/users');
const busRoutes   = require('./src/routes/buses');
const stopRoutes  = require('./src/routes/stops');
const auditRoutes = require('./src/routes/audit');
const analyticsRouter = require('./src/routes/analytics');


const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

// API-маршруты
app.use('/api/auth',  authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/buses', busRoutes);
app.use('/api/stops', stopRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/analytics', analyticsRouter);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Запуск
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`\n BusTrack запущен → http://localhost:${PORT}`);
  });
});
