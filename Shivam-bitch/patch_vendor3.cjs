// patch_vendor3.cjs – applies remaining steps 4-7
'use strict';
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'edumid', 'lib', 'features', 'vendor', 'screens', 'vendor_screens.dart');

let src = fs.readFileSync(FILE, 'utf-8');
const CRLF = src.includes('\r\n');
if (CRLF) src = src.replace(/\r\n/g, '\n');

function replace(label, oldStr, newStr) {
  if (!src.includes(oldStr)) {
    console.error(`ERROR [${label}]: could not find target.\nExpected:\n${JSON.stringify(oldStr.substring(0, 120))}`);
    process.exit(1);
  }
  src = src.replace(oldStr, newStr);
  console.log(`✅  ${label}`);
}

// ── Step 4: Pass clientId + memberType when navigating to _VendorMemberListScreen ──
// File has CRLF normalized to LF; builder has 18 spaces indent; category uses \$ and \u2013
replace(
  '_VendorSectionScreen navigation → pass clientId + memberType',
  `                  builder: (_) => _VendorMemberListScreen(\n                    category: '\\$title \\u2013 \\$label',\n                    section: title,\n                    count: count,\n                    icon: catIcon,\n                    color: catColor,\n                  ),`,
  `                  builder: (_) => _VendorMemberListScreen(\n                    category: '\\$title \\u2013 \\$label',\n                    section: title,\n                    count: count,\n                    icon: catIcon,\n                    color: catColor,\n                    clientId: clientId,\n                    memberType: memberType,\n                  ),`
);

// ── Step 5: Add clientId + memberType to _VendorMemberListScreen StatefulWidget ──
replace(
  '_VendorMemberListScreen add clientId + memberType fields',
  `class _VendorMemberListScreen extends StatefulWidget {
  final String category;
  final String section;
  final int count;
  final IconData icon;
  final Color color;
  const _VendorMemberListScreen({
    required this.category,
    required this.section,
    required this.count,
    required this.icon,
    required this.color,
  });`,
  `class _VendorMemberListScreen extends StatefulWidget {
  final String category;
  final String section;
  final int count;
  final IconData icon;
  final Color color;
  final String clientId;
  final String memberType;
  const _VendorMemberListScreen({
    required this.category,
    required this.section,
    required this.count,
    required this.icon,
    required this.color,
    required this.clientId,
    required this.memberType,
  });`
);

// ── Step 6: Replace initState with _fetchMembers in _VendorMemberListScreenState ──
replace(
  '_VendorMemberListScreenState – add _loadingMembers and _fetchMembers',
  `class _VendorMemberListScreenState extends State<_VendorMemberListScreen> {
  late List<_VMemberEntry> _items;

  @override
  void initState() {
    super.initState();
    _items = [];
  }`,
  `class _VendorMemberListScreenState extends State<_VendorMemberListScreen> {
  late List<_VMemberEntry> _items;
  bool _loadingMembers = true;

  @override
  void initState() {
    super.initState();
    _items = [];
    _fetchMembers();
  }

  Future<void> _fetchMembers() async {
    if (widget.clientId.isEmpty) {
      setState(() => _loadingMembers = false);
      return;
    }
    try {
      final dio = await _dioWithAuth();
      if (dio == null) {
        setState(() => _loadingMembers = false);
        return;
      }
      final r = await dio.get(
        '/api/vendor/clients/\${widget.clientId}/school-members',
        queryParameters: {'type': widget.memberType},
      );
      if (r.statusCode == 200) {
        final data = r.data as Map<String, dynamic>;
        final list = (data['members'] as List<dynamic>?) ?? [];
        setState(() {
          _items = list.asMap().entries.map((e) {
            final m = e.value as Map<String, dynamic>;
            return _VMemberEntry(
              id: e.key,
              name: (m['name'] ?? '') as String,
              classOrDept: (m['classOrDept'] ?? '') as String,
              phone: (m['phone'] ?? '') as String,
              address: '',
            );
          }).toList();
          _loadingMembers = false;
        });
      } else {
        setState(() => _loadingMembers = false);
      }
    } catch (_) {
      setState(() => _loadingMembers = false);
    }
  }`
);

// ── Step 7: Wrap build body with _loadingMembers check ──
replace(
  '_VendorMemberListScreenState build – add loading spinner',
  `      body: _items.isEmpty`,
  `      body: _loadingMembers\n          ? const Center(child: CircularProgressIndicator())\n          : _items.isEmpty`
);

// ─── write ────────────────────────────────────────────────────────────────────
if (CRLF) src = src.replace(/\n/g, '\r\n');
fs.writeFileSync(FILE, src, 'utf-8');
console.log('\n✅  All remaining patches applied. File saved.');
