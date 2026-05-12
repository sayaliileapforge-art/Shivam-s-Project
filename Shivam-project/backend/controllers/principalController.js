const SchoolClass  = require('../models/SchoolClass');
const SchoolMember = require('../models/SchoolMember');
const IdCardForm   = require('../models/IdCardForm');
const Order        = require('../models/Order');
const User         = require('../models/User');
const Client       = require('../models/Client');

// ── Classes ──────────────────────────────────────────────────────────────────

exports.getClasses = async (req, res) => {
  try {
    const { principalId } = req.query;
    if (!principalId) return res.status(400).json({ error: 'principalId required' });
    const list = await SchoolClass.find({ principalId }).sort({ createdAt: 1 }).lean();
    return res.json(list.map(c => ({ id: c._id, name: c.name })));
  } catch (err) {
    console.error('[getClasses]', err);
    return res.status(500).json({ error: 'Failed to load classes.' });
  }
};

exports.createClass = async (req, res) => {
  try {
    const { name, principalId } = req.body || {};
    if (!name || !principalId) return res.status(400).json({ error: 'name and principalId required' });
    const c = await SchoolClass.create({ name, principalId });
    return res.status(201).json({ id: c._id, name: c.name });
  } catch (err) {
    console.error('[createClass]', err);
    return res.status(500).json({ error: 'Failed to create class.' });
  }
};

exports.deleteClass = async (req, res) => {
  try {
    await SchoolClass.findByIdAndDelete(req.params.id);
    return res.json({ message: 'Class deleted.' });
  } catch (err) {
    console.error('[deleteClass]', err);
    return res.status(500).json({ error: 'Failed to delete class.' });
  }
};

// ── Promote Class ─────────────────────────────────────────────────────────────
// POST /api/principal/promote-class
// Body: { className, principalId }
// Logic:
//   1. Validate class name starts with a number (e.g. "1 - A", "2-B", "3A")
//   2. Compute next class name by incrementing the leading number
//   3. Find-or-create the next class under the same principalId
//   4. Move all students from className → nextClassName
exports.promoteClass = async (req, res) => {
  try {
    const { className, principalId } = req.body || {};
    if (!className || !principalId) {
      return res.status(400).json({ error: 'className and principalId are required' });
    }

    // Extract leading number and trailing suffix (e.g. " - A", "-A", "A")
    const match = className.trim().match(/^(\d+)(.*)$/);
    if (!match) {
      return res.status(422).json({
        error: `Cannot auto-promote "${className}": class name must start with a number (e.g. "1 - A")`,
      });
    }

    const nextNum = parseInt(match[1], 10) + 1;
    const nextClassName = `${nextNum}${match[2]}`;

    // Reject unreasonably high class numbers
    if (nextNum > 12) {
      return res.status(422).json({
        error: `Class "${className}" appears to be at the highest level (12). Cannot promote further.`,
      });
    }

    // Find or create the target class
    let nextClass = await SchoolClass.findOne({ name: nextClassName, principalId }).lean();
    if (!nextClass) {
      nextClass = await SchoolClass.create({ name: nextClassName, principalId });
      console.log(`[promoteClass] Created new class "${nextClassName}" for principalId=${principalId}`);
    }

    // Move all students whose classOrDept matches the source class
    const result = await SchoolMember.updateMany(
      { principalId, type: 'student', classOrDept: className },
      { $set: { classOrDept: nextClassName } }
    );

    console.log(
      `[promoteClass] "${className}" → "${nextClassName}": ${result.modifiedCount} student(s) promoted`
    );

    return res.json({
      message: 'Class promoted successfully',
      fromClass: className,
      nextClassName,
      studentsPromoted: result.modifiedCount,
    });
  } catch (err) {
    console.error('[promoteClass]', err);
    return res.status(500).json({ error: 'Failed to promote class.' });
  }
};

// ── Members (teachers / students / staff) ────────────────────────────────────

exports.getMembers = async (req, res) => {
  try {
    const { principalId, type } = req.query;
    if (!principalId) return res.status(400).json({ error: 'principalId required' });
    const query = { principalId };
    if (type) query.type = type;
    const list = await SchoolMember.find(query).sort({ createdAt: 1 }).lean();
    return res.json(list.map(m => ({
      id:          m._id,
      name:        m.name,
      classOrDept: m.classOrDept,
      phone:       m.phone,
      address:     m.address,
    })));
  } catch (err) {
    console.error('[getMembers]', err);
    return res.status(500).json({ error: 'Failed to load members.' });
  }
};

