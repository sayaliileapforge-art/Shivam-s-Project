const Client       = require('../models/Client');
const Order        = require('../models/Order');
const User         = require('../models/User');
const SchoolClass  = require('../models/SchoolClass');
const SchoolMember = require('../models/SchoolMember');
const path         = require('path');
const fs           = require('fs');
const multer       = require('multer');
const XLSX         = require('xlsx');

// ── Order-file upload (multer) ──────────────────────────────────────
const orderFilesDir = path.join(__dirname, '..', 'uploads', 'order-files');
if (!fs.existsSync(orderFilesDir)) fs.mkdirSync(orderFilesDir, { recursive: true });

const _orderFileStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, orderFilesDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const ext    = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});

const _orderFileUpload = multer({
  storage: _orderFileStorage,
  limits:  { fileSize: 50 * 1024 * 1024 }, // 50 MB per file
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'application/postscript',           // .ai / .eps
      'image/vnd.adobe.photoshop',        // .psd
      'image/svg+xml',                    // .svg
      'application/msword',               // .doc
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/vnd.ms-excel',                                               // .xls
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',      // .xlsx
    ];
    // also allow by extension for CDR and other design files
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.cdr', '.ai', '.psd', '.eps', '.svg'];
    if (allowed.includes(file.mimetype) || allowedExts.includes(ext)) {
      return cb(null, true);
    }
    cb(new Error(`File type not allowed: ${file.mimetype}`));
  },
});

/** Middleware - attach to route before uploadOrderFiles */
exports.uploadOrderFilesMiddleware = _orderFileUpload.array('files', 20);

function normalizeVendorCode(value) {
  return (value || '').toString().trim().toUpperCase();
}

function normalizeSchoolCode(value) {
  return (value || '').toString().trim().toUpperCase();
}

/**
 * GET /api/vendor/dashboard
 *
 * Query params:
 *   vendorId  (required) – identifies which vendor's data to return
 *
 * Response:
 * {
 *   totalClients:   number,
 *   activeOrders:   number,
 *   cardsToday:     number,
 *   activeProjects: [{ schoolName, stage, progress }]
 * }
 */
/**
 * GET /api/vendor/orders
 *
 * Query params:
 *   vendorId  (required)
 *
 * Response:
 * {
 *   Draft:       [{ id, title, schoolName, progress, stage }],
 *   "Data Upload": [...],
 *   ...
 * }
 */
/**
 * POST /api/vendor/clients
 *
 * Body: { schoolName, address?, city?, contactName?, phone?, email?, vendorId }
 */
exports.createClient = async (req, res) => {
  try {
    const {
      schoolName,
      schoolCode,
      address,
      city,
      contactName,
      phone,
      email,
      vendorId,
      // Extended fields
      clientType,
      state,
      district,
      pincode,
      deliveryMode,
      busStop,
      route,
      gstNumber,
      gstName,
      gstStateCode,
      gstAddress,
    } = req.body || {};
    if (!schoolName || !vendorId) {
      return res.status(400).json({ error: 'schoolName and vendorId are required.' });
    }
    const safeSchoolCode = normalizeSchoolCode(schoolCode);

    if (safeSchoolCode) {
      const existingByCode = await Client.findOne({
        vendorId,
        schoolCode: safeSchoolCode,
      }).lean();
      if (existingByCode) {
        return res.status(409).json({
          error: 'This school code is already linked to your account.',
        });
      }
    }

    const client = await Client.create({
      schoolName,
      vendorId,
      ...(safeSchoolCode && { schoolCode: safeSchoolCode }),
      ...(address      && { address }),
      ...(city         && { city }),
      ...(contactName  && { contactName }),
      ...(phone        && { phone }),
      ...(email        && { email }),
      ...(clientType   && { clientType }),
      ...(state        && { state }),
      ...(district     && { district }),
      ...(pincode      && { pincode }),
      ...(deliveryMode && { deliveryMode }),
      ...(busStop      && { busStop }),
      ...(route        && { route }),
      ...(gstNumber    && { gstNumber }),
      ...(gstName      && { gstName }),
      ...(gstStateCode && { gstStateCode }),
      ...(gstAddress   && { gstAddress }),
    });
    return res.status(201).json(_formatClient(client));
  } catch (err) {
    console.error('[createClient]', err);
    return res.status(500).json({ error: err.message || 'Failed to create client.' });
  }
};

function _formatClient(c) {
  return {
    id:           c._id,
    schoolName:   c.schoolName,
    schoolCode:   c.schoolCode   || '',
    city:         c.city         || '',
    contactName:  c.contactName  || '',
    phone:        c.phone        || '',
    email:        c.email        || '',
    address:      c.address      || '',
    clientType:   c.clientType   || '',
    state:        c.state        || '',
    district:     c.district     || '',
    pincode:      c.pincode      || '',
    deliveryMode: c.deliveryMode || '',
    busStop:      c.busStop      || '',
    route:        c.route        || '',
    gstNumber:    c.gstNumber    || '',
    gstName:      c.gstName      || '',
    gstStateCode: c.gstStateCode || '',
    gstAddress:   c.gstAddress   || '',
    vendorId:     c.vendorId,
  };
}

exports.deleteClient = async (req, res) => {
  try {
    const deleted = await Client.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Client not found.' });
    await Order.deleteMany({ clientId: deleted._id });
    return res.json({ message: 'Client deleted.' });
  } catch (err) {
    console.error('[deleteClient]', err);
    return res.status(500).json({ error: 'Failed to delete client.' });
  }
};

