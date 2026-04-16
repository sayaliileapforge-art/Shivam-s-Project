const express        = require('express');
const router         = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const ctrl           = require('../controllers/noticeController');

router.post('/',             authMiddleware, ctrl.createNotice);
router.get('/:schoolCode',                   ctrl.getNotices);

module.exports = router;
