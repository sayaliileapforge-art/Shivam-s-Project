const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const vendorRoutes      = require('./routes/vendorRoutes');
const principalRoutes   = require('./routes/principalRoutes');
const formRoutes        = require('./routes/formRoutes');
const authRoutes        = require('./routes/authRoutes');
const noticeRoutes      = require('./routes/noticeRoutes');
const quickPhotoRoutes  = require('./routes/quickPhotoRoutes');
const projectRoutes     = require('./routes/projectRoutes');
const User              = require('./models/User');

const app = express();

// Trust Nginx reverse proxy (fixes IP, protocol headers)
app.set('trust proxy', true);

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logger (logs method, path, IP, and final response status)
app.use((req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress;
  const start = Date.now();
  res.on('finish', () => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - start}ms) — IP: ${ip}`);
  });
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/vendor', vendorRoutes);
app.use('/api/principal', principalRoutes);
app.use('/api/form', formRoutes);
app.use('/api/notices', noticeRoutes);
app.use('/api/upload', quickPhotoRoutes);
app.use('/api/projects', projectRoutes);
console.log('[Server] ✅ Project routes registered at /api/projects');
// Serve vendor-uploaded files (public/uploads/) at /uploads — takes priority
// so the new unified upload-files endpoint URLs are always reachable.
const publicUploadsDir = path.join(__dirname, 'public', 'uploads');
if (!require('fs').existsSync(publicUploadsDir)) require('fs').mkdirSync(publicUploadsDir, { recursive: true });
app.use('/uploads', express.static(publicUploadsDir));
// Also serve legacy uploads dirs (order-files, order-images, quick-photos …)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// Explicit static route for order images (ensures order-images subdir is always served)
app.use('/uploads/order-images', express.static(path.join(__dirname, 'uploads', 'order-images')));
// Keep /public/uploads route for backwards-compat (old product image URLs)
app.use('/public/uploads', express.static(publicUploadsDir));
// Also serve the Enterprise Portal's uploads folder so flutter can load product
// images even when the EP backend (port 5000) is not running.
const epUploadsDir = path.join(__dirname, '..', 'Enterprise SaaS Admin Portal (2)', 'Enterprise SaaS Admin Portal', 'backend', 'uploads');
if (require('fs').existsSync(epUploadsDir)) {
  app.use('/uploads', express.static(epUploadsDir));
  console.log('[Server] ✅ Proxying EP product images from', epUploadsDir);
} else {
  console.warn('[Server] ⚠️  EP uploads directory not found at', epUploadsDir);
}
console.log('[Server] ✅ Form routes registered at /api/form');
console.log('[Server] ✅ Quick-photo upload routes registered at /api/upload');

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'Edumid API is running.' });
});

// GET /api/clients — all clients (no vendorId filter so the dropdown always shows every school)
const Client = require('./models/Client');
app.get('/api/clients', async (req, res) => {
  try {
    const clients = await Client.find({}, '_id schoolName').lean();
    res.json(clients.map(c => ({
      _id: c._id,
      name: c.schoolName,
    })));
  } catch (err) {
    console.error('[/api/clients] error:', err.message);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error.' });
});

// Connect to MongoDB and start server
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('FATAL: MONGO_URI is not defined. Create a .env file in the backend root with MONGO_URI=<your_connection_string>');
  process.exit(1);
}

mongoose.connection.on('error', err => {
  console.error('[MongoDB] connection error:', err.message);
});

mongoose
  .connect(MONGO_URI)
  .then(async () => {
    // Drop legacy stale indexes that are no longer in the schema.
    // This handles the case where a previous schema had unique email/username
    // fields that left orphan indexes in the collection.
    try {
      await User.collection.dropIndex('email_1');
      console.log('[Server] Dropped legacy email_1 index');
    } catch (_) {
      // Index doesn't exist – nothing to do.
    }
    try {
      await User.collection.dropIndex('username_1');
      console.log('[Server] Dropped legacy username_1 index');
    } catch (_) {
      // Index doesn't exist – nothing to do.
    }
    try {
      await User.collection.dropIndex('schoolCode_1');
      console.log('[Server] Dropped legacy schoolCode_1 index');
    } catch (_) {
      // Index doesn't exist – nothing to do.
    }

    await User.syncIndexes();
    console.log('[Server] User indexes synced');
    console.log('MongoDB Connected');
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });
