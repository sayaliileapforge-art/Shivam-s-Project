const IdCardSubmission = require('../models/IdCardSubmission');

function toPlainAnswers(value) {
  if (!value) return {};
  // Mongoose Map on non-lean docs
  if (value instanceof Map) {
    return Object.fromEntries(value.entries());
  }
  // Array entries format
  if (Array.isArray(value)) {
    try {
      return Object.fromEntries(value);
    } catch (_) {
      return {};
    }
  }
  // Plain object (common with .lean() and legacy docs)
  if (typeof value === 'object') {
    return value;
  }
  return {};
}

// ── Fetch Form (for students/teachers) ───────────────────────────────────────

/**
 * GET /api/form
 * Fetch form by principalId (for students/teachers to fill)
 * Query: ?principalId=xxx
 */
exports.getForm = async (req, res) => {
  try {
    const { principalId } = req.query;
    console.log('[getForm] ► Fetching form for principalId:', principalId);
    
    if (!principalId) {
      console.log('[getForm] ❌ principalId missing');
      return res.status(400).json({ error: 'principalId required' });
    }

    const IdCardForm = require('../models/IdCardForm');
    const form = await IdCardForm.findOne({ principalId }).lean();
    
    if (!form) {
      console.log('[getForm] ℹ️  No form found');
      return res.json({
        id: null,
        principalId,
        formTitle: 'ID Card Form',
        formDescription: '',
        formFields: [],
        fields: [],
      });
    }

    // Ensure fields are in normalized shape and sorted
    const sortedFormFields = (form.formFields || [])
      .map((f, i) => ({
        label: f.label || f.fieldName || f.field_name || '',
        type: f.type || f.fieldType || 'text',
        required: typeof f.required === 'boolean' ? f.required : (typeof f.isRequired === 'boolean' ? f.isRequired : true),
        order: typeof f.order === 'number' ? f.order : i,
      }))
      .sort((a, b) => a.order - b.order);

    console.log('[getForm] ✅ Form fetched successfully. Fields:', sortedFormFields.length);
    return res.json({
      id: form._id,
      principalId: form.principalId,
      formTitle: form.formTitle || 'ID Card Form',
      formDescription: form.formDescription || '',
      updatedAt: form.updatedAt || null,
      formFields: sortedFormFields,
      fields: sortedFormFields,
    });
  } catch (err) {
    console.error('[getForm] ❌ Error:', err);
    return res.status(500).json({ error: 'Failed to fetch form.' });
  }
};

// ── Submit Form ──────────────────────────────────────────────────────────────

/**
 * POST /api/form/submit
 * Submit filled form data
 * Body: { principalId, userId, userEmail, userName, role, formData }
 */
exports.submitForm = async (req, res) => {
  try {
    const { principalId, userId, userEmail, userName, role, formData } = req.body || {};
    
    console.log('[submitForm] ► Submitting form');
    console.log('[submitForm] principal:', principalId, 'user:', userId, 'role:', role);

    // Validate required fields (formData may be empty object)
    if (!principalId || !userId || !userEmail || !role) {
      console.log('[submitForm] ❌ Missing required fields');
      return res.status(400).json({ error: 'principalId, userId, userEmail and role required' });
    }

    // Validate role
    if (!['student', 'teacher'].includes(role)) {
      console.log('[submitForm] ❌ Invalid role:', role);
      return res.status(400).json({ error: 'role must be student or teacher' });
    }

    // Create submission
    const answersObj = formData && typeof formData === 'object' ? formData : {};

    const submission = new IdCardSubmission({
      principalId,
      userId,
      userEmail,
      userName: userName || '',
      role,
      answers: new Map(Object.entries(answersObj)),
    });

    await submission.save();

    console.log('[submitForm] ✅ Submission saved. ID:', submission._id);
    return res.status(201).json({
      message: 'Form submitted successfully',
      submission: {
        id: submission._id,
        submittedAt: submission.submittedAt,
      }
    });
  } catch (err) {
    console.error('[submitForm] ❌ Error:', err);
    return res.status(500).json({ error: 'Failed to submit form.' });
  }
};

// ── Get All Submissions (for principal) ──────────────────────────────────────

/**
 * GET /api/form/submissions
 * Fetch all form submissions (principal view) or user submissions (student/teacher view)
 * Query: ?principalId=xxx&role=student/teacher/all&userId=xxx (optional userId for user's own submissions)
 */
exports.getSubmissions = async (req, res) => {
  try {
    const { principalId, role, userId } = req.query;
    console.log('[getSubmissions] ► Fetching submissions');
    console.log('[getSubmissions] principal:', principalId, 'role filter:', role, 'userId:', userId);
    
    if (!principalId) {
      console.log('[getSubmissions] ❌ principalId missing');
      return res.status(400).json({ error: 'principalId required' });
    }

    const query = { principalId };
    
    // Filter by role if specified
    if (role && ['student', 'teacher'].includes(role)) {
      query.role = role;
    }
    
    // Filter by userId if specified (for viewing user's own submissions or specific user)
    if (userId) {
      query.userId = userId;
    }

    const submissions = await IdCardSubmission.find(query)
      .sort({ submittedAt: -1 })
      .lean();

    console.log('[getSubmissions] ✅ Found', submissions.length, 'submissions');
    return res.json({
      total: submissions.length,
      submissions: submissions.map(sub => ({
        id: sub._id,
        userId: sub.userId,
        userEmail: sub.userEmail,
        userName: sub.userName,
        role: sub.role,
        submittedAt: sub.submittedAt,
        // Return as formData for frontend compatibility while DB stores 'answers'
        formData: toPlainAnswers(sub.answers || sub.formData),
      }))
    });
  } catch (err) {
    console.error('[getSubmissions] ❌ Error:', err);
    return res.status(500).json({ error: 'Failed to fetch submissions.' });
  }
};

// ── Get Single Submission ────────────────────────────────────────────────────

/**
 * GET /api/form/submissions/:submissionId
 * Fetch a single submission by ID
 */
exports.getSubmissionById = async (req, res) => {
  try {
    const { submissionId } = req.params;
    console.log('[getSubmissionById] ► Fetching submission:', submissionId);

    const submission = await IdCardSubmission.findById(submissionId).lean();
    if (!submission) {
      console.log('[getSubmissionById] ❌ Submission not found');
      return res.status(404).json({ error: 'Submission not found' });
    }

    console.log('[getSubmissionById] ✅ Submission found');
    return res.json({
      id: submission._id,
      principalId: submission.principalId,
      userId: submission.userId,
      userEmail: submission.userEmail,
      userName: submission.userName,
      role: submission.role,
      submittedAt: submission.submittedAt,
      formData: toPlainAnswers(submission.answers || submission.formData),
    });
  } catch (err) {
    console.error('[getSubmissionById] ❌ Error:', err);
    return res.status(500).json({ error: 'Failed to fetch submission.' });
  }
};
