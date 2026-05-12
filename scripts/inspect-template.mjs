// Inspect a template's canvas JSON structure
const IDS = [
  '69ff42336c6df7cfdb8d4c96', // Template 001
  '69f4a7d3993914facc66ceb5', // pvc id card
];
const BACKEND = 'http://localhost:5000';

for (const id of IDS) {
  const r = await fetch(`${BACKEND}/api/templates/${id}`);
  const j = await r.json();
  const d = j.data;
  const dRaw = typeof d.designData === 'string' ? JSON.parse(d.designData) : d.designData;
  console.log(`\n===== Template: ${d.templateName} (${id}) =====`);
  console.log('designData top keys:', Object.keys(dRaw || {}).join(', '));

  const cv = dRaw?.canvas || dRaw?.pages?.[0]?.canvas;
  if (!cv) {
    console.log('No canvas found!');
    continue;
  }
  console.log('canvas keys:', Object.keys(cv).join(', '));
  const bg = cv.background;
  const bgStr = JSON.stringify(bg) || '';
  console.log('background type:', typeof bg, ', preview:', bgStr.slice(0, 80));
  const bgi = cv.backgroundImage;
  console.log('backgroundImage:', JSON.stringify(bgi)?.slice(0, 80) ?? '(none)');
  const oi = cv.overlayImage;
  console.log('overlayImage:', JSON.stringify(oi)?.slice(0, 80) ?? '(none)');
  const objs = cv.objects || [];
  console.log('objects count:', objs.length);
  for (let i = 0; i < objs.length; i++) {
    const o = objs[i];
    const src = o.src || '';
    console.log(`  obj[${i}] type=${o.type} src_preview=${src.slice(0, 50)}`);
    if (o.objects) {
      for (let j = 0; j < o.objects.length; j++) {
        const oo = o.objects[j];
        const oSrc = oo.src || '';
        console.log(`    nested[${j}] type=${oo.type} src_preview=${oSrc.slice(0, 50)}`);
      }
    }
  }
}