/**
 * PATCH /api/vendor/clients/:id
 *
 * Updates editable fields on a client (schoolCode, contactName, phone, address, city, email).
 */
exports.updateClient = async (req, res) => {
  try {
    const {
      schoolCode, contactName, phone, address, city, email,
      clientType, state, district, pincode,
      deliveryMode, busStop, route,
      gstNumber, gstName, gstStateCode, gstAddress,
    } = req.body || {};
    const patch = {};
    if (schoolCode   !== undefined) patch.schoolCode   = normalizeSchoolCode(schoolCode);
    if (contactName  !== undefined) patch.contactName  = (contactName  || '').toString().trim();
    if (phone        !== undefined) patch.phone        = (phone        || '').toString().trim();
    if (address      !== undefined) patch.address      = (address      || '').toString().trim();
    if (city         !== undefined) patch.city         = (city         || '').toString().trim();
    if (email        !== undefined) patch.email        = (email        || '').toString().trim().toLowerCase();
    if (clientType   !== undefined) patch.clientType   = (clientType   || '').toString().trim();
    if (state        !== undefined) patch.state        = (state        || '').toString().trim();
    if (district     !== undefined) patch.district     = (district     || '').toString().trim();
    if (pincode      !== undefined) patch.pincode      = (pincode      || '').toString().trim();
    if (deliveryMode !== undefined) patch.deliveryMode = (deliveryMode || '').toString().trim();
    if (busStop      !== undefined) patch.busStop      = (busStop      || '').toString().trim();
    if (route        !== undefined) patch.route        = (route        || '').toString().trim();
    if (gstNumber    !== undefined) patch.gstNumber    = (gstNumber    || '').toString().trim();
    if (gstName      !== undefined) patch.gstName      = (gstName      || '').toString().trim();
    if (gstStateCode !== undefined) patch.gstStateCode = (gstStateCode || '').toString().trim();
    if (gstAddress   !== undefined) patch.gstAddress   = (gstAddress   || '').toString().trim();

    const updated = await Client.findByIdAndUpdate(
      req.params.id,
      { $set: patch },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ error: 'Client not found.' });
    console.log(`[updateClient] id=${req.params.id} patch=${JSON.stringify(patch)}`);

    // Backfill all existing orders linked to this client with the new schoolCode.
    // This ensures orders created before the schoolCode was set become visible to the principal.
    if (patch.schoolCode) {
      const backfill = await Order.updateMany(
        { clientId: updated._id },
        { $set: { schoolCode: patch.schoolCode } }
      );
      console.log(`[updateClient] backfilled ${backfill.modifiedCount} orders with schoolCode=${patch.schoolCode}`);
    }

    return res.json(_formatClient(updated));
  } catch (err) {
    console.error('[updateClient]', err);
    return res.status(500).json({ error: 'Failed to update client.' });
  }
};

exports.getVendorClients = async (req, res) => {
  try {
    const { vendorId } = req.query;
    if (!vendorId) {
      return res.status(400).json({ error: 'vendorId query parameter is required.' });
    }
    const clients = await Client.find({ vendorId })
      .sort({ createdAt: -1 })
      .lean();
    return res.json(clients.map(_formatClient));
  } catch (err) {
    console.error('[getVendorClients]', err);
    return res.status(500).json({ error: 'Failed to load clients.' });
  }
};

exports.getVendorOrders = async (req, res) => {
  try {
    const { vendorId } = req.query;

    if (!vendorId) {
      return res.status(400).json({ error: 'vendorId query parameter is required.' });
    }

    const orders = await Order.find({ vendorId }).lean();

    // Build an object with every stage pre-initialised as an empty array
    const grouped = STAGES.reduce((acc, stage) => {
      acc[stage] = [];
      return acc;
    }, {});

    for (const order of orders) {
      const bucket = grouped[order.stage];
      if (bucket) {
        bucket.push({
          id:           order._id,
          title:        order.title,
          schoolName:   order.schoolName,
          progress:     order.progress,
          stage:        order.stage,
          productName:  order.productName  || '',
          productImage: order.productImage || '',
        });
      }
    }

    return res.json(grouped);
  } catch (err) {
    console.error('[getVendorOrders]', err);
    return res.status(500).json({ error: 'Failed to load orders.' });
  }
};

/**
 * GET /api/vendor/orders/:id
 *
 * Returns the full order document for a single order.
 */
exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).lean();
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    // Resolve a stored image URL so it is always reachable by the requesting client.
    // Stored URLs may be relative ("/uploads/...") or may contain "localhost" which
    // fails on a physical device.  We rewrite them to use the same host:port the
    // client used to reach this endpoint.
    const serverBase = `${req.protocol}://${req.get('host')}`;
    // Always rewrite the stored URL's host to the current request host so the
    // image is reachable from whatever device/IP is making this request.
    const resolveImageUrl = (url) => {
      if (!url) return url;
      try {
        if (url.startsWith('http://') || url.startsWith('https://')) {
          const u = new URL(url);
          // Replace stored host with current request host (handles localhost,
          // wrong IP, wrong port, etc.)
          return `${serverBase}${u.pathname}${u.search}`;
        }
        // Relative path → make absolute
        return `${serverBase}${url.startsWith('/') ? '' : '/'}${url}`;
      } catch (_) {
        return url;
      }
    };

    const resolvedImages      = (order.images      || []).map(resolveImageUrl);
    const resolvedAttachments  = (order.attachments || []).filter(Boolean).map(resolveImageUrl);
    console.log(`[getOrderById] id=${order._id} images(${resolvedImages.length}):`, resolvedImages);
    console.log(`[getOrderById] id=${order._id} attachments(${resolvedAttachments.length}):`, resolvedAttachments);

    return res.json({
      id:             order._id,
      title:          order.title,
      schoolName:     order.schoolName,
      stage:          order.stage,
      progress:       order.progress,
      totalCards:     order.totalCards,
      completedCards: order.completedCards,
      deliveryDate:   order.deliveryDate,
      productId:      order.productId,
      productType:    order.productType,
      productName:    order.productName,
      productImage:   resolveImageUrl(order.productImage),
      pricing:        order.pricing,
      description:    order.description,
      youtubeLink:    order.youtubeLink,
      instagramLink:  order.instagramLink,
      videoUrl:       order.videoUrl,
      images:         resolvedImages,
      orderImages:    resolvedImages,
      attachments:    resolvedAttachments,
      excelFileName:  order.excelFileName || '',
      excelData:      Array.isArray(order.excelData) ? order.excelData : [],
      excelHeaders:   Array.isArray(order.excelHeaders) ? order.excelHeaders : [],
      quantity:       order.quantity || 1,
      unit:           order.unit || '',
      variableFields: order.variableFields || [],
      columnMappings: order.columnMappings  || {},
      files:          (order.files || []).map(f => ({
        originalName: f.originalName,
        path:         f.path,
      })),
      createdAt:      order.createdAt,
    });
  } catch (err) {
    console.error('[getOrderById]', err);
    return res.status(500).json({ error: 'Failed to load order.' });
  }
};

/**
 * POST /api/vendor/orders
 *
 * Body: { title, clientId?, schoolName, stage?, progress?, totalCards?,
 *         completedCards?, deliveryDate?, productType?, vendorId }
 */
exports.createOrder = async (req, res) => {
  try {
    const {
      title, clientId, schoolName, stage, progress,
      totalCards, completedCards, deliveryDate, productType, vendorId,
      productId, productName, productImage, pricing, description, youtubeLink, instagramLink, videoUrl,
      images,
      variableFields, columnMappings,
      schoolCode: schoolCodeFromClient,   // sent explicitly by Flutter
    } = req.body;

    if (!title || !schoolName || !vendorId) {
      return res.status(400).json({ error: 'title, schoolName and vendorId are required.' });
    }

    // Prefer schoolCode sent by Flutter (from client dropdown).
    // Fall back to a DB lookup on the clientId for backward compatibility.
    let schoolCode = schoolCodeFromClient
      ? schoolCodeFromClient.toString().trim().toUpperCase()
      : undefined;

    if (!schoolCode && clientId) {
      const client = await Client.findById(clientId).select('schoolCode').lean();
      if (client?.schoolCode) schoolCode = client.schoolCode;
    }

    console.log('[createOrder] resolvedSchoolCode:', schoolCode, 'from:', schoolCodeFromClient ? 'Flutter payload' : 'DB lookup');

    const order = await Order.create({
      title,
      schoolName,
      stage:          stage          || 'Draft',
      progress:       progress       || 0,
      totalCards:     totalCards     || 0,
      completedCards: completedCards || 0,
      vendorId,
      ...(clientId     && { clientId }),
      ...(schoolCode   && { schoolCode }),
      ...(deliveryDate && { deliveryDate: new Date(deliveryDate) }),
      ...(productId    && { productId }),
      ...(productType   && { productType }),
      ...(productName   && { productName }),
      ...(productImage  && { productImage }),
      ...(pricing       && { pricing }),
      ...(description   && { description }),
      ...(youtubeLink   && { youtubeLink }),
      ...(instagramLink && { instagramLink }),
      ...(videoUrl      && { videoUrl }),
      ...(Array.isArray(images) && images.length && { images }),
      ...(variableFields !== undefined && { variableFields }),
      ...(columnMappings !== undefined && { columnMappings }),
    });

    console.log('[createOrder] Saved order:', {
      id: order._id, title: order.title, schoolCode: order.schoolCode, clientId: order.clientId,
    });

    return res.status(201).json({
      id:         order._id,
      title:      order.title,
      schoolName: order.schoolName,
      stage:      order.stage,
      progress:   order.progress,
    });
  } catch (err) {
    console.error('[createOrder]', err);
    return res.status(500).json({ error: 'Failed to create order.' });
  }
};

/**
 * GET /api/vendor/clients/:id
 *
 * Returns full details for a single client.
 */
exports.getVendorClientById = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id).lean();
    if (!client) return res.status(404).json({ error: 'Client not found.' });
    return res.json(_formatClient(client));
  } catch (err) {
    console.error('[getVendorClientById]', err);
    return res.status(500).json({ error: 'Failed to load client.' });
  }
};

/**
 * GET /api/vendor/clients/:id/school-summary
 *
 * Returns class / student / teacher counts for the school linked
 * to this client (via client.schoolCode → principal User).
 */
exports.getClientSchoolSummary = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id).lean();
    if (!client) return res.status(404).json({ error: 'Client not found.' });

    const schoolCode = (client.schoolCode || '').toUpperCase();
    let principalId = req.params.id.toString(); // fallback: clientId as namespace

    if (schoolCode) {
      const principal = await User.findOne({ role: 'principal', schoolCode }).select('_id').lean();
      if (principal) principalId = principal._id.toString();
    }

    const [classesCount, studentsCount, teachersCount] = await Promise.all([
      SchoolClass .countDocuments({ principalId }),
      SchoolMember.countDocuments({ principalId, type: 'student' }),
      SchoolMember.countDocuments({ principalId, type: 'teacher' }),
    ]);

    console.log(`[schoolSummary] school=${schoolCode} principalId=${principalId} classes=${classesCount} students=${studentsCount} teachers=${teachersCount}`);
    return res.json({ classesCount, studentsCount, teachersCount, linked: true, schoolCode });
  } catch (err) {
    console.error('[getClientSchoolSummary]', err);
    return res.status(500).json({ error: 'Failed to load school summary.' });
  }
};

