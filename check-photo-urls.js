import { MongoClient } from 'mongodb';

const uri = "mongodb+srv://aaryaleap_db_user:ZXCvbnm12345678@cluster0.3zq4ych.mongodb.net/myapp?retryWrites=true&w=majority&authSource=admin";

async function check() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('myapp');
    const records = await db.collection('project_data_records')
      .find({ photo: { $exists: true, $ne: null } })
      .limit(10)
      .toArray();
    
    console.log('Sample records with photo field:');
    records.forEach((r, i) => {
      const photo = String(r.photo || '').substring(0, 80);
      console.log(`${i+1}. Name: ${r.name}, Photo: ${photo}`);
    });
    console.log(`\nTotal records with photos: ${records.length}`);
  } finally {
    await client.close();
  }
}

check().catch(console.error);
