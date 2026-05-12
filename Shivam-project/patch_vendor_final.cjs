// patch_vendor_final.cjs – applies missing steps 1, 2, 3 on the current file
// (Steps 4-7 are already applied; this completes the work)
'use strict';
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'edumid', 'lib', 'features', 'vendor', 'screens', 'vendor_screens.dart');

let src = fs.readFileSync(FILE, 'utf-8');
const CRLF = src.includes('\r\n');
if (CRLF) src = src.replace(/\r\n/g, '\n');

function replaceRange(label, startMark, endMark, newStr) {
  const si = src.indexOf(startMark);
  if (si === -1) {
    console.error(`ERROR [${label}]: start not found:\n${JSON.stringify(startMark.substring(0, 80))}`);
    process.exit(1);
  }
  const ei = src.indexOf(endMark, si + startMark.length);
  if (ei === -1) {
    console.error(`ERROR [${label}]: end not found:\n${JSON.stringify(endMark.substring(0, 80))}`);
    process.exit(1);
  }
  src = src.substring(0, si) + newStr + src.substring(ei);
  console.log(`✅  ${label}`);
}

function replace(label, oldStr, newStr) {
  if (!src.includes(oldStr)) {
    console.error(`ERROR [${label}]: could not find:\n${JSON.stringify(oldStr.substring(0, 120))}`);
    process.exit(1);
  }
  src = src.replace(oldStr, newStr);
  console.log(`✅  ${label}`);
}

// ════════════════════════════════════════════════════════════════════════════
// STEP 1: Replace _VendorSchoolDetailScreen (StatelessWidget → StatefulWidget)
//   from class definition up to (not including) class _VendorSectionDef
// ════════════════════════════════════════════════════════════════════════════
replaceRange(
  'Step 1: _VendorSchoolDetailScreen → StatefulWidget',
  '\nclass _VendorSchoolDetailScreen extends StatelessWidget {',
  '\nclass _VendorSectionDef {',
  `
class _VendorSchoolDetailScreen extends StatefulWidget {
  final _VendorSchoolEntry school;
  const _VendorSchoolDetailScreen({required this.school});

  @override
  State<_VendorSchoolDetailScreen> createState() =>
      _VendorSchoolDetailScreenState();
}

class _VendorSchoolDetailScreenState extends State<_VendorSchoolDetailScreen> {
  bool _loading = true;
  int _classesCount = 0;
  int _teachersCount = 0;
  int _studentsCount = 0;
  int _staffCount = 0;

  @override
  void initState() {
    super.initState();
    _loadSummary();
  }

  Future<void> _loadSummary() async {
    final cid = widget.school.clientId;
    if (cid.isEmpty) {
      setState(() => _loading = false);
      return;
    }
    try {
      final dio = await _dioWithAuth();
      if (dio == null) {
        setState(() => _loading = false);
        return;
      }
      final r = await dio.get('/api/vendor/clients/\$cid/school-summary');
      if (r.statusCode == 200) {
        final d = r.data as Map<String, dynamic>;
        setState(() {
          _classesCount  = (d['classesCount']  as num?)?.toInt() ?? 0;
          _teachersCount = (d['teachersCount'] as num?)?.toInt() ?? 0;
          _studentsCount = (d['studentsCount'] as num?)?.toInt() ?? 0;
          _staffCount    = (d['staffCount']    as num?)?.toInt() ?? 0;
          _loading = false;
        });
      } else {
        setState(() => _loading = false);
      }
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  List<_VendorSectionDef> get _sections => [
        _VendorSectionDef(
          icon: Icons.class_,
          title: 'Classes',
          count: _loading ? '...' : '\$_classesCount',
          unit: 'classes',
          subtitle: 'Tap to view classes',
          color: AppColors.secondary,
        ),
        _VendorSectionDef(
          icon: Icons.person_rounded,
          title: 'Teachers',
          count: _loading ? '...' : '\$_teachersCount',
          unit: 'teachers',
          subtitle: 'Tap to view teachers',
          color: AppColors.roleTeacher,
        ),
        _VendorSectionDef(
          icon: Icons.school_rounded,
          title: 'Students',
          count: _loading ? '...' : '\$_studentsCount',
          unit: 'students',
          subtitle: 'Tap to view students',
          color: AppColors.primary,
        ),
        _VendorSectionDef(
          icon: Icons.badge_rounded,
          title: 'Staff',
          count: _loading ? '...' : '\$_staffCount',
          unit: 'staff',
          subtitle: 'Tap to view staff',
          color: AppColors.accent,
        ),
      ];

  @override
  Widget build(BuildContext context) {
    final school = widget.school;
    final sections = _sections;
    return Scaffold(
      appBar: AppBar(
        title: Text(school.name),
        backgroundColor: school.color,
        foregroundColor: Colors.white,
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [school.color, school.color.withOpacity(0.7)],
              ),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Row(children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Icon(Icons.account_balance_rounded,
                    color: Colors.white, size: 28),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(school.name,
                        style: AppTypography.labelLarge.copyWith(
                            color: Colors.white, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 4),
                    Text('\${school.city} \\u2022 \${school.board}',
                        style: AppTypography.bodySmall
                            .copyWith(color: Colors.white.withOpacity(0.8))),
                  ],
                ),
              ),
            ]),
          ).animate().fadeIn(duration: 250.ms),
          const SizedBox(height: 24),
          Text('Sections',
              style: AppTypography.titleSmall
                  .copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 14),
          ...sections.asMap().entries.map((e) {
            final s = e.value;
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: _VendorSectionCard(
                def: s,
                onTap: () {
                  if (s.title == 'Classes') {
                    Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => _VendorClassListScreen(
                          clientId: school.clientId),
                    ));
                  } else {
                    final raw = s.title.toLowerCase();
                    final memberType = raw.endsWith('s')
                        ? raw.substring(0, raw.length - 1)
                        : raw;
                    Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => _VendorSectionScreen(
                        title: s.title,
                        icon: s.icon,
                        color: s.color,
                        totalCountLabel: '\${s.count} \${s.unit}',
                        clientId: school.clientId,
                        memberType: memberType,
                      ),
                    ));
                  }
                },
              )
                  .animate(delay: Duration(milliseconds: 80 * e.key))
                  .fadeIn(duration: 250.ms)
                  .slideX(begin: 0.04, end: 0),
            );
          }),
        ],
      ),
    );
  }
}
`
);