/**
 * GET /api/vendor/clients/:id/school-classes
 * Returns list of class names for the school linked to this client.
 */
exports.getSchoolClasses = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id).lean();
    if (!client) return res.status(404).json({ error: 'Client not found.' });
    const schoolCode = (client.schoolCode || '').toUpperCase();
    let principalId = req.params.id.toString();
    if (schoolCode) {
      const principal = await User.findOne({ role: 'principal', schoolCode }).select('_id').lean();
      if (principal) principalId = principal._id.toString();
    }
    const classes = await SchoolClass.find({ principalId }).select('name').sort({ name: 1 }).lean();
    return res.json({ classes: classes.map(c => c.name) });
  } catch (err) {
    console.error('[getSchoolClasses]', err);
    return res.status(500).json({ error: 'Failed to load classes.' });
  }
};

/**
 * GET /api/vendor/clients/:id/school-members?type=student|teacher|staff
 * Returns members of the given type for the school linked to this client.
 */
exports.getSchoolMembers = async (req, res) => {
  try {
    const { type } = req.query;
    const client = await Client.findById(req.params.id).lean();
    if (!client) return res.status(404).json({ error: 'Client not found.' });
    const schoolCode = (client.schoolCode || '').toUpperCase();
    let principalId = req.params.id.toString();
    if (schoolCode) {
      const principal = await User.findOne({ role: 'principal', schoolCode }).select('_id').lean();
      if (principal) principalId = principal._id.toString();
    }
    const query = { principalId };
    if (type) query.type = type;
    const members = await SchoolMember.find(query)
      .select('name classOrDept phone type')
      .sort({ name: 1 })
      .lean();
    return res.json({
      members: members.map(m => ({
        id:          m._id,
        name:        m.name,
        classOrDept: m.classOrDept,
        phone:       m.phone,
        type:        m.type,
      })),
    });
  } catch (err) {
    console.error('[getSchoolMembers]', err);
    return res.status(500).json({ error: 'Failed to load members.' });
  }
};

/**
 * GET /api/vendor/clients/:id/orders
 *
 * Returns all orders linked to this client via clientId FK.
 */
exports.getClientOrders = async (req, res) => {
  try {
    const orders = await Order.find({ clientId: req.params.id })
      .sort({ updatedAt: -1 })
      .lean();
    return res.json(orders.map(o => ({
      id:           o._id,
      title:        o.title,
      schoolName:   o.schoolName,
      stage:        o.stage,
      progress:     o.progress,
      productType:  o.productType  || '',
      deliveryDate: o.deliveryDate || null,
      createdAt:    o.createdAt,
    })));
  } catch (err) {
    console.error('[getClientOrders]', err);
    return res.status(500).json({ error: 'Failed to load orders.' });
  }
};

const STAGES = [
  'Draft',
  'Data Upload',
  'Design',
  'Proof',
  'Printing',
  'Dispatch',
  'Delivered',
];

exports.advanceOrderStage = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    const idx = STAGES.indexOf(order.stage);
    if (idx === -1 || idx === STAGES.length - 1) {
      return res.status(400).json({ error: 'Order is already at the final stage.' });
    }
    order.stage = STAGES[idx + 1];
    await order.save();
    return res.json({ id: order._id, stage: order.stage });
  } catch (err) {
    console.error('[advanceOrderStage]', err);
    return res.status(500).json({ error: 'Failed to advance stage.' });
  }
};

/**
 * POST /api/vendor/orders/:id/files
 *
 * Attaches uploaded files to an existing order.
 * Accepts multipart/form-data with field name "files" (up to 20 files).
 */
exports.uploadOrderFiles = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files received.' });
    }

    const _serverBase = (process.env.SERVER_BASE_URL || 'http://72.62.241.170').replace(/\/$/, '');
    const newEntries = req.files.map((f) => ({
      originalName: f.originalname,
      filename:     f.filename,
      path:         `${_serverBase}/uploads/order-files/${f.filename}`,
      mimeType:     f.mimetype,
      size:         f.size,
    }));

    order.files.push(...newEntries);
    await order.save();

    return res.status(201).json({
      orderId:  order._id,
      uploaded: newEntries.length,
      files:    newEntries,
    });
  } catch (err) {
    console.error('[uploadOrderFiles]', err);
    return res.status(500).json({ error: 'Failed to upload files.' });
  }
};

