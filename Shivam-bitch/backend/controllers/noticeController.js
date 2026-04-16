const Notice = require('../models/Notice');

// POST /api/notices  — requires auth
exports.createNotice = async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required.' });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ error: 'Description is required.' });
    }

    const notice = await Notice.create({
      title:       title.trim(),
      description: description.trim(),
      schoolCode:  req.user.schoolCode,
      createdBy:   req.user.id,
      creatorName: req.user.name || '',
      role:        req.user.role || '',
    });

    return res.status(201).json(notice);
  } catch (err) {
    console.error('[noticeController] createNotice error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
};

// GET /api/notices/:schoolCode  — public (all roles)
exports.getNotices = async (req, res) => {
  try {
    const { schoolCode } = req.params;
    if (!schoolCode) {
      return res.status(400).json({ error: 'schoolCode is required.' });
    }
    const notices = await Notice.find({ schoolCode })
      .sort({ createdAt: -1 })
      .lean();
    return res.json(notices);
  } catch (err) {
    console.error('[noticeController] getNotices error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
};
