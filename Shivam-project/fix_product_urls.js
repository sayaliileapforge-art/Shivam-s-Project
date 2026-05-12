const mongoose = require('/root/shivam-backend/node_modules/mongoose');
const uri = 'mongodb+srv://aaryaleap_db_user:ZXCvbnm12345678@cluster0.3zq4ych.mongodb.net/myapp?retryWrites=true&w=majority&authSource=admin';
const vpsBase = 'http://72.62.241.170';

function fixUrl(u) {
  if (!u) return u;
  if (u.startsWith('http://') || u.startsWith('https://')) {
    try {
      const p = new URL(u);
      if (p.hostname === 'localhost' || p.hostname === '127.0.0.1' || p.port === '5000' || p.hostname === '192.168.0.103') {
        return vpsBase + p.pathname + p.search;
      }
    } catch(_) {}
    return u;
  }
  return vpsBase + (u.startsWith('/') ? '' : '/') + u;
}

mongoose.connect(uri).then(async () => {
  const Product = mongoose.model('Product', new mongoose.Schema({}, { strict: false }), 'products');
  const all = await Product.find({}).lean();
  let updated = 0;
  for (const p of all) {
    const imgs = (p.images || []).map(fixUrl);
    const thumb = fixUrl(p.thumbnailImage || '');
    const img = fixUrl(p.image || '');
    if (JSON.stringify(imgs) !== JSON.stringify(p.images) || thumb !== p.thumbnailImage || img !== p.image) {
      await Product.updateOne({ _id: p._id }, { $set: { images: imgs, thumbnailImage: thumb, image: img } });
      updated++;
      console.log('Updated:', p.name, '->', imgs[0]);
    }
  }
  console.log('Total updated:', updated);
  await mongoose.disconnect();
}).catch(e => { console.error(e); process.exit(1); });