exports.getVendorDashboard = async (req, res) => {
  try {
    const rawVendorId = (req.query.vendorId || '').toString().trim();
    let vendorCode = normalizeVendorCode(req.query.vendorCode);

    if (!rawVendorId && !vendorCode) {
      return res.status(400).json({
        error: 'vendorId or vendorCode query parameter is required.',
      });
    }

    let vendorId = rawVendorId;

    // Allow dashboard lookup by vendorCode when vendorId is not available.
    if (!vendorId && vendorCode) {
      const vendorUser = await User.findOne({
        role: 'vendor',
        vendorCode,
      })
        .select('_id vendorCode')
        .lean();

      if (!vendorUser) {
        return res.status(404).json({ error: 'Vendor not found for provided vendorCode.' });
      }

      vendorId = vendorUser._id.toString();
      vendorCode = normalizeVendorCode(vendorUser.vendorCode);
    }

    // Resolve vendorCode from vendor profile when vendorId is available.
    const isObjectId = /^[a-f\d]{24}$/i.test(vendorId);
    if (!vendorCode && isObjectId) {
      const vendorUser = await User.findById(vendorId)
        .select('vendorCode')
        .lean();
      vendorCode = normalizeVendorCode(vendorUser?.vendorCode);
    }

    // Build start-of-today boundary (UTC midnight)
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    // Run all queries in parallel for performance
    const [
      totalClients,
      activeOrders,
      cardsTodayResult,
      activeProjects,
      schools,
      linkedPrincipalSchools,
    ] =
      await Promise.all([
        // 1. Total clients for this vendor
        Client.countDocuments({ vendorId }),

        // 2. Orders that are not yet delivered
        Order.countDocuments({ vendorId, stage: { $ne: 'Delivered' } }),

        // 3. Sum of completedCards from orders updated today (must be tied to a client)
        Order.aggregate([
          {
            $match: {
              vendorId,
              updatedAt: { $gte: todayStart },
              clientId: { $exists: true },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$completedCards' },
            },
          },
        ]),

        // 4. Latest 5 orders tied to a real client for the active projects board
        Order.find({ vendorId, clientId: { $exists: true } })
          .sort({ updatedAt: -1 })
          .limit(5)
          .select('schoolName stage progress -_id'),

        // 5. All client schools for this vendor
        Client.find({ vendorId })
          .sort({ createdAt: -1 })
          .select('schoolName city'),   // _id included by default — needed for clientId

        // 6. Schools linked by principal vendorCode
        vendorCode
          ? User.find({ role: 'principal', vendorCode })
              .select('schoolName schoolCode -_id')
              .lean()
          : Promise.resolve([]),
      ]);

    const cardsToday =
      cardsTodayResult.length > 0 ? cardsTodayResult[0].total : 0;

    // Merge schools from vendor clients and principal-vendor linkage.
    const mergedSchools = [];
    const seenSchools = new Set();

    for (const s of schools) {
      const schoolName = (s.schoolName || '').toString().trim();
      const city = (s.city || '').toString().trim();
      const clientId = s._id ? s._id.toString() : '';
      const key = schoolName.toLowerCase();
      if (!schoolName || seenSchools.has(key)) continue;
      seenSchools.add(key);
      mergedSchools.push({ schoolName, city, clientId });
    }

    for (const p of linkedPrincipalSchools) {
      const schoolName =
        (p.schoolName || p.schoolCode || '').toString().trim();
      const key = schoolName.toLowerCase();
      if (!schoolName || seenSchools.has(key)) continue;
      seenSchools.add(key);
      mergedSchools.push({ schoolName, city: '' });
    }

    return res.json({
      totalClients,
      activeOrders,
      cardsToday,
      activeProjects,
      schools: mergedSchools,
    });
  } catch (err) {
    console.error('[getVendorDashboard]', err);
    return res.status(500).json({ error: 'Failed to load dashboard data.' });
  }
};

// ── Excel Upload + Auto-Ingest ───────────────────────────────────────────────

const excelUploadDir = path.join(__dirname, '..', 'uploads', 'excel-imports');
if (!fs.existsSync(excelUploadDir)) fs.mkdirSync(excelUploadDir, { recursive: true });

const _excelUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, excelUploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls', '.csv'].includes(ext)) return cb(null, true);
    cb(new Error('Only .xlsx, .xls, .csv files are allowed'));
  },
});

exports.uploadExcelMiddleware = _excelUpload.single('file');

/**
 * POST /api/vendor/upload-excel
 *
 * multipart/form-data fields:
 *   file      – the Excel / CSV file
 *   mapping   – JSON: { studentName: "colA", className: "colB", ... }
 *   vendorId  – string
 *   clientId  – string (MongoDB _id of Client record)
 *
 * Flow:
 *  1. Parse Excel rows using the provided column mapping
 *  2. Resolve principalId via clientId → Client.schoolCode → User(principal)
 *  3. Bulk-upsert classes (unique: name + principalId)
 *  4. Bulk-upsert students (unique: phone + principalId, fallback: name+class)
 *  5. Bulk-upsert teachers (if teacherName column mapped, unique: name+principalId)
 *  6. Return summary { classesCreated, studentsAdded, teachersAdded }
 */
