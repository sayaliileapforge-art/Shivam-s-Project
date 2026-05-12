const mongoose = require('mongoose');
require('dotenv').config();

const Client = require('./models/Client');
const Order  = require('./models/Order');

const clients = [
  {
    schoolName:  'Delhi Public School',
    address:     '34, Sector 12, Dwarka',
    city:        'New Delhi',
    contactName: 'Priya Sharma',
    phone:       '+91 98765 43210',
    email:       'admin@dps.edu.in',
    vendorId:    'vendor_001',
  },
  {
    schoolName:  'City Montessori School',
    address:     '12, Mahanagar Extension',
    city:        'Lucknow',
    contactName: 'Rakesh Verma',
    phone:       '+91 90001 22334',
    email:       'principal@cms.ac.in',
    vendorId:    'vendor_001',
  },
  {
    schoolName:  'St. Xavier\'s High School',
    address:     '7, Hill Road, Bandra',
    city:        'Mumbai',
    contactName: 'Sr. Maria D\'Souza',
    phone:       '+91 91234 56789',
    email:       'office@stxaviers.org',
    vendorId:    'vendor_001',
  },
];

const orders = [
  {
    title:          'ID Cards – Batch 2025',
    schoolName:     'Delhi Public School',
    stage:          'Printing',
    progress:       62,
    totalCards:     1248,
    completedCards: 774,
    vendorId:       'vendor_001',
  },
  {
    title:          'ID Cards – Batch 2025',
    schoolName:     'City Montessori School',
    stage:          'Data Upload',
    progress:       25,
    totalCards:     842,
    completedCards: 210,
    vendorId:       'vendor_001',
  },
  {
    title:          'Staff ID Cards 2025',
    schoolName:     'St. Xavier\'s High School',
    stage:          'Design',
    progress:       45,
    totalCards:     120,
    completedCards: 0,
    vendorId:       'vendor_001',
  },
  {
    title:          'Certificate – Grade 10',
    schoolName:     'Delhi Public School',
    stage:          'Proof',
    progress:       80,
    totalCards:     320,
    completedCards: 256,
    vendorId:       'vendor_001',
  },
  {
    title:          'ID Cards – New Admissions',
    schoolName:     'City Montessori School',
    stage:          'Draft',
    progress:       5,
    totalCards:     95,
    completedCards: 0,
    vendorId:       'vendor_001',
  },
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected.');

    await Client.deleteMany({});
    await Order.deleteMany({});
    console.log('Existing data cleared.');

    await Client.insertMany(clients);
    await Order.insertMany(orders);

    console.log('Sample data inserted successfully.');
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB disconnected.');
  }
}

seed();
