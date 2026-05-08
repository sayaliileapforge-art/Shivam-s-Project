/**
 * fixPhotoUrls.ts
 *
 * Fixes broken photo URLs in MongoDB DataRecords by:
 *   1. Listing ALL files currently on the Hostinger server via SFTP
 *   2. Loading all DataRecords that have a `photo` field
 *   3. For each record, normalising the stored URL filename and finding
 *      the best-matching actual file on the server
 *   4. Updating the MongoDB record with the correct URL
 *   5. Printing a table of fixed URLs and a few sample URLs to verify
 *
 * Run with:
 *   npx tsx scripts/fixPhotoUrls.ts
 */

import path   from 'path';
// Load .env from backend root regardless of cwd where the script is invoked
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import mongoose from 'mongoose';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const SftpClient = require('ssh2-sftp-client');

// ─── Config ───────────────────────────────────────────────────────────────────
const MONGO_URI    = (process.env.MONGODB_URI ?? process.env.MONGO_URI ?? '').trim();
const SFTP_HOST    = (process.env.SFTP_HOST     ?? '').trim();
const SFTP_PORT    = parseInt(process.env.SFTP_PORT ?? '22', 10);
const SFTP_USER    = (process.env.SFTP_USERNAME  ?? '').trim();
const SFTP_PASS    = (process.env.SFTP_PASSWORD  ?? '').trim();
const REMOTE_DIR   = (process.env.SFTP_REMOTE_DIR ?? '/var/www/uploads').replace(/\/$/, '');
const PUBLIC_BASE  = (process.env.SFTP_PUBLIC_URL ?? '').replace(/\/$/, '');

if (!MONGO_URI)   { console.error('MONGODB_URI not set'); process.exit(1); }
if (!SFTP_HOST)   { console.error('SFTP_HOST not set');   process.exit(1); }
if (!PUBLIC_BASE) { console.error('SFTP_PUBLIC_URL not set'); process.exit(1); }

// ─── Mongoose DataRecord model (inline, no import of compiled app) ────────────
const DataRecordSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    category:  { type: String },
    variables: { type: mongoose.Schema.Types.Mixed },
    status:    { type: String },
  },
  { timestamps: true },
);
const DataRecord = mongoose.model('DataRecord', DataRecordSchema);

// ─── Normalisation helpers (same logic as src/utils/normalizer.ts) ────────────
function normalize(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeFilename(filename: string): string {
  const noExt    = path.basename(filename, path.extname(filename));
  // Strip leading digits + separators (roll numbers, timestamps)
  const noPrefix = noExt.replace(/^\d+[_\s.\-]*/g, '');
  return normalize(noPrefix);
}

// ─── Choose best file when multiple normalize to the same key ─────────────────
// Prefer files WITHOUT a numeric timestamp prefix (e.g. 145_Vanshika > 1777884714977-145_Vanshika)
function scoreName(name: string): number {
  return /^\d{10,}-/.test(name) ? 0 : 1; // penalise timestamped names
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // 1. Connect to MongoDB
  console.log('\n[1/5] Connecting to MongoDB…');
  await mongoose.connect(MONGO_URI);
  console.log('      ✓ Connected');

  // 2. List all files on Hostinger via SFTP
  console.log(`\n[2/5] Listing files on ${SFTP_HOST}:${REMOTE_DIR} via SFTP…`);
  const sftp = new SftpClient();
  await sftp.connect({ host: SFTP_HOST, port: SFTP_PORT, username: SFTP_USER, password: SFTP_PASS });
  const entries: Array<{ name: string; type: string }> = await sftp.list(REMOTE_DIR);
  await sftp.end();

  const imageExts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);
  const serverFiles = entries
    .filter((e) => e.type === '-' && imageExts.has(path.extname(e.name).toLowerCase()))
    .map((e) => e.name);

  console.log(`      ✓ Found ${serverFiles.length} image files on server`);

  // 3. Build lookup: normalizedKey → best matching filename
  const lookup = new Map<string, string>();
  for (const filename of serverFiles) {
    const key     = normalizeFilename(filename);
    if (!key) continue;
    const current = lookup.get(key);
    if (!current || scoreName(filename) > scoreName(current)) {
      lookup.set(key, filename);
    }
  }
  console.log(`      ✓ Lookup index built with ${lookup.size} unique normalised keys`);

  // 4. Load all DataRecords with a photo field
  console.log('\n[3/5] Loading DataRecords with photo field…');
  const records = await DataRecord.find({
    'variables.photo': { $exists: true, $ne: '' },
  }).lean();
  console.log(`      ✓ Found ${records.length} records with a photo`);

  // 5. Fix URLs
  console.log('\n[4/5] Fixing URLs…');
  let fixed   = 0;
  let already = 0;
  let noMatch = 0;

  const sampleFixed:  Array<{ name: string; old: string; new: string }> = [];
  const sampleNoMatch: string[] = [];

  for (const rec of records) {
    const vars     = rec.variables as Record<string, string>;
    const photoUrl = vars.photo ?? '';
    if (!photoUrl) continue;

    // Extract filename from URL
    const currentFilename = path.basename(photoUrl);
    const key             = normalizeFilename(currentFilename);
    const correctFilename = lookup.get(key);

    if (!correctFilename) {
      noMatch++;
      if (sampleNoMatch.length < 5) sampleNoMatch.push(currentFilename);
      continue;
    }

    const correctUrl = `${PUBLIC_BASE}/uploads/${correctFilename}`;

    if (correctUrl === photoUrl) {
      already++;
      continue;
    }

    // Update the record
    const updatedVars = { ...vars, photo: correctUrl };
    await DataRecord.updateOne({ _id: rec._id }, { $set: { variables: updatedVars } });
    fixed++;

    if (sampleFixed.length < 10) {
      const studentName = String(
        vars['Name'] ?? vars['name'] ?? vars['StudentName'] ?? currentFilename,
      );
      sampleFixed.push({ name: studentName, old: photoUrl, new: correctUrl });
    }
  }

  // 6. Print results
  console.log('\n[5/5] Results:');
  console.log(`      ✓ Fixed    : ${fixed}`);
  console.log(`      ✓ Already correct: ${already}`);
  console.log(`      ✗ No match found : ${noMatch}`);

  if (sampleFixed.length > 0) {
    console.log('\n── Sample fixed URLs (verify these in browser) ──────────────────');
    for (const s of sampleFixed) {
      console.log(`  Student : ${s.name}`);
      console.log(`  OLD URL : ${s.old}`);
      console.log(`  NEW URL : ${s.new}`);
      console.log('');
    }
  }

  if (sampleNoMatch.length > 0) {
    console.log('── Could not match these filenames (no file found on server) ────');
    for (const n of sampleNoMatch) console.log(`  ${n}`);
  }

  // Print first 10 verifiable URLs from the server directly
  console.log('\n── 10 live photo URLs you can open in browser right now ─────────');
  const sample10 = serverFiles.slice(0, 10);
  for (const fn of sample10) {
    console.log(`  ${PUBLIC_BASE}/uploads/${fn}`);
  }

  await mongoose.disconnect();
  console.log('\n✓ Done. MongoDB disconnected.\n');
}

main().catch((err) => {
  console.error('Script error:', err);
  process.exit(1);
});