exports.uploadExcel = async (req, res) => {
  const filePath = req.file?.path;
  try {
    const { vendorId, clientId } = req.body || {};
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    if (!clientId) return res.status(400).json({ error: 'clientId is required.' });

    // Parse mapping
    let mapping = {};
    try {
      mapping = JSON.parse(req.body.mapping || '{}');
    } catch {
      return res.status(400).json({ error: 'Invalid mapping JSON.' });
    }

    // ── Parse Excel / CSV ──────────────────────────────────────────
    const workbook = XLSX.readFile(filePath);
    const sheet    = workbook.Sheets[workbook.SheetNames[0]];
    // header:1 → first row as header, defval:'', raw:false → all strings
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    if (rows.length < 2) {
      return res.status(422).json({ error: 'File has no data rows.' });
    }

    // Build column-index lookup from first row (headers)
    const headerRow = rows[0].map(h => (h || '').toString().trim());
    console.log('[uploadExcel] Headers:', headerRow);
    console.log('[uploadExcel] Mapping:', mapping);

    // Mapped field → column index (from user-provided mapping)
    const colIndex = {};
    for (const [fieldKey, excelColName] of Object.entries(mapping)) {
      if (!excelColName) continue;
      const idx = headerRow.findIndex(
        h => h.toLowerCase() === (excelColName || '').toLowerCase()
      );
      if (idx !== -1) colIndex[fieldKey] = idx;
    }

    // Raw column name (lowercased, stripped) → index — used as fallback
    const rawIdx = {};
    headerRow.forEach((h, i) => {
      if (h) rawIdx[h.toLowerCase().replace(/[\s_]/g, '')] = i;
    });

    // Common raw column name aliases for each semantic field
    const _fallbacks = {
      studentName: ['studentname', 'student'],
      firstName:   ['firstname', 'first', 'fname'],
      lastName:    ['lastname', 'last', 'lname', 'surname'],
      className:   ['classname', 'class', 'grade', 'std', 'standard'],
      section:     ['section', 'sec'],
      rollNumber:  ['rollnumber', 'rollno', 'roll', 'admno', 'admissionno', 'srno', 'sr', 'regno', 'reg'],
      dob:         ['dob', 'dateofbirth', 'birthdate', 'birth', 'birthdt'],
      parentName:  ['parentname', 'fathername', 'father', 'guardian', 'parent'],
      phone:       ['phone', 'mobile', 'fathermobno', 'fathermobile', 'mob', 'mobileno', 'phoneno', 'contact', 'fatherno'],
      address:     ['address', 'addr'],
      teacherName: ['teachername', 'teacher'],
    };

    // Helper: cell value — mapped field first, then raw-column fallback
    const cell = (row, key) => {
      if (colIndex[key] !== undefined) {
        return (row[colIndex[key]] || '').toString().trim();
      }
      for (const fb of (_fallbacks[key] || [])) {
        if (rawIdx[fb] !== undefined) return (row[rawIdx[fb]] || '').toString().trim();
      }
      return '';
    };

    const dataRows = rows.slice(1).filter(r => r.some(c => (c || '').toString().trim()));
    console.log('[uploadExcel] Data rows:', dataRows.length);

    // ── Resolve principalId from the SELECTED client ──────────────
    // Use the client's linked principal when available.
    // If no schoolCode or no registered principal, fall back to using
    // clientId directly so data is ALWAYS saved without blocking the vendor.
    const client = await Client.findById(clientId).lean();
    if (!client) return res.status(404).json({ error: 'Client not found.' });

    const selectedSchoolCode = (client.schoolCode || '').toUpperCase();
    let principalId = clientId.toString(); // default: use clientId as namespace

    if (selectedSchoolCode) {
      const principalUser = await User.findOne({
        role: 'principal',
        schoolCode: selectedSchoolCode,
      }).select('_id').lean();
      if (principalUser) {
        principalId = principalUser._id.toString();
      }
    }

    console.log(`[uploadExcel] Saving for clientId=${clientId} schoolCode="${selectedSchoolCode}" principalId=${principalId}`);

    // ── Build data sets ────────────────────────────────────────────
    const classSet     = new Map(); // key → { name, principalId }
    const studentList  = [];       // { type, name, classOrDept, phone, ... }
    const teacherMap   = new Map(); // teacherName → Set of classes

    for (const row of dataRows) {
      const className  = cell(row, 'className');
      const section    = cell(row, 'section');
      const fullClass  = section ? `${className} - ${section}` : className;

      if (className) {
        const classKey = fullClass.toLowerCase();
        if (!classSet.has(classKey)) classSet.set(classKey, fullClass);
      }

      // Student name: always try firstName + lastName first (most Excel files split them),
      // then fall back to the studentName mapping if neither part is present.
      const firstName = cell(row, 'firstName');
      const lastName  = cell(row, 'lastName');
      let studentName = (firstName || lastName)
        ? `${firstName} ${lastName}`.trim()
        : cell(row, 'studentName');

      console.log(`[uploadExcel] Row student – firstName="${firstName}" lastName="${lastName}" resolved="${studentName}" class="${fullClass}"`);

      // Push the student even when some fields are missing; only skip truly blank rows
      if (studentName || fullClass) {
        studentList.push({
          type:        'student',
          name:        studentName || 'Unknown',
          classOrDept: fullClass,
          phone:       cell(row, 'phone'),
          address:     cell(row, 'address'),
          principalId,
        });
      }

      const teacherName = cell(row, 'teacherName');
      if (teacherName) {
        if (!teacherMap.has(teacherName)) teacherMap.set(teacherName, new Set());
        if (fullClass) teacherMap.get(teacherName).add(fullClass);
      }
    }

    // ── Bulk upsert classes ────────────────────────────────────────
    let classesCreated = 0;
    const classBulk = [...classSet.values()].map(name => ({
      updateOne: {
        filter: { name, principalId },
        update: { $setOnInsert: { name, principalId } },
        upsert: true,
      },
    }));
    if (classBulk.length) {
      await SchoolClass.bulkWrite(classBulk, { ordered: false });
      // Count all unique classes found in the file (new OR already existing)
      classesCreated = classBulk.length;
    }

    // ── Bulk upsert students ───────────────────────────────────────
    let studentsAdded = 0;
    if (studentList.length) {
      const studentBulk = studentList.map(s => ({
        updateOne: {
          filter: s.phone
            ? { type: 'student', phone: s.phone, principalId }
            : { type: 'student', name: s.name, classOrDept: s.classOrDept, principalId },
          update: {
            $setOnInsert: { type: s.type, principalId },
            $set: { name: s.name, classOrDept: s.classOrDept, phone: s.phone, address: s.address },
          },
          upsert: true,
        },
      }));
      const r = await SchoolMember.bulkWrite(studentBulk, { ordered: false });
      // upsertedCount = truly new records; matchedCount = existing updated
      studentsAdded = r.upsertedCount + (r.matchedCount || 0);
      console.log(`[uploadExcel] students bulkWrite: upserted=${r.upsertedCount} matched=${r.matchedCount} total=${studentsAdded}`);
    }

    // ── Bulk upsert teachers ───────────────────────────────────────
    let teachersAdded = 0;
    if (teacherMap.size) {
      const teacherBulk = [...teacherMap.entries()].map(([name, classes]) => {
        const classOrDept = [...classes].join(', ');
        return {
          updateOne: {
            filter: { type: 'teacher', name, principalId },
            update: { $setOnInsert: { type: 'teacher', name, classOrDept, principalId } },
            upsert: true,
          },
        };
      });
      const r = await SchoolMember.bulkWrite(teacherBulk, { ordered: false });
      teachersAdded = r.upsertedCount;
    }

    // Clean up temp file
    fs.unlink(filePath, () => {});

    console.log(`[uploadExcel] clientId=${clientId} principalId=${principalId} classes=${classesCreated} students=${studentsAdded} teachers=${teachersAdded}`);
    return res.json({
      success: true,
      classesCreated,
      studentsAdded,
      teachersAdded,
      totalRows: dataRows.length,
    });
  } catch (err) {
    console.error('[uploadExcel]', err);
    if (filePath) fs.unlink(filePath, () => {});
    return res.status(500).json({ error: 'Failed to process Excel file.' });
  }
};

