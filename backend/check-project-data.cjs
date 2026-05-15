const { MongoClient } = require('mongodb');

const uri = "mongodb+srv://aaryaleap_db_user:ZXCvbnm12345678@cluster0.3zq4ych.mongodb.net/myapp?retryWrites=true&w=majority&authSource=admin";

async function checkProjectData() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('myapp');
    
    // Check the specific project ID from the URL
    const projectId = '69f359425551519f2cfbbf4d';
    
    // Find records for this project
    const records = await db.collection('project_data_records')
      .find({ projectId })
      .limit(10)
      .toArray();
    
    console.log(`Found ${records.length} records for project ${projectId}\n`);
    
    if (records.length > 0) {
      records.forEach((r, i) => {
        console.log(`${i + 1}. Name: ${r.name}, School Code: ${r.school_code}, Roll: ${r.roll_number}`);
        if (r.photo) {
          console.log(`   Photo: ${String(r.photo).substring(0, 100)}`);
        }
        console.log();
      });
    } else {
      // Try to get any records
      const allRecords = await db.collection('project_data_records').find({}).limit(5).toArray();
      console.log(`\nNo records for this project. Sample project IDs from database:`);
      allRecords.forEach(r => {
        console.log(`- ${r.projectId || 'no projectId'}: ${r.name}`);
      });
    }
  } finally {
    await client.close();
  }
}

checkProjectData();
