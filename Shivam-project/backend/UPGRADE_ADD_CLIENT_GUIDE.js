/**
 * BACKEND UPGRADE GUIDE - Add Client Screen
 * 
 * This guide shows how to update your Node.js backend to support
 * the new AddClientScreen fields.
 */

// =================================================================
// STEP 1: Update Client Schema (models/Client.js)
// =================================================================

const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  // --- EXISTING FIELDS --- (keep as is)
  schoolName: {
    type: String,
    required: true,
  },
  contactName: String,
  phone: {
    type: String,
    required: true,
  },
  email: String,
  address: String,
  city: String,

  // --- NEW FIELDS: GST Details ---
  gstNumber: String,
  gstName: String,
  gstStateCode: String,
  gstAddress: String,

  // --- NEW FIELDS: Location ---
  state: String,
  district: String,
  pincode: String,

  // --- NEW FIELDS: Type & Delivery ---
  clientType: {
    type: String,
    enum: ['School', 'Coaching', 'Other'],
    required: true, // Make it required since frontend validates
  },
  deliveryMode: {
    type: String,
    enum: ['Bus', 'Courier', null],
    default: null,
  },
  busStop: String,
  route: String,

  // --- NEW FIELD: Extra ---
  schoolUniqueId: String,

  // --- EXISTING ---
  vendorId: {
    type: String,
    required: true,
    index: true, // Better performance
  },

  // Metadata
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Client', clientSchema);


// =================================================================
// STEP 2: Update Vendor Controller (controllers/vendorController.js)
// =================================================================

// OLD createClient (KEEP the same structure, just handle new fields)
exports.createClient = async (req, res) => {
  try {
    // Destructure all fields from request
    const {
      // Existing
      schoolName,
      contactName,
      phone,
      email,
      address,
      city,
      vendorId,
      
      // NEW: GST
      gstNumber,
      gstName,
      gstStateCode,
      gstAddress,
      
      // NEW: Location
      state,
      district,
      pincode,
      
      // NEW: Type & Delivery
      clientType,
      deliveryMode,
      busStop,
      route,
      
      // NEW: Extra
      schoolUniqueId,
    } = req.body;

    // VALIDATION: Required fields
    if (!schoolName || !phone) {
      return res.status(400).json({
        error: 'School name and phone are required.',
      });
    }

    if (!clientType || !['School', 'Coaching', 'Other'].includes(clientType)) {
      return res.status(400).json({
        error: 'Please select a valid client type.',
      });
    }

    // VALIDATION: Phone format (optional but recommended)
    if (!/^[0-9\s\-\+]{10,}$/.test(phone)) {
      return res.status(400).json({
        error: 'Phone number must be at least 10 digits.',
      });
    }

    // VALIDATION: Email format if provided
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        error: 'Please enter a valid email address.',
      });
    }

    // VALIDATION: Bus Stop & Route required if delivery mode is Bus
    if (deliveryMode === 'Bus' && (!busStop || !route)) {
      return res.status(400).json({
        error: 'Bus stop and route are required for Bus delivery.',
      });
    }

    // Create new client with ALL fields
    const client = new Client({
      // Existing
      schoolName: schoolName.trim(),
      contactName: contactName?.trim(),
      phone: phone.trim(),
      email: email?.trim().toLowerCase(),
      address: address?.trim(),
      city: city?.trim(),
      vendorId: vendorId.trim(),
      
      // NEW: GST
      gstNumber: gstNumber?.trim(),
      gstName: gstName?.trim(),
      gstStateCode: gstStateCode?.trim(),
      gstAddress: gstAddress?.trim(),
      
      // NEW: Location
      state: state?.trim(),
      district: district?.trim(),
      pincode: pincode?.trim(),
      
      // NEW: Type & Delivery
      clientType: clientType.trim(),
      deliveryMode: deliveryMode?.trim(),
      busStop: busStop?.trim(),
      route: route?.trim(),
      
      // NEW: Extra
      schoolUniqueId: schoolUniqueId?.trim(),
    });

    await client.save();

    res.status(201).json({
      success: true,
      message: 'Client created successfully.',
      client: client,
    });
  } catch (error) {
    console.error('[createClient] Error:', error);
    res.status(500).json({
      error: 'Failed to create client. ' + error.message,
    });
  }
};

