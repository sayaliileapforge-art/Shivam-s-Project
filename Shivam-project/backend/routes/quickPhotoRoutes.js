const express = require('express');
const router  = express.Router();

const authMiddleware = require('../middleware/authMiddleware');
const ctrl           = require('../controllers/quickPhotoController');
const uploadCtrl     = require('../controllers/uploadController');

// POST /api/upload/quick-photo — vendor uploads one photo (auth required)
router.post(
  '/quick-photo',
  authMiddleware,
  ctrl.uploadMiddleware,
  ctrl.uploadQuickPhoto,
);

// GET /api/upload/quick-photos?schoolCode=X&className=Y (auth required)
router.get('/quick-photos', authMiddleware, ctrl.getQuickPhotos);

// POST /api/upload/image — generic single image upload (auth required)
router.post(
  '/image',
  authMiddleware,
  uploadCtrl.uploadSingleMiddleware,
  uploadCtrl.uploadImage,
);

// POST /api/upload/images — bulk image upload up to 50 (auth required)
router.post(
  '/images',
  authMiddleware,
  uploadCtrl.uploadMultipleMiddleware,
  uploadCtrl.uploadImages,
);

module.exports = router;
