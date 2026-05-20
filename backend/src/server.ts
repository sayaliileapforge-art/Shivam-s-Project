import 'dotenv/config';
import express from 'express';
import compression from 'compression';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { connectDB } from './config/database';
import ProductTemplate from './models/ProductTemplate';
import TemplateGalleryMeta from './models/TemplateGalleryMeta';
import { hasPostgresConfig, initAuthSchema, testAuthDbConnection } from './config/postgres';
import projectRoutes from './routes/projects';
import clientRoutes from './routes/clients';
import productRoutes from './routes/products';
import templateRoutes, { warmGalleryCache } from './routes/templates';
import orderRoutes from './routes/orders';
import authRoutes from './routes/auth';
import previewRoutes from './routes/preview';
import uploadImagesRoute from './routes/uploads';
import realtimeRoutes from './routes/realtime';
import rulesRoutes from './routes/rules';
import importsRoutes from './routes/imports';
import { bullBoardRouter } from './queues/bullBoard';
// Start the BullMQ worker in-process (runs concurrently alongside Express).
// For independent horizontal scaling, move this import to a separate entry
// point (e.g. backend/src/worker.ts) and run it as its own process/container.
import './workers/bulkImportWorker';

const app = express();
const PORT = process.env.PORT || 5000;

app.set('trust proxy', 1);

const backendRootDir = path.resolve(__dirname, '..');
const repoRootDir = path.resolve(backendRootDir, '..');

function parseCsvOrigins(value?: string): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const allowedOrigins = new Set([
  ...parseCsvOrigins(process.env.CORS_ORIGIN),
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL.trim()] : []),
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
]);

// Middleware
app.use(compression());
const apiCorsMiddleware = cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
});
app.use('/api', apiCorsMiddleware);
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Serve uploads from backend/public/uploads/ â€” consistent with uploads route.
// UPLOADS_DIR env var lets VPS deployments point to a persistent directory that
// survives redeploys and container restarts (e.g. /var/data/uploads or a mounted volume).
const uploadsDir = process.env.UPLOADS_DIR?.trim()
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(backendRootDir, 'public', 'uploads');

// Auto-create the uploads root and required subdirectories.
// These directories must exist before multer or fs.promises.writeFile is called.
const uploadSubdirs = ['templates', 'assets'];
for (const subdir of [uploadsDir, ...uploadSubdirs.map((s) => path.join(uploadsDir, s))]) {
  if (!fs.existsSync(subdir)) {
    fs.mkdirSync(subdir, { recursive: true });
    console.log(`[server] Uploads directory created: ${subdir}`);
  }
}
console.log(`[server] Uploads root: ${uploadsDir}`);

// CORS middleware for static asset routes.
// Required so Fabric.js (canvas) can load images from /uploads and /images
// without tainting the canvas (which would break toPNG() preview generation).
function staticCors(_req: express.Request, res: express.Response, next: express.NextFunction) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}

app.use('/uploads', staticCors, express.static(uploadsDir));
app.use('/images', staticCors, express.static(uploadsDir));

// Also serve backend/uploads/ (legacy path used by the products route via process.cwd()/uploads).
// This ensures product thumbnails saved there are still accessible at /uploads/products/...
const legacyUploadsDir = path.resolve(backendRootDir, 'uploads');
if (fs.existsSync(legacyUploadsDir)) {
  app.use('/uploads', staticCors, express.static(legacyUploadsDir));
}

const isRenderEnvironment = process.env.RENDER === 'true' || Boolean(process.env.RENDER_SERVICE_ID);
const studentPhotosDir = process.env.STUDENT_PHOTOS_DIR?.trim()
  || (process.env.NODE_ENV !== 'production' && !isRenderEnvironment ? 'C:/Users/Sayali/OneDrive/Sem-V/Photos' : '');
// Fallback lookup: if a file is not found in backend/uploads, also try student photos.
if (studentPhotosDir) {
  const resolvedStudentDir = path.resolve(studentPhotosDir);
  if (fs.existsSync(resolvedStudentDir)) {
    app.use('/uploads', express.static(resolvedStudentDir));
    app.use('/student-photos', express.static(resolvedStudentDir));
  } else {
    console.warn(`Student photos directory not found (skipped): ${resolvedStudentDir}`);
  }
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/projects', projectRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/products', productRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/preview', previewRoutes);
app.use('/api/upload-images', uploadImagesRoute);
app.use('/api/realtime', realtimeRoutes);
app.use('/api/rules', rulesRoutes);
app.use('/api/imports', importsRoutes);

// Bull Board queue monitoring dashboard â€” http://localhost:5000/admin/queues
// âš ï¸  Protect with auth middleware in production.
app.use('/admin/queues', bullBoardRouter);

// API 404 handler
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, error: 'API route not found' });
});

const frontendDistDir = path.resolve(repoRootDir, 'dist');
const frontendIndexPath = path.resolve(frontendDistDir, 'index.html');
if (fs.existsSync(frontendIndexPath)) {
  // In one-service deployment, serve the Vite build from Express.
  app.use(express.static(frontendDistDir));
  app.get(/^\/(?!api\/|uploads\/|student-photos\/|health$).*/, (req, res) => {
    res.sendFile(frontendIndexPath);
  });
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ success: false, error: err.message || 'Internal server error' });
});