/**
 * GET /api/vendor/debug/school?clientId=<id>
 * Diagnostic endpoint – returns raw DB counts for the school linked to a client.
 */
exports.debugSchoolData = async (req, res) => {
  try {
    const { clientId } = req.query;
    if (!clientId) return res.status(400).json({ error: 'clientId required' });

    const Client      = require('../models/Client');
    const SchoolClass  = require('../models/SchoolClass');
    const SchoolMember = require('../models/SchoolMember');
    const User         = require('../models/User');

    const client = await Client.findById(clientId).lean();
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const schoolCode = (client.schoolCode || '').toUpperCase();
    const principal  = schoolCode
      ? await User.findOne({ role: 'principal', schoolCode }).select('_id schoolCode name').lean()
      : null;

    const principalId = principal ? principal._id.toString() : null;

    const memberBreakdown = principalId
      ? await SchoolMember.aggregate([
          { $match: { principalId } },
          { $group: { _id: '$type', count: { $sum: 1 } } },
        ])
      : [];

    const classCount = principalId
      ? await SchoolClass.countDocuments({ principalId })
      : 0;

    const sampleStudents = principalId
      ? await SchoolMember.find({ principalId, type: 'student' }).limit(3).select('name classOrDept phone principalId type').lean()
      : [];

    const sampleWithoutType = principalId
      ? await SchoolMember.find({ principalId, type: { $exists: false } }).limit(3).lean()
      : [];

    return res.json({
      clientSchoolCode: client.schoolCode,
      normalizedSchoolCode: schoolCode,
      principal: principal ? { id: principal._id, name: principal.name, schoolCode: principal.schoolCode } : null,
      principalId,
      classCount,
      memberBreakdown,
      sampleStudents,
      sampleWithoutType,
    });
  } catch (err) {
    console.error('[debugSchoolData]', err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/vendor/schools?vendorId=<id>&search=<query>
 *
 * Returns the list of schools (clients) this vendor has registered,
 * optionally filtered by a search string (matches schoolName or schoolCode).
 * Used by the Quick Capture Setup screen's school selector.
 *
 * Response: [ { id, name, code } ]
 */
exports.getVendorSchools = async (req, res) => {
  try {
    const { vendorId, search } = req.query;
    if (!vendorId) {
      return res.status(400).json({ error: 'vendorId is required.' });
    }

    const filter = { vendorId };

    if (search && search.trim()) {
      const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { schoolName: regex },
        { schoolCode: regex },
      ];
    }

    const clients = await Client.find(filter)
      .sort({ schoolName: 1 })
      .select('schoolName schoolCode')
      .lean();

    return res.json(
      clients.map(c => ({
        id:   c._id.toString(),
        name: c.schoolName,
        code: c.schoolCode || '',
      }))
    );
  } catch (err) {
    console.error('[getVendorSchools]', err);
    return res.status(500).json({ error: err.message || 'Failed to load schools.' });
  }
};

// ── Product Image Upload (stores on VPS, returns permanent URLs) ─────────────
const _productImgDir = path.join(__dirname, '..', 'uploads', 'products', 'images');
if (!fs.existsSync(_productImgDir)) fs.mkdirSync(_productImgDir, { recursive: true });

const _productImgStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, _productImgDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

exports.uploadProductImagesMiddleware = multer({
  storage: _productImgStorage,
  limits: { files: 10, fileSize: 20 * 1024 * 1024 },
}).array('images', 10);

exports.uploadProductImages = (req, res) => {
  const files = Array.isArray(req.files) ? req.files : [];
  if (!files.length) return res.status(400).json({ error: 'No images uploaded' });
  const baseUrl = process.env.VPS_BASE_URL || 'http://72.62.241.170';
  const urls = files.map((f) => `${baseUrl}/uploads/products/images/${f.filename}`);
  return res.json({ urls });
};

// ── Products ──────────────────────────────────────────────────────────────────
const Product = require('../models/Product');

/**
 * GET /api/vendor/products
 * Returns all visible products from the shared product catalogue.
 * Products are created via the Enterprise Admin Portal.
 */
// ── School-Photo upload (multer) ────────────────────────────────────
const SchoolPhoto = require('../models/SchoolPhoto');

const schoolPhotosDir = path.join(__dirname, '..', 'uploads', 'school-photos');
if (!fs.existsSync(schoolPhotosDir)) fs.mkdirSync(schoolPhotosDir, { recursive: true });

const _schoolPhotoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, schoolPhotosDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext    = path.extname(file.originalname).toLowerCase();
    cb(null, `${unique}${ext}`);
  },
});