// NO CHANGES NEEDED to other endpoints like:
// - getVendorClients
// - getVendorClientById
// - deleteClient
// etc.
// They will automatically work with new fields!


// =================================================================
// STEP 3: Migration Script (optional but recommended)
// =================================================================

/**
 * Run this once to update existing clients with new fields
 * 
 * Usage: node migrate-clients.js
 */

const mongoose = require('mongoose');
const Client = require('./models/Client');

async function migrateClients() {
  try {
    const result = await Client.updateMany(
      {}, // Match all documents
      {
        // Set defaults for new fields if they don't exist
        $set: {
          clientType: 'School', // Default type
          deliveryMode: null,
          gstNumber: null,
          gstName: null,
          gstStateCode: null,
          gstAddress: null,
          state: null,
          district: null,
          pincode: null,
          busStop: null,
          route: null,
          schoolUniqueId: null,
        },
      },
      { upsert: false }
    );

    console.log(`✅ Migration complete. Updated ${result.modifiedCount} clients.`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrateClients();


// =================================================================
// STEP 4: API Endpoint Testing
// =================================================================

/**
 * Test the new endpoint with all fields
 * 
 * curl -X POST http://localhost:5000/api/vendor/clients \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "schoolName": "Delhi Public School",
 *     "contactName": "Mr. Sharma",
 *     "phone": "+919876543210",
 *     "email": "dps@example.com",
 *     "address": "B-234, New Delhi",
 *     "city": "New Delhi",
 *     "vendorId": "vendor_001",
 *     "gstNumber": "22ABCDE1234F1Z5",
 *     "gstName": "DPS Pvt Ltd",
 *     "gstStateCode": "07",
 *     "gstAddress": "B-234, Registered Address",
 *     "clientType": "School",
 *     "state": "Delhi",
 *     "district": "Central Delhi",
 *     "pincode": "110001",
 *     "deliveryMode": "Bus",
 *     "busStop": "Kasturba Nagar",
 *     "route": "Route 10",
 *     "schoolUniqueId": "DPS-001"
 *   }'
 */


// =================================================================
// STEP 5: Response Examples
// =================================================================

/**
 * SUCCESS RESPONSE (201)
 */
{
  "success": true,
  "message": "Client created successfully.",
  "client": {
    "_id": "507f1f77bcf86cd799439011",
    "schoolName": "Delhi Public School",
    "contactName": "Mr. Sharma",
    "phone": "+919876543210",
    "email": "dps@example.com",
    "address": "B-234, New Delhi",
    "city": "New Delhi",
    "vendorId": "vendor_001",
    "gstNumber": "22ABCDE1234F1Z5",
    "gstName": "DPS Pvt Ltd",
    "gstStateCode": "07",
    "gstAddress": "B-234, Registered Address",
    "clientType": "School",
    "state": "Delhi",
    "district": "Central Delhi",
    "pincode": "110001",
    "deliveryMode": "Bus",
    "busStop": "Kasturba Nagar",
    "route": "Route 10",
    "schoolUniqueId": "DPS-001",
    "createdAt": "2024-03-27T10:30:00Z",
    "updatedAt": "2024-03-27T10:30:00Z"
  }
}

/**
 * VALIDATION ERROR (400)
 */
{
  "error": "Phone number must be at least 10 digits."
}

{
  "error": "School name and phone are required."
}

{
  "error": "Please select a valid client type."
}

{
  "error": "Bus stop and route are required for Bus delivery."
}


// =================================================================
// STEP 6: Database Migration SQL (if using direct MongoDB)
// =================================================================

// Run in MongoDB shell
db.clients.updateMany(
  {},
  {
    $set: {
      clientType: "School",
      deliveryMode: null,
      gstNumber: null,
      gstName: null,
      gstStateCode: null,
      gstAddress: null,
      state: null,
      district: null,
      pincode: null,
      busStop: null,
      route: null,
      schoolUniqueId: null
    }
  }
);

// Verify migration
db.clients.findOne();


// =================================================================
// STEP 7: Backward Compatibility
// =================================================================

/**
 * The backend remains backward compatible!
 * 
 * Old requests (without new fields) still work:
 */
{
  "schoolName": "School Name",
  "phone": "+919876543210",
  "vendorId": "vendor_001"
  // clientType will be required and must be provided
}

/**
 * All new fields are optional except:
 * - schoolName (existing, required)
 * - phone (existing, required)
 * - clientType (NEW, required)
 */


// =================================================================
// STEP 8: Deployment Checklist
// =================================================================

/**
 * Before deploying changes to production:
 * 
 * [ ] Update Client schema in models/Client.js
 * [ ] Update createClient validation in controllers/vendorController.js
 * [ ] Run migration script on production database
 * [ ] Test with new field values
 * [ ] Test backward compatibility (old data still works)
 * [ ] Update API documentation
 * [ ] Test on staging environment first
 * [ ] Monitor error logs after deployment
 * [ ] Communicate changes to frontend team
 */


// =================================================================
// STEP 9: Optional Enhancements
// =================================================================

/**
 * 1. GST VALIDATION (using external API)
 */
const validateGST = async (gstNumber) => {
  if (!gstNumber) return true; // Optional field
  
  // Validate format (15-character alphanumeric)
  const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  
  if (!gstRegex.test(gstNumber)) {
    throw new Error('Invalid GST format.');
  }
  
  // Optional: Check GST using Enlyft API or similar
  // const response = await fetch(`https://api.example.com/gst/${gstNumber}`);
  // if (!response.ok) throw new Error('GST not found');
  
  return true;
};

/**
 * 2. PINCODE VALIDATION & AUTO-FILL
 */
const getPincodeDetails = async (pincode) => {
  if (!pincode) return null;
  
  try {
    const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
    const data = await response.json();
    
    if (data[0].Status === 'Success') {
      return {
        state: data[0].PostOffice[0].State,
        district: data[0].PostOffice[0].District,
      };
    }
  } catch (error) {
    console.error('Pincode lookup failed:', error);
  }
  
  return null;
};

/**
 * 3. SEARCH INDEX FOR BETTER PERFORMANCE
 */
// In Client schema:
clientSchema.index({
  schoolName: 'text',
  city: 1,
  state: 1,
  clientType: 1,
  vendorId: 1,
});

// Usage: Search functionality
exports.searchClients = async (req, res) => {
  try {
    const { q, vendorId } = req.query;
    
    const results = await Client.find({
      $text: { $search: q },
      vendorId: vendorId,
    })
    .limit(20)
    .exec();
    
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * 4. BULK IMPORT FROM CSV
 */
const csv = require('csv-parser');
const fs = require('fs');

exports.bulkImportClients = async (req, res) => {
  try {
    const results = [];
    
    fs.createReadStream('clients.csv')
      .pipe(csv())
      .on('data', (row) => results.push(row))
      .on('end', async () => {
        const clients = results.map(row => ({
          ...row,
          vendorId: req.body.vendorId,
        }));
        
        const inserted = await Client.insertMany(clients);
        res.json({
          success: true,
          message: `${inserted.length} clients imported.`,
        });
      });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


// =================================================================
// DEPLOYMENT STEPS (Final)
// =================================================================

/**
 * 1. Stop Node.js server
 * 2. Pull latest code
 * 3. Update models/Client.js schema
 * 4. Run migration script: node migrate-clients.js
 * 5. Start Node.js server
 * 6. Monitor logs for errors
 * 7. Test endpoints with new fields
 * 8. Verify all clients still accessible (backward compatibility)
 */
