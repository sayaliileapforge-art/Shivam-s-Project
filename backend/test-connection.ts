import 'dotenv/config';
import { MongoClient } from 'mongodb';

async function testConnection() {
  const mongoUri = process.env.MONGODB_URI;
  
  if (!mongoUri) {
    console.error('❌ MONGODB_URI not found in .env');
    return;
  }

  console.log('Testing MongoDB Connection...');
  console.log(`📍 Connection String: ${mongoUri.slice(0, 50)}...`);
  
  const client = new MongoClient(mongoUri, {
    connectTimeoutMS: 10000,
    serverSelectionTimeoutMS: 10000,
  });

  try {
    console.log('\n⏳ Connecting to MongoDB...');
    await client.connect();
    console.log('✅ Successfully connected to MongoDB');

    // Get database info
    const admin = client.db('admin');
    const serverStatus = await admin.command({ ping: 1 });
    console.log('✅ Ping successful:', serverStatus);

    // List databases
    const databases = await admin.listDatabases();
    console.log('\n📚 Available databases:');
    databases.databases.forEach(db => {
      console.log(`  - ${db.name}`);
    });

  } catch (error) {
    console.error('\n❌ Connection failed:');
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
      console.error(`Code: ${(error as any).code}`);
      console.error(`CodeName: ${(error as any).codeName}`);
    }
    console.error('\n💡 Troubleshooting steps:');
    console.error('1. Check your MongoDB Atlas IP whitelist: https://cloud.mongodb.com/v2');
    console.error('2. Verify username and password are correct');
    console.error('3. Ensure the connection string has proper credentials');
    console.error('4. Check if the user exists in the cluster');
  } finally {
    await client.close();
    console.log('\n✓ Connection closed');
  }
}

testConnection();