exports.createMember = async (req, res) => {
  try {
    const { type, name, classOrDept, phone, address, principalId } = req.body || {};
    if (!type || !name || !principalId)
      return res.status(400).json({ error: 'type, name and principalId required' });
    const m = await SchoolMember.create({
      type,
      name,
      principalId,
      classOrDept: classOrDept || '',
      phone:       phone       || '',
      address:     address     || '',
    });
    return res.status(201).json({
      id:          m._id,
      name:        m.name,
      classOrDept: m.classOrDept,
      phone:       m.phone,
      address:     m.address,
    });
  } catch (err) {
    console.error('[createMember]', err);
    return res.status(500).json({ error: 'Failed to create member.' });
  }
};

exports.updateMember = async (req, res) => {
  try {
    const { name, classOrDept, phone, address } = req.body || {};
    const m = await SchoolMember.findByIdAndUpdate(
      req.params.id,
      { name, classOrDept, phone, address },
      { new: true }
    ).lean();
    if (!m) return res.status(404).json({ error: 'Member not found.' });
    return res.json({
      id:          m._id,
      name:        m.name,
      classOrDept: m.classOrDept,
      phone:       m.phone,
      address:     m.address,
    });
  } catch (err) {
    console.error('[updateMember]', err);
    return res.status(500).json({ error: 'Failed to update member.' });
  }
};

// ── User Management (teachers + staff as app users) ─────────────────────────

exports.getUsers = async (req, res) => {
  try {
    const { principalId } = req.query;
    if (!principalId) return res.status(400).json({ error: 'principalId required' });
    const list = await SchoolMember.find({ principalId, type: { $in: ['teacher', 'staff'] } })
      .sort({ createdAt: 1 }).lean();
    return res.json(list.map(m => ({
      id:           m._id,
      name:         m.name,
      type:         m.type,
      classOrDept:  m.classOrDept,
      phone:        m.phone,
      isRestricted: !!m.isRestricted,
      // Active means user is not restricted and not force-logged out
      isActive:     !m.isRestricted && (m.isLoggedIn !== false),
      isLoggedIn:   m.isLoggedIn !== false,
      lastLogoutAt: m.lastLogoutAt || null,
    })));
  } catch (err) {
    console.error('[getUsers]', err);
    return res.status(500).json({ error: 'Failed to load users.' });
  }
};

exports.restrictMember = async (req, res) => {
  try {
    const { isRestricted } = req.body || {};
    const normalizedRestricted = !!isRestricted;
    const m = await SchoolMember.findByIdAndUpdate(
      req.params.id,
      {
        isRestricted: normalizedRestricted,
        // If restricted, user is not active. If restored, allow as active.
        isLoggedIn: !normalizedRestricted,
      },
      { new: true }
    ).lean();
    if (!m) return res.status(404).json({ error: 'Member not found.' });
    return res.json({
      id: m._id,
      isRestricted: !!m.isRestricted,
      isActive: !m.isRestricted && (m.isLoggedIn !== false),
    });
  } catch (err) {
    console.error('[restrictMember]', err);
    return res.status(500).json({ error: 'Failed to update restriction.' });
  }
};

exports.forceLogoutMember = async (req, res) => {
  try {
    const m = await SchoolMember.findByIdAndUpdate(
      req.params.id,
      {
        isLoggedIn: false,
        lastLogoutAt: new Date(),
      },
      { new: true }
    ).lean();
    if (!m) return res.status(404).json({ error: 'Member not found.' });
    return res.json({
      message: 'User force logged out.',
      id: m._id,
      isActive: false,
      lastLogoutAt: m.lastLogoutAt,
    });
  } catch (err) {
    console.error('[forceLogoutMember]', err);
    return res.status(500).json({ error: 'Failed to force logout.' });
  }
};

exports.deleteMember = async (req, res) => {
  try {
    await SchoolMember.findByIdAndDelete(req.params.id);
    return res.json({ message: 'Member deleted.' });
  } catch (err) {
    console.error('[deleteMember]', err);
    return res.status(500).json({ error: 'Failed to delete member.' });
  }
};

// ── ID Card Form Management ──────────────────────────────────────────────