// Start server
async function startServer() {
  try {
    await connectDB();

    // Build indexes before accepting traffic. With autoIndex:false in database.ts the
    // background index creation is disabled; we do it here so queries are never blocked
    // by an in-progress index build once app.listen() fires.
    // On Atlas M0 this can take up to 60 s on first run (when compound indexes don't yet
    // exist), but subsequent starts are instant (indexes already exist).
    try {
      await ProductTemplate.createIndexes();
      console.log('âœ“ ProductTemplate indexes ready');
    } catch (idxErr) {
      console.warn('! Index creation failed (non-fatal):', (idxErr as Error).message);
    }

    // --- AUTO SEED LOGIC: Insert default templates if none exist ---
    const templateCount = await ProductTemplate.countDocuments();
    console.log(`âœ“ ProductTemplate count: ${templateCount}`);
    if (templateCount === 0) {
      await ProductTemplate.insertMany([
        {
          productId: new (require('mongoose')).Types.ObjectId(),
          templateName: 'Default Template',
          category: 'Business',
          designData: {},
          isActive: true,
          tags: ['default'],
        }
      ]);
      console.log('âœ“ Seeded default ProductTemplate');
    }

    // --- MIGRATION: promote TRUE orphan templates (no owner at all) to isGlobal=true ---
    // Only templates with NEITHER productId NOR projectId are true gallery templates.
    // Templates with productId set are project-scoped (productId was used as project ref
    // in older code) and must NOT be promoted to global automatically.
    try {
      const promoted = await ProductTemplate.updateMany(
        { productId: null, projectId: null, isGlobal: { $ne: true } },
        { $set: { isGlobal: true } },
      );
      if (promoted.modifiedCount > 0) {
        console.log(`âœ“ Promoted ${promoted.modifiedCount} orphan template(s) to isGlobal=true`);
      }
    } catch (migErr) {
      console.warn('! Could not promote orphan templates to global (non-fatal):', (migErr as Error).message);
    }

    // Kick off gallery cache warmup in the background â€” it runs the slow Atlas document
    // read after the server is already accepting traffic (non-blocking startup).
    // The first gallery request may still be slow if it arrives before the warmup finishes,
    // but the amber-banner + auto-retry in the frontend handles that gracefully.
    // Guard: on rare cold-start tsx/esbuild runs the named export may not yet be resolved.
    setImmediate(() => {
      if (typeof warmGalleryCache === 'function') {
        warmGalleryCache().catch(() => {});
      } else {
        console.warn('! warmGalleryCache not yet available â€” gallery cache will be warmed on next request.');
      }
    });

    // --- MIGRATION: populate TemplateGalleryMeta from existing ProductTemplates ---
    // TemplateGalleryMeta is a lean mirror (no designData) that allows instant gallery reads
    // even on Atlas M0 cold storage. Run non-blocking so startup is not delayed.
    setImmediate(async () => {
      try {
        const totalTemplates = await ProductTemplate.countDocuments();
        const existingMetaCount = await TemplateGalleryMeta.countDocuments();
        if (existingMetaCount >= totalTemplates) {
          console.log(`âœ“ TemplateGalleryMeta already populated (${existingMetaCount} records)`);
          return;
        }
        console.log(`[migration] Populating TemplateGalleryMeta (${existingMetaCount}/${totalTemplates} done)...`);
        // Use batchSize(1) cursor: Atlas M0 returns each doc as it's read from cold storage
        // instead of blocking until all docs are loaded.
        const cursor = (ProductTemplate as any).collection.find(
          {},
          { projection: { designData: 0 } }
        ).batchSize(1);
        let upserted = 0;
        for await (const t of cursor) {
          try {
            await TemplateGalleryMeta.findOneAndUpdate(
              { templateId: t._id },
              {
                templateId: t._id,
                productId: t.productId,
                projectId: t.projectId != null ? String(t.projectId) : undefined,
                templateName: t.templateName,
                description: t.description,
                category: t.category,
                previewImageUrl: t.previewImageUrl,
                preview_image: t.preview_image,
                designFileUrl: t.designFileUrl,
                isGlobal: t.isGlobal ?? false,
                isActive: t.isActive ?? true,
                tags: t.tags,
              },
              { upsert: true, new: false }
            );
            upserted++;
            console.log(`[migration] âœ“ [${upserted}/${totalTemplates}] ${t.templateName}`);
          } catch (docErr) {
            console.warn(`[migration] âœ— ${t.templateName}: ${(docErr as Error).message}`);
          }
        }
        console.log(`âœ“ TemplateGalleryMeta migration done: ${upserted}/${totalTemplates} upserted`);
      } catch (migErr) {
        console.warn('! TemplateGalleryMeta migration failed (non-fatal):', (migErr as Error).message);
      }
    });
    if (hasPostgresConfig()) {
      await testAuthDbConnection();
      await initAuthSchema();
    } else {
      console.warn('! PostgreSQL auth config not found. Auth endpoints require PostgreSQL configuration.');
    }
    app.listen(PORT, () => {
      console.log(`\nâœ“ Backend server running on http://localhost:${PORT}`);
      if (hasPostgresConfig()) {
        console.log('âœ“ PostgreSQL auth database connected successfully');
      }
      console.log(`âœ“ Serving uploads from: ${uploadsDir}`);
      console.log(`âœ“ Serving images from: ${uploadsDir}`);
      if (fs.existsSync(frontendIndexPath)) {
        console.log(`âœ“ Serving frontend build from: ${frontendDistDir}`);
      }
      if (studentPhotosDir && fs.existsSync(path.resolve(studentPhotosDir))) {
        console.log(`âœ“ Uploads fallback from student photos: ${path.resolve(studentPhotosDir)}`);
      }
      console.log(`âœ“ Uploads URL base: http://localhost:${PORT}/uploads/`);
      console.log(`âœ“ API endpoints:\n  - GET /health\n  - /api/projects\n  - /api/clients\n  - /api/products\n  - /api/templates\n  - /api/orders\n  - /api/auth\n  - /api/preview\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