// ════════════════════════════════════════════════════════════════════════════
// STEP 2: Replace _VendorClassListScreen (empty StatelessWidget → real API)
// ════════════════════════════════════════════════════════════════════════════
replaceRange(
  'Step 2: _VendorClassListScreen → real API StatefulWidget',
  '\nclass _VendorClassListScreen extends StatelessWidget {',
  '\n// -------------------------------------------------------------------\n// VENDOR SECTION SCREEN',
  `
class _VendorClassListScreen extends StatefulWidget {
  final String clientId;
  const _VendorClassListScreen({required this.clientId});

  @override
  State<_VendorClassListScreen> createState() => _VendorClassListScreenState();
}

class _VendorClassListScreenState extends State<_VendorClassListScreen> {
  bool _loading = true;
  List<String> _classes = [];
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadClasses();
  }

  Future<void> _loadClasses() async {
    if (widget.clientId.isEmpty) {
      setState(() => _loading = false);
      return;
    }
    try {
      final dio = await _dioWithAuth();
      if (dio == null) {
        setState(() { _loading = false; _error = 'Not authenticated'; });
        return;
      }
      final r = await dio.get(
          '/api/vendor/clients/\${widget.clientId}/school-classes');
      if (r.statusCode == 200) {
        final data = r.data as Map<String, dynamic>;
        setState(() {
          _classes = List<String>.from(data['classes'] ?? []);
          _loading = false;
        });
      } else {
        setState(() { _loading = false; _error = 'Failed to load classes'; });
      }
    } catch (e) {
      setState(() { _loading = false; _error = e.toString(); });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Classes'),
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!, style: AppTypography.bodyMedium))
              : _classes.isEmpty
                  ? Center(
                      child: Text('No classes found',
                          style: AppTypography.bodyMedium))
                  : ListView.separated(
                      padding: const EdgeInsets.all(20),
                      itemCount: _classes.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (context, i) {
                        final cls = _classes[i];
                        return Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 18, vertical: 14),
                          decoration: BoxDecoration(
                            color: Theme.of(context).colorScheme.surface,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(
                                color: AppColors.primary.withOpacity(0.18),
                                width: 1.5),
                          ),
                          child: Row(children: [
                            Container(
                              width: 40,
                              height: 40,
                              decoration: BoxDecoration(
                                color: AppColors.primary.withOpacity(0.1),
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: const Icon(Icons.class_,
                                  color: AppColors.primary, size: 20),
                            ),
                            const SizedBox(width: 14),
                            Text(cls, style: AppTypography.labelLarge),
                          ]),
                        );
                      },
                    ),
    );
  }
}

`
);

// ════════════════════════════════════════════════════════════════════════════
// STEP 3: Add clientId + memberType to _VendorSectionScreen constructor
// ════════════════════════════════════════════════════════════════════════════
replace(
  'Step 3: _VendorSectionScreen add clientId + memberType',
  `class _VendorSectionScreen extends StatelessWidget {
  final String title;
  final IconData icon;
  final Color color;
  final String totalCountLabel;
  const _VendorSectionScreen({
    required this.title,
    required this.icon,
    required this.color,
    required this.totalCountLabel,
  });`,
  `class _VendorSectionScreen extends StatelessWidget {
  final String title;
  final IconData icon;
  final Color color;
  final String totalCountLabel;
  final String clientId;
  final String memberType;
  const _VendorSectionScreen({
    required this.title,
    required this.icon,
    required this.color,
    required this.totalCountLabel,
    required this.clientId,
    required this.memberType,
  });`
);

// ─── write ────────────────────────────────────────────────────────────────────
if (CRLF) src = src.replace(/\n/g, '\r\n');
fs.writeFileSync(FILE, src, 'utf-8');
console.log('\n✅  All 3 remaining patches applied and file saved!');
