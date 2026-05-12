'use strict';
const fs = require('fs');
const src = fs.readFileSync('d:\\Shivam-bitch\\edumid\\lib\\features\\vendor\\screens\\vendor_screens.dart', 'utf-8');
// Find all occurrences
let idx = 0;
let count = 0;
while (true) {
  idx = src.indexOf('_VendorMemberListScreen(', idx);
  if (idx === -1) break;
  count++;
  const chunk = src.substring(idx - 60, idx + 120);
  console.log(`Occurrence ${count} at index ${idx}:`);
  console.log(JSON.stringify(chunk));
  console.log('---');
  idx += 20;
}