exports.saveIdCardForm = async (req, res) => {
  try {
    console.log('🔥 SAVE FORM HIT', req.body);

    const { principalId, formFields, formTitle, formDescription } = req.body || {};

    if (!principalId || !formFields || !Array.isArray(formFields)) {
      console.log('[saveIdCardForm] ❌ Invalid input');
      return res.status(400).json({ error: 'principalId and formFields array required' });
    }

    // Validate and normalize incoming fields to expected shape: { label, type, required, order }
    const allowedTypes = ['text', 'dropdown', 'number', 'date'];
    const normalized = [];

    for (let i = 0; i < formFields.length; i++) {
      const f = formFields[i] || {};

      // Accept both legacy keys and new keys
      const label = f.label || f.fieldName || f.field_name || '';
      const type = (f.type || f.fieldType || 'text').toString();
      const required = (typeof f.required === 'boolean') ? f.required : (typeof f.isRequired === 'boolean' ? f.isRequired : true);

      if (!label || !allowedTypes.includes(type)) {
        console.log('[saveIdCardForm] ❌ Invalid field at index', i, { label, type });
        return res.status(400).json({ error: 'Each form field must include a valid label and type' });
      }

      normalized.push({ label: label.toString(), type: type, required: !!required, order: i });
    }

    const form = await IdCardForm.findOneAndUpdate(
      { principalId },
      {
        principalId,
        formFields: normalized,
        formTitle: formTitle || 'ID Card Form',
        formDescription: formDescription || '',
      },
      { upsert: true, new: true }
    ).lean();

    console.log('✅ Saved form:', form);
    return res.status(200).json({
      id: form._id,
      principalId: form.principalId,
      formTitle: form.formTitle,
      formDescription: form.formDescription,
      formFields: form.formFields,
      fields: form.formFields,
    });
  } catch (err) {
    console.error('[saveIdCardForm] ❌ Error:', err);
    return res.status(500).json({ error: 'Failed to save form.' });
  }
};

exports.getIdCardForm = async (req, res) => {
  try {
    const { principalId } = req.query;
    if (!principalId) {
      return res.status(400).json({ error: 'principalId required' });
    }

    const form = await IdCardForm.findOne({ principalId }).lean();
    if (!form) {
      return res.status(404).json({ error: 'No form found for this principal' });
    }

    // Sort fields by order before returning
    const sortedFormFields = form.formFields.sort((a, b) => a.order - b.order);

    return res.json({
      id: form._id,
      principalId: form.principalId,
      formTitle: form.formTitle,
      formDescription: form.formDescription,
      formFields: sortedFormFields,
    });
  } catch (err) {
    console.error('[getIdCardForm]', err);
    return res.status(500).json({ error: 'Failed to fetch form.' });
  }
};

// ── Purchase Orders ──────────────────────────────────────────────────────────

exports.getPurchaseOrders = async (req, res) => {
  try {
    const { principalId, schoolCode: schoolCodeParam } = req.query;
    if (!principalId && !schoolCodeParam) {
      return res.status(400).json({ error: 'principalId or schoolCode required' });
    }

    // Resolve schoolCode: prefer the direct query param (sent by Flutter from stored user),
    // fall back to DB lookup via principalId.
    let schoolCode = schoolCodeParam
      ? schoolCodeParam.toString().trim().toUpperCase()
      : null;

    if (!schoolCode && principalId) {
      const user = await User.findById(principalId).select('schoolCode').lean();
      if (user?.schoolCode) schoolCode = user.schoolCode;
    }

    if (!schoolCode) return res.json([]);

    // Find all clients whose schoolCode matches the principal's school code.
    // This enables orders that only have clientId (no schoolCode on the order itself)
    // to still be returned — covering orders created before schoolCode was set.
    const linkedClients = await Client.find({ schoolCode }).select('_id').lean();
    const clientIds = linkedClients.map(c => c._id);

    const query = clientIds.length
      ? { $or: [{ schoolCode }, { clientId: { $in: clientIds } }] }
      : { schoolCode };

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .lean();

    console.log('[getPurchaseOrders] schoolCode:', schoolCode, '| linkedClients:', clientIds.length, '| found:', orders.length);

    return res.json(orders.map(o => ({
      id:           o._id,
      title:        o.title,
      schoolName:   o.schoolName,
      productType:  o.productType  || '',
      productName:  o.productName  || '',
      stage:        o.stage,
      pricing:      o.pricing      || {},
      deliveryDate: o.deliveryDate,
      description:  o.description  || '',
      images:       o.images       || [],
      createdAt:    o.createdAt,
    })));
  } catch (err) {
    console.error('[getPurchaseOrders]', err);
    return res.status(500).json({ error: 'Failed to load purchase orders.' });
  }
};