const _schoolPhotoUpload = multer({
  storage: _schoolPhotoStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB per photo
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) return cb(null, true);
    cb(new Error('Only JPEG / PNG / WEBP / GIF images are allowed.'));
  },
});

/** Middleware – attach to the upload-school-photos route */
exports.uploadSchoolPhotosMiddleware = _schoolPhotoUpload.array('photos', 50);

/**
 * POST /api/vendor/school-photos
 * Body (multipart): schoolId, className, date (YYYY-MM-DD), photos[]
 */
exports.uploadSchoolPhotos = async (req, res) => {
  try {
    const { schoolId, className, date } = req.body;
    if (!schoolId || !className || !date) {
      return res.status(400).json({ error: 'schoolId, className and date are required.' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date must be in YYYY-MM-DD format.' });
    }
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No photos uploaded.' });
    }

    const BASE = (process.env.ADMIN_PORTAL_URL || `http://localhost:${process.env.PORT || 5001}`).replace(/\/$/, '');
    const docs = files.map((f) => ({
      schoolId,
      className: className.trim(),
      date,
      imageUrl:  `${BASE}/uploads/school-photos/${f.filename}`,
      imagePath: f.path,
      filename:  f.filename,
    }));

    const saved = await SchoolPhoto.insertMany(docs);
    return res.json({ success: true, count: saved.length, photos: saved.map(p => ({ _id: p._id, imageUrl: p.imageUrl })) });
  } catch (err) {
    console.error('[uploadSchoolPhotos]', err);
    return res.status(500).json({ error: 'Failed to save photos.' });
  }
};

/**
 * GET /api/vendor/school-photos/:schoolId
 * Returns all photos for a school grouped by date then by class.
 * Optional query: ?className=Class 9-A  ?date=2026-01-01
 */
exports.getSchoolPhotos = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const filter = { schoolId };
    if (req.query.className) filter.className = req.query.className;
    if (req.query.date)      filter.date      = req.query.date;

    const photos = await SchoolPhoto.find(filter)
      .select('_id imageUrl className date createdAt')
      .sort({ date: -1, createdAt: -1 })
      .lean();

    // Group: { date → { className → [imageUrl] } }
    const grouped = {};
    for (const p of photos) {
      if (!grouped[p.date]) grouped[p.date] = {};
      if (!grouped[p.date][p.className]) grouped[p.date][p.className] = [];
      grouped[p.date][p.className].push({ _id: p._id, imageUrl: p.imageUrl });
    }

    return res.json({ success: true, total: photos.length, grouped });
  } catch (err) {
    console.error('[getSchoolPhotos]', err);
    return res.status(500).json({ error: 'Failed to fetch photos.' });
  }
};

/**
 * DELETE /api/vendor/school-photos/:photoId
 * Deletes a single photo from DB and disk.
 */
exports.deleteSchoolPhoto = async (req, res) => {
  try {
    const photo = await SchoolPhoto.findByIdAndDelete(req.params.photoId).lean();
    if (!photo) return res.status(404).json({ error: 'Photo not found.' });
    if (photo.imagePath && fs.existsSync(photo.imagePath)) {
      fs.unlinkSync(photo.imagePath);
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('[deleteSchoolPhoto]', err);
    return res.status(500).json({ error: 'Failed to delete photo.' });
  }
};

exports.getProducts = async (req, res) => {
  try {
    const filter = { isVisible: true };
    if (req.query.category) filter.category = req.query.category;
    const rawProducts = await Product.find(filter)
      .select('_id name description category vendorPrice clientPrice publicPrice principalPrice studentPrice images thumbnailImage unit applicableFor')
      .sort({ createdAt: -1 })
      .lean();

    // Resolve image paths to full URLs, rewriting any stored 5000 port refs or
    // localhost refs to the requesting host so Flutter always gets a reachable URL.
    const serverBase = `${req.protocol}://${req.get('host')}`;
    const toFullUrl = (src) => {
      if (!src) return src;
      if (src.startsWith('http://') || src.startsWith('https://')) {
        try {
          const u = new URL(src);
          // Rewrite any localhost or EP-backend (5000) URL to use this server's host
          if (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.port === '5000') {
            return `${serverBase}${u.pathname}${u.search}`;
          }
        } catch (_) {}
        return src;
      }
      // Relative path → prepend this server's base
      return `${serverBase}${src.startsWith('/') ? '' : '/'}${src}`;
    };
    const products = rawProducts.map((p) => ({
      ...p,
      images: (p.images || []).map(toFullUrl),
      thumbnailImage: toFullUrl(p.thumbnailImage),
    }));

    return res.json({ success: true, data: products });
  } catch (err) {
    console.error('[getProducts]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch products.' });
  }
};
