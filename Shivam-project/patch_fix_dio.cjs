// patch_fix_dio.cjs – fix _dioWithAuth calls to pass the token
'use strict';
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'edumid', 'lib', 'features', 'vendor', 'screens', 'vendor_screens.dart');
let src = fs.readFileSync(FILE, 'utf-8');
const CRLF = src.includes('\r\n');
if (CRLF) src = src.replace(/\r\n/g, '\n');

function replace(label, oldStr, newStr) {
  if (!src.includes(oldStr)) {
    console.error(`ERROR [${label}]: not found:\n${JSON.stringify(oldStr.substring(0, 120))}`);
    process.exit(1);
  }
  src = src.replace(oldStr, newStr);
  console.log(`✅  ${label}`);
}

// ── Fix 1: _loadSummary in _VendorSchoolDetailScreenState ──────────────────
replace(
  'Fix _loadSummary _dioWithAuth call',
  `    try {
      final dio = await _dioWithAuth();
      if (dio == null) {
        setState(() => _loading = false);
        return;
      }
      final r = await dio.get('/api/vendor/clients/\$cid/school-summary');`,
  `    try {
      final token = await AuthService.instance.getStoredToken();
      final dio = _dioWithAuth(token);
      final r = await dio.get('/api/vendor/clients/\$cid/school-summary');`
);

// ── Fix 2: _loadClasses in _VendorClassListScreenState ────────────────────
replace(
  'Fix _loadClasses _dioWithAuth call',
  `    try {
      final dio = await _dioWithAuth();
      if (dio == null) {
        setState(() { _loading = false; _error = 'Not authenticated'; });
        return;
      }
      final r = await dio.get(
          '/api/vendor/clients/\${widget.clientId}/school-classes');`,
  `    try {
      final token = await AuthService.instance.getStoredToken();
      final dio = _dioWithAuth(token);
      final r = await dio.get(
          '/api/vendor/clients/\${widget.clientId}/school-classes');`
);

// ── Fix 3: _fetchMembers in _VendorMemberListScreenState ──────────────────
replace(
  'Fix _fetchMembers _dioWithAuth call',
  `    try {
      final dio = await _dioWithAuth();
      if (dio == null) {
        setState(() => _loadingMembers = false);
        return;
      }
      final r = await dio.get(
        '/api/vendor/clients/\${widget.clientId}/school-members',`,
  `    try {
      final token = await AuthService.instance.getStoredToken();
      final dio = _dioWithAuth(token);
      final r = await dio.get(
        '/api/vendor/clients/\${widget.clientId}/school-members',`
);

if (CRLF) src = src.replace(/\n/g, '\r\n');
fs.writeFileSync(FILE, src, 'utf-8');
console.log('\n✅  All _dioWithAuth calls fixed.');
