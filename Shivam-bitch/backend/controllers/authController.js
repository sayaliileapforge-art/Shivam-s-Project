const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const VALID_ROLES = ['student', 'teacher', 'principal', 'vendor'];

function normalizeRole(value) {
  return (value || '').toString().trim().toLowerCase();
}

async function resolvePrincipalIdForUser(user) {
  if (!user) return '';
  const role = normalizeRole(user.role);
  if (role === 'vendor') return '';
  if (role === 'principal') return user._id.toString();

  const safeSchoolCode = (user.schoolCode || '').toString().trim().toUpperCase();
  if (!safeSchoolCode) return '';

  const principal = await User.findOne({
    role: 'principal',
    schoolCode: safeSchoolCode,
  })
    .select('_id')
    .lean();

  return principal ? principal._id.toString() : '';
}

async function toPublicUser(user) {
  const principalId = await resolvePrincipalIdForUser(user);
  return {
    id: user._id.toString(),
    name: user.name,
    phone: user.phone,
    role: user.role,
    schoolCode: user.schoolCode,
    schoolName: user.schoolName || '',
    vendorCode: user.vendorCode || '',
    principalId,
  };
}

// ─── REGISTER ────────────────────────────────────────────────────────────────
exports.register = async (req, res) => {
  try {
    console.log('[auth.register] ROUTE HIT');
    console.log('[auth.register] BODY:', req.body);

    const { name, phone, password, schoolCode, schoolName, vendorCode, role } = req.body || {};
    const normalizedRole = normalizeRole(role);
    const safeName        = (name       || '').toString().trim();
    const safePhone       = (phone      || '').toString().trim();
    const safePassword    = (password   || '').toString();
    const safeSchoolCode  = (schoolCode || '').toString().trim().toUpperCase();
    const safeSchoolName  = (schoolName || '').toString().trim();
    const safeVendorCode  = (vendorCode || '').toString().trim().toUpperCase();
    const isVendor = normalizedRole === 'vendor';

    // ── Basic field validation ──────────────────────────────────────
    if (!safeName || !safePhone || !safePassword || !normalizedRole) {
      return res.status(400).json({
        message: 'name, phone, password and role are required',
      });
    }
    if (!VALID_ROLES.includes(normalizedRole)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    if (!isVendor && !safeSchoolCode) {
      return res
        .status(400)
        .json({ message: 'schoolCode is required for this role' });
    }
    if (isVendor && !safeVendorCode) {
      return res
        .status(400)
        .json({ message: 'vendorCode is required for vendor role' });
    }

    // ── Duplicate phone check ───────────────────────────────────────
    const existing = await User.findOne({ phone: safePhone }).lean();
    if (existing) {
      return res.status(409).json({ message: 'Phone already registered' });
    }

    let resolvedSchoolName = safeSchoolName;
    let resolvedSchoolCode = safeSchoolCode;
    let resolvedVendorCode = null;

    if (normalizedRole === 'principal') {
      // Principal MUST provide a school name
      if (!safeSchoolName) {
        return res.status(400).json({ message: 'schoolName is required for principal' });
      }
      // No duplicate schoolCode for principals — one principal owns one school code
      const codeInUse = await User.findOne({
        schoolCode: safeSchoolCode,
        role: 'principal',
      }).lean();
      if (codeInUse) {
        return res.status(409).json({ message: 'School code already taken by another principal' });
      }
    } else if (isVendor) {
      // Vendor is independent and does not require school linkage.
      resolvedSchoolCode = null;
      resolvedSchoolName = '';
      resolvedVendorCode = safeVendorCode;

      const vendorCodeInUse = await User.findOne({
        role: 'vendor',
        vendorCode: safeVendorCode,
      }).lean();
      if (vendorCodeInUse) {
        return res.status(409).json({ message: 'Vendor code already in use' });
      }
    } else {
      // Non-principal MUST join an existing school
      const school = await User.findOne({
        schoolCode: safeSchoolCode,
        role: 'principal',
      }).lean();
      if (!school) {
        return res.status(404).json({
          message: 'School code not found. Please ask your principal for the correct code.',
        });
      }
      // Inherit school name from the principal's record
      resolvedSchoolName = school.schoolName || safeSchoolCode;
    }

    const hashedPassword = await bcrypt.hash(safePassword, 10);

    await User.create({
      name: safeName,
      phone: safePhone,
      password: hashedPassword,
      schoolCode: resolvedSchoolCode,
      schoolName: resolvedSchoolName,
      vendorCode: resolvedVendorCode,
      role: normalizedRole,
    });

    return res.status(201).json({ success: true, message: 'User created' });
  } catch (err) {
    console.error('[auth.register]', err);
    if (err && err.code === 11000) {
      return res.status(409).json({ message: 'Phone already registered' });
    }
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── LOGIN ────────────────────────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    console.log('[auth.login] ROUTE HIT');
    console.log('[auth.login] BODY:', req.body);

    const { phone, password, schoolCode, vendorCode, role } = req.body || {};
    const normalizedRole = normalizeRole(role);
    const isVendor = normalizedRole === 'vendor';
    const safeSchoolCode = (schoolCode || '').toString().trim().toUpperCase();
    const safeVendorCode = (vendorCode || '').toString().trim().toUpperCase();

    if (!phone || !password || !normalizedRole) {
      return res.status(400).json({ message: 'phone, password and role are required' });
    }
    if (!VALID_ROLES.includes(normalizedRole)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    if (!isVendor && !safeSchoolCode) {
      return res
        .status(400)
        .json({ message: 'schoolCode is required for this role' });
    }

    let user;
    if (isVendor) {
      user = await User.findOne({ phone: phone.toString().trim(), role: 'vendor' });
    } else {
      user = await User.findOne({
        phone: phone.toString().trim(),
        role: normalizedRole,
        schoolCode: safeSchoolCode,
      });
    }
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password.toString(), user.password);
    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const secret = process.env.JWT_SECRET || 'dev_secret_change_me';
    const token = jwt.sign(
      { id: user._id.toString(), phone: user.phone, role: user.role, schoolCode: user.schoolCode },
      secret,
      { expiresIn: '7d' }
    );

    const publicUser = await toPublicUser(user);
    return res.json({ token, user: publicUser });
  } catch (err) {
    console.error('[auth.login]', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── PROFILE (GET) ────────────────────────────────────────────────────────────
exports.profile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    const publicUser = await toPublicUser(user);
    return res.json({ user: publicUser });
  } catch (err) {
    console.error('[auth.profile]', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── UPDATE PROFILE (PUT) ─────────────────────────────────────────────────────
exports.updateProfile = async (req, res) => {
  try {
    const { name, phone } = req.body || {};
    const safeName  = (name  || '').toString().trim();
    const safePhone = (phone || '').toString().trim();

    if (!safeName && !safePhone) {
      return res.status(400).json({ message: 'Provide name or phone to update' });
    }

    const update = {};
    if (safeName)  update.name  = safeName;
    if (safePhone) {
      // Check phone not already taken by someone else
      if (safePhone !== req.user.phone) {
        const conflict = await User.findOne({ phone: safePhone, _id: { $ne: req.user.id } }).lean();
        if (conflict) return res.status(409).json({ message: 'Phone already in use' });
      }
      update.phone = safePhone;
    }

    const updated = await User.findByIdAndUpdate(
      req.user.id,
      { $set: update },
      { new: true, lean: true }
    );
    if (!updated) return res.status(404).json({ message: 'User not found' });

    const publicUser = await toPublicUser(updated);
    return res.json({ user: publicUser });
  } catch (err) {
    console.error('[auth.updateProfile]', err);
    if (err && err.code === 11000) {
      return res.status(409).json({ message: 'Phone already in use' });
    }
    return res.status(500).json({ message: 'Server error' });
  }
};
