const { MongoClient } = require('mongodb');

const uri = "mongodb+srv://aaryaleap_db_user:ZXCvbnm12345678@cluster0.3zq4ych.mongodb.net/myapp?retryWrites=true&w=majority&authSource=admin";

async function fixBrokenImages() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('myapp');
    const collection = db.collection('project_data_records');

    // Find records with broken image URLs (filenames that would 404)
    const broken = await collection
      .find({
        photo: {
          $regex: '^145_.*\\.jpg$|^\\d+_\\d+.*\\.jpg$',
          $options: 'i'
        }
      })
      .toArray();

    console.log(`Found ${broken.length} records with potentially broken image URLs`);

    if (broken.length > 0) {
      // Clear the broken photo URLs
      const result = await collection.updateMany(
        {
          photo: {
            $regex: '^145_.*\\.jpg$|^\\d+_\\d+.*\\.jpg$',
            $options: 'i'
          }
        },
        {
          $set: { photo: null }
        }
      );

      console.log(`Cleared ${result.modifiedCount} records with broken image URLs`);
    }

    // Check for data URLs (base64) which are not persistent
    const dataUrlCount = await collection.countDocuments({
      photo: { $regex: '^data:' }
    });

    if (dataUrlCount > 0) {
      console.log(`Found ${dataUrlCount} records with base64 dataURLs - clearing them...`);
      await collection.updateMany(
        { photo: { $regex: '^data:' } },
        { $set: { photo: null } }
      );
      console.log('Cleared base64 dataURLs');
    }

    console.log('Database cleanup complete!');
  } finally {
    await client.close();
  }
}

fixBrokenImages().catch(console.error);
