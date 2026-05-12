// Diagnostic: show exactly what the API returns for designData
const IDS = [
  '69ff42336c6df7cfdb8d4c96', // Template 001
  '69f4a7d3993914facc66ceb5', // pvc id card
];
const BACKEND = 'http://localhost:5000';

for (const id of IDS) {
  const r = await fetch(`${BACKEND}/api/templates/${id}`);
  const j = await r.json();
  const tpl = j.data;
  console.log(`\n===== ${tpl?.templateName} =====`);

  const dd = tpl?.designData;
  if (dd === null || dd === undefined) {
    console.log('designData: NULL/UNDEFINED');
    continue;
  }
  console.log('designData type:', typeof dd);
  if (typeof dd === 'string') {
    console.log('designData (first 200):', dd.slice(0, 200));
    const parsed = JSON.parse(dd);
    console.log('parsed top keys:', Object.keys(parsed).join(', '));
    if (parsed.canvasJSON) {
      const inner = typeof parsed.canvasJSON === 'string' ? JSON.parse(parsed.canvasJSON) : parsed.canvasJSON;
      console.log('canvasJSON top keys:', Object.keys(inner || {}).join(', '));
      console.log('canvasJSON.pages:', inner?.pages === null ? 'null' : (Array.isArray(inner?.pages) ? `array[${inner.pages.length}]` : typeof inner?.pages));
      console.log('canvasJSON.canvas type:', typeof inner?.canvas, 'keys:', Object.keys(inner?.canvas || {}).join(', '));
    }
  } else if (typeof dd === 'object') {
    console.log('designData top keys:', Object.keys(dd).join(', '));
    if (dd.canvasJSON) {
      const cj = dd.canvasJSON;
      console.log('canvasJSON type:', typeof cj);
      if (typeof cj === 'string') {
        const parsed = JSON.parse(cj);
        console.log('canvasJSON (parsed) top keys:', Object.keys(parsed || {}).join(', '));
        console.log('canvasJSON.pages:', parsed?.pages === null ? 'null' : (Array.isArray(parsed?.pages) ? `array[${parsed.pages.length}]` : typeof parsed?.pages));
        console.log('canvasJSON.canvas type:', typeof parsed?.canvas, 'keys:', Object.keys(parsed?.canvas || {}).join(', '));
        console.log('canvasJSON.objects:', Array.isArray(parsed?.objects) ? `array[${parsed.objects.length}]` : typeof parsed?.objects);
        console.log('canvasJSON.version:', parsed?.version);
      } else if (typeof cj === 'object') {
        console.log('canvasJSON (object) top keys:', Object.keys(cj).join(', '));
        console.log('canvasJSON.pages:', cj.pages === null ? 'null' : (Array.isArray(cj.pages) ? `array[${cj.pages.length}]` : typeof cj.pages));
        console.log('canvasJSON.canvas type:', typeof cj.canvas, 'keys:', Object.keys(cj.canvas || {}).join(', '));
        console.log('canvasJSON.objects:', Array.isArray(cj.objects) ? `array[${cj.objects.length}]` : typeof cj.objects);
        console.log('canvasJSON.version:', cj.version);
      }
    } else {
      console.log('No canvasJSON field in designData');
      console.log('canvas type:', typeof dd.canvas, 'canvas keys:', Object.keys(dd.canvas || {}).join(', '));
      console.log('pages:', dd.pages === null ? 'null' : (Array.isArray(dd.pages) ? `array[${dd.pages.length}]` : typeof dd.pages));
    }
  }
}
