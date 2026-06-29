const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
dns.setDefaultResultOrder('ipv4first');

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const { mongoUri, clientUrl } = require('./config');

const authRoutes = require('./routes/auth');
const examRoutes = require('./routes/exams');
const sessionRoutes = require('./routes/sessions');
const monitoringRoutes = require('./routes/monitoring');

let mongoConnectionPromise;

function connectDatabase() {
  if (mongoose.connection.readyState === 1) {
    return Promise.resolve(mongoose.connection);
  }

  if (!mongoConnectionPromise) {
    mongoConnectionPromise = mongoose.connect(mongoUri).catch((err) => {
      mongoConnectionPromise = null;
      throw err;
    });
  }

  return mongoConnectionPromise;
}

const app = express();

app.use(
  cors({
    origin: [clientUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));

app.use(async (_req, res, next) => {
  try {
    await connectDatabase();
    next();
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    res.status(503).json({ message: 'Database unavailable' });
  }
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/monitoring', monitoringRoutes);

app.use(express.static(path.join(__dirname, '../../client/dist')));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

module.exports = { app, connectDatabase };
