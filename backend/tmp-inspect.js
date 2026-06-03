const mongoose = require('mongoose');
require('dotenv').config();

const { Schema } = mongoose;
const TemplateSchema = new Schema({ name: String, layoutJSON: String }, { strict: false });
const ProductTemplate = mongoose.model('ProductTemplate', TemplateSchema);

async function check() {
  await mongoose.connect(process.env.MONGO_URI);
  const templates = await ProductTemplate.find({ name: /DEFAULT|pvc/i }).lean();
  for (const t of templates) {
    console.log('\n=== Template:', t.name, '===');
    if (!t.layoutJSON) { console.log('  No layoutJSON'); continue; }
    try {
      const parsed = JSON.parse(t.layoutJSON);
      const canvas = parsed.canvas || (parsed.pages && parsed.pages[0] && parsed.pages[0].canvas);
      if (!canvas || !canvas.objects) { console.log('  No canvas objects'); continue; }
      function walk(objs, prefix) {
        for (const obj of objs) {
          if (obj.type === 'group') walk(obj.objects || [], prefix + '  [group]>');
          else if (['text','i-text','textbox'].includes(obj.type)) {
            const txt = String(obj.text || '');
            if (txt.trim()) {
              const hex = Buffer.from(txt.slice(0,4)).toString('hex');
              console.log(prefix + 'TEXT[' + obj.type + ']: ' + JSON.stringify(txt.slice(0,80)) + 
                ' fill=' + obj.fill + ' fontSize=' + obj.fontSize +
                ' firstBytes=' + hex);
            }
          }
        }
      }
      walk(canvas.objects, '  ');
    } catch(e) { console.log('  parse error:', e.message); }
  }
  await mongoose.disconnect();
  console.log('\nDone.');
}
check().catch(e => { console.error('Error:', e.message); process.exit(1); });
