import mongoose from 'mongoose';

function normalizeMongoUri(rawUri?: string): string {
  if (!rawUri) {
    throw new Error('MONGODB_URI or MONGO_URI environment variable is not defined');
  }

  let value = rawUri.trim();
  const quotedMatch = value.match(/^(["'])(.*)\1$/);
  if (quotedMatch) {
    value = quotedMatch[2].trim();
  }

  // Accept common misconfiguration where env value includes the key prefix.
  const prefixedMatch = value.match(/^(MONGODB_URI|MONGO_URI)\s*=\s*(.+)$/i);
  if (prefixedMatch) {
    value = prefixedMatch[2].trim();
  }

  if (!/^mongodb(\+srv)?:\/\//i.test(value)) {
    const preview = value.length > 48 ? `${value.slice(0, 48)}...` : value;
    throw new Error(
      `Invalid MongoDB URI format in MONGODB_URI/MONGO_URI. ` +
      `Value must start with "mongodb://" or "mongodb+srv://". Received: "${preview}"`
    );
  }

  return value;
}

export async function connectDB() {
  try {
    const mongoUri = normalizeMongoUri(process.env.MONGODB_URI || process.env.MONGO_URI);
    const dbName = mongoUri.includes('/') ? mongoUri.split('/').pop()?.split('?')[0] : 'unknown';

    await mongoose.connect(mongoUri);
    console.log('✓ MongoDB connected successfully', {
      database: dbName,
      host: mongoUri.includes('@') ? mongoUri.split('@')[1].split('/')[0] : 'unknown',
      uri: mongoUri.replace(/:[^:@]*@/, ':***@'),
    });
    return mongoose.connection;
  } catch (error) {
    console.error('✗ MongoDB connection failed:', error);
    console.error('  Attempted URI:', (process.env.MONGODB_URI || process.env.MONGO_URI)?.replace(/:[^:@]*@/, ':***@'));
    process.exit(1);
  }
}

export async function disconnectDB() {
  try {
    await mongoose.disconnect();
    console.log('✓ MongoDB disconnected');
  } catch (error) {
    console.error('✗ MongoDB disconnection failed:', error);
  }
}
