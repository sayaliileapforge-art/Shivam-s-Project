const express = require('express');
const router  = express.Router();

const {
  getVendorDashboard,
  getVendorOrders,
  getOrderById,
  getVendorClients,
  getVendorClientById,
  getClientOrders,
  getClientSchoolSummary,
  getSchoolClasses,
  getSchoolMembers,
  createOrder,
  createClient,
  updateClient,
  deleteClient,
  advanceOrderStage,
  uploadOrderFiles,
  uploadOrderFilesMiddleware,
  uploadExcel,
  uploadExcelMiddleware,
  getProducts,
  uploadProductImages,
  uploadProductImagesMiddleware,
  uploadSchoolPhotos,
  uploadSchoolPhotosMiddleware,
  getSchoolPhotos,
  deleteSchoolPhoto,
} = require('../controllers/vendorController');

// GET /api/vendor/products  – shared product catalogue (created via Admin Portal)
router.get('/products', getProducts);

// POST /api/vendor/upload-product-image  – upload product images to VPS, returns permanent URLs
router.post('/upload-product-image', uploadProductImagesMiddleware, uploadProductImages);

// GET  /api/vendor/dashboard?vendorId=<id>
router.get('/dashboard', getVendorDashboard);

// GET  /api/vendor/orders?vendorId=<id>
router.get('/orders', getVendorOrders);

// GET  /api/vendor/orders/:id
router.get('/orders/:id', getOrderById);

// POST /api/vendor/orders
router.post('/orders', createOrder);

// GET  /api/vendor/clients?vendorId=<id>
router.get('/clients', getVendorClients);

// POST /api/vendor/clients
router.post('/clients', createClient);

// GET  /api/vendor/clients/:id
router.get('/clients/:id', getVendorClientById);

// PATCH /api/vendor/clients/:id
router.patch('/clients/:id', updateClient);

// GET  /api/vendor/clients/:id/school-summary
router.get('/clients/:id/school-summary', getClientSchoolSummary);

// GET  /api/vendor/clients/:id/school-classes
router.get('/clients/:id/school-classes', getSchoolClasses);

// GET  /api/vendor/clients/:id/school-members?type=student|teacher|staff
router.get('/clients/:id/school-members', getSchoolMembers);

// GET  /api/vendor/clients/:id/orders
router.get('/clients/:id/orders', getClientOrders);

// DELETE /api/vendor/clients/:id
router.delete('/clients/:id', deleteClient);

// PATCH /api/vendor/orders/:id/advance  – move order to next stage
router.patch('/orders/:id/advance', advanceOrderStage);

// POST /api/vendor/orders/:id/files  – attach files to an existing order
router.post('/orders/:id/files', uploadOrderFilesMiddleware, uploadOrderFiles);

// POST /api/vendor/upload-excel  – parse Excel and auto-ingest classes/students/teachers
router.post('/upload-excel', uploadExcelMiddleware, uploadExcel);

// ── School Photos ──────────────────────────────────────────────────
// POST /api/vendor/school-photos  – upload photos (multipart: schoolId, className, date, photos[])
router.post('/school-photos', uploadSchoolPhotosMiddleware, uploadSchoolPhotos);

// GET /api/vendor/school-photos/:schoolId  – all photos for a school (grouped by date/class)
router.get('/school-photos/:schoolId', getSchoolPhotos);

// DELETE /api/vendor/school-photos/:photoId  – remove a single photo
router.delete('/school-photos/:photoId', deleteSchoolPhoto);

// GET /api/vendor/debug/school?clientId=<id>  – diagnostic counts
const { debugSchoolData, getVendorSchools } = require('../controllers/vendorController');
router.get('/debug/school', debugSchoolData);

// GET /api/vendor/schools?vendorId=<id>&search=<query>  – school selector for Quick Capture
router.get('/schools', getVendorSchools);

module.exports = router;
