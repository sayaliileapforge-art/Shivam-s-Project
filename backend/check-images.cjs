const { MongoClient } = require('mongodb');

const uri = "mongodb+srv://aaryaleap_db_user:ZXCvbnm12345678@cluster0.3zq4ych.mongodb.net/myapp?retryWrites=true&w=majority&authSource=admin";

async function checkImages() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    console.log('Connected to MongoDB\n');
    const db = client.db('myapp');
    const collection = db.collection('project_data_records');

    // Find all records with photos
    const withPhotos = await collection.find({ photo: { $exists: true, $ne: null } }).limit(10).toArray();
    
    console.log(`Found ${withPhotos.length} records with photos:\n`);
    withPhotos.forEach((r, i) => {
      console.log(`${i + 1}. Name: ${r.name}`);
      console.log(`   Photo: ${String(r.photo).substring(0, 100)}`);
      console.log(`   Type: ${r.photo.startsWith ? (r.photo.startsWith('data:') ? 'dataURL' : r.photo.startsWith('/') ? 'relative path' : 'other') : 'object'}\n`);
    });

    // Count different types
    const dataUrlCount = await collection.countDocuments({ photo: { $regex: '^data:' } });
    const pathCount = await collection.countDocuments({ photo: { $regex: '^/' } });
    const otherCount = await collection.countDocuments({ photo: { $exists: true, $ne: null, $not: { $regex: '^data:|^/' } } });

    console.log(`\n--- Summary ---`);
    console.log(`dataURLs: ${dataUrlCount}`);
    console.log(`Server paths (/...): ${pathCount}`);
    console.log(`Other formats: ${otherCount}`);
  } finally {
    await client.close();
  }
}

checkImages();
