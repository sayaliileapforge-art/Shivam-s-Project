const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'edumid/lib/features/vendor/screens/vendor_screens.dart');
let content = fs.readFileSync(filePath, 'utf8');

// ─── 1. Replace _VendorSchoolDetailScreen (StatelessWidget → StatefulWidget) ─
const oldDetailClass = `class _VendorSchoolDetailScreen extends StatelessWidget {
  final _VendorSchoolEntry school;
  const _VendorSchoolDetailScreen({required this.school});

  List<_VendorSectionDef> get _sections => [`;

const newDetailHeader = `class _VendorSchoolDetailScreen extends StatefulWidget {
  final _VendorSchoolEntry school;
  const _VendorSchoolDetailScreen({required this.school});

  @override
  State<_VendorSchoolDetailScreen> createState() =>
      _VendorSchoolDetailScreenState();
}

class _VendorSchoolDetailScreenState
    extends State<_VendorSchoolDetailScreen> {
  bool _loading = true;
  int _classesCount = 0;
  int _studentsCount = 0;
  int _teachersCount = 0;

  @override
  void initState() {
    super.initState();
    _loadCounts();
  }

  Future<void> _loadCounts() async {
    if (widget.school.clientId.isEmpty) {
      if (mounted) setState(() => _loading = false);
      return;
    }
    try {
      final res = await _dio().get(
        '\$_kServerBase/api/vendor/clients/\${widget.school.clientId}/school-summary',
      );
      final data = res.data as Map<String, dynamic>;
      if (mounted) {
        setState(() {
          _classesCount = (data['classesCount'] as num? ?? 0).toInt();
          _studentsCount = (data['studentsCount'] as num? ?? 0).toInt();
          _teachersCount = (data['teachersCount'] as num? ?? 0).toInt();
          _loading = false;
        });
      }
    } catch (e) {
      debugPrint('[SchoolDetail] load counts error: \$e');
      if (mounted) setState(() => _loading = false);
    }
  }

  List<_VendorSectionDef> get _sections => [`;

if (!content.includes(oldDetailClass)) {
  console.error('ERROR: Could not find _VendorSchoolDetailScreen class start');
  process.exit(1);
}
content = content.replace(oldDetailClass, newDetailHeader);
console.log('✅ Replaced _VendorSchoolDetailScreen header');

// ─── 2. Replace hardcoded counts in _sections getter ─────────────────────────
// count: '10' (classes)
content = content.replace(
  `          title: 'Classes',\n          count: '10',`,
  `          title: 'Classes',\n          count: _loading ? '\u2026' : '\$_classesCount',`
);
console.log('✅ Fixed Classes count');

// count: '\uFFFD' for Teachers (U+FFFD replacement char)
const teacherCountOld = `          title: 'Teachers',\n          count: '\uFFFD',`;
const teacherCountNew = `          title: 'Teachers',\n          count: _loading ? '\u2026' : '\$_teachersCount',`;
if (content.includes(teacherCountOld)) {
  content = content.replace(teacherCountOld, teacherCountNew);
  console.log('✅ Fixed Teachers count');
} else {
  console.warn('⚠️  Teachers count string not found (may already be changed)');
}

// count: '${school.totalStudents}' for Students
content = content.replace(
  `          title: 'Students',\n          count: '\${school.totalStudents}',`,
  `          title: 'Students',\n          count: _loading ? '\u2026' : '\$_studentsCount',`
);
console.log('✅ Fixed Students count');

// count: '\uFFFD' for Staff (second occurrence)
const staffCountOld = `          title: 'Staff',\n          count: '\uFFFD',`;
const staffCountNew = `          title: 'Staff',\n          count: '\u2014',`;
if (content.includes(staffCountOld)) {
  content = content.replace(staffCountOld, staffCountNew);
  console.log('✅ Fixed Staff count');
} else {
  console.warn('⚠️  Staff count string not found');
}

// ─── 3. Fix build() — replace `school.` with `widget.school.` in the detail screen ─
// The build method was `final sections = _sections;` and used `school.name`, etc.
// After conversion, we need `widget.school` references.
// The header section with school.name and school.color in appBar
content = content.replace(
  `    final sections = _sections;\n    return Scaffold(\n      appBar: AppBar(\n        title: Text(school.name),\n        backgroundColor: school.color,`,
  `    final school = widget.school;\n    final sections = _sections;\n    return Scaffold(\n      appBar: AppBar(\n        title: Text(school.name),\n        backgroundColor: school.color,`
);
console.log('✅ Added final school = widget.school in build()');

// ─── 4. Fix navigation in _VendorSchoolDetailScreen — pass clientId ───────────
content = content.replace(
  `                  if (s.title == 'Classes') {\n                    Navigator.of(context).push(MaterialPageRoute(\n                      builder: (_) => const _VendorClassListScreen(),\n                    ));\n                  } else {\n                    Navigator.of(context).push(MaterialPageRoute(\n                      builder: (_) => _VendorSectionScreen(\n                        title: s.title,\n                        icon: s.icon,\n                        color: s.color,\n                        totalCountLabel: '\${s.count} \${s.unit}',\n                      ),\n                    ));\n                  }`,
  `                  if (s.title == 'Classes') {\n                    Navigator.of(context).push(MaterialPageRoute(\n                      builder: (_) => _VendorClassListScreen(\n                        clientId: school.clientId,\n                      ),\n                    ));\n                  } else {\n                    Navigator.of(context).push(MaterialPageRoute(\n                      builder: (_) => _VendorSectionScreen(\n                        title: s.title,\n                        icon: s.icon,\n                        color: s.color,\n                        totalCountLabel: '\${s.count} \${s.unit}',\n                        clientId: school.clientId,\n                        memberType: s.title.toLowerCase(),\n                      ),\n                    ));\n                  }`
);
console.log('✅ Fixed navigation to pass clientId');

// ─── 5. Replace _VendorClassListScreen with real API fetch ────────────────────
const oldClassList = `class _VendorClassListScreen extends StatelessWidget {
  const _VendorClassListScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Classes'),
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
      ),
      body: Center(
        child: Text('No class data available', style: AppTypography.bodyMedium),
      ),
    );
  }
}`;

const newClassList = `class _VendorClassListScreen extends StatefulWidget {
  final String clientId;
  const _VendorClassListScreen({required this.clientId});

  @override
  State<_VendorClassListScreen> createState() =>
      _VendorClassListScreenState();
}

class _VendorClassListScreenState extends State<_VendorClassListScreen> {
  bool _loading = true;
  List<String> _classes = [];

  @override
  void initState() {
    super.initState();
    _loadClasses();
  }

  Future<void> _loadClasses() async {
    if (widget.clientId.isEmpty) {
      if (mounted) setState(() => _loading = false);
      return;
    }
    try {
      final res = await _dio().get(
        '\$_kServerBase/api/vendor/clients/\${widget.clientId}/school-classes',
      );
      final data = res.data as Map<String, dynamic>?;
      final list = (data?['classes'] as List?)?.cast<String>() ?? [];
      if (mounted) setState(() { _classes = list; _loading = false; });
    } catch (e) {
      debugPrint('[ClassList] error: \$e');
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Classes'),
        backgroundColor: AppColors.secondary,
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () { setState(() { _loading = true; _classes = []; }); _loadClasses(); },
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _classes.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.class_rounded,
                          size: 64,
                          color: AppColors.secondary.withOpacity(0.3)),
                      const SizedBox(height: 16),
                      Text('No classes yet',
                          style: AppTypography.titleSmall
                              .copyWith(color: AppColors.secondary)),
                      const SizedBox(height: 6),
                      Text('Upload an Excel file to add classes',
                          style: AppTypography.bodySmall.copyWith(
                              color: AppColors.secondary.withOpacity(0.5))),
                    ],
                  ),
                )
              : ListView.separated(
                  padding: const EdgeInsets.all(20),
                  itemCount: _classes.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (context, i) => Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 18, vertical: 14),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.surface,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                          color: AppColors.secondary.withOpacity(0.2),
                          width: 1.5),
                      boxShadow: [
                        BoxShadow(
                            color: AppColors.secondary.withOpacity(0.05),
                            blurRadius: 8,
                            offset: const Offset(0, 2)),
                      ],
                    ),
                    child: Row(children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                            color: AppColors.secondary.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(10)),
                        child: const Icon(Icons.class_rounded,
                            color: AppColors.secondary, size: 20),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                          child: Text(_classes[i],
                              style: AppTypography.labelMedium)),
                      Icon(Icons.chevron_right_rounded,
                          color: AppColors.secondary.withOpacity(0.4)),
                    ]),
                  )
                      .animate(delay: Duration(milliseconds: 50 * i))
                      .fadeIn(),
                ),
    );
  }
}`;

if (!content.includes(oldClassList)) {
  console.error('ERROR: Could not find _VendorClassListScreen class');
  process.exit(1);
}
content = content.replace(oldClassList, newClassList);
console.log('✅ Replaced _VendorClassListScreen');

// ─── 6. Add clientId + memberType to _VendorSectionScreen constructor ─────────
content = content.replace(
  `class _VendorSectionScreen extends StatelessWidget {\n  final String title;\n  final IconData icon;\n  final Color color;\n  final String totalCountLabel;\n  const _VendorSectionScreen({\n    required this.title,\n    required this.icon,\n    required this.color,\n    required this.totalCountLabel,\n  });`,
  `class _VendorSectionScreen extends StatelessWidget {\n  final String title;\n  final IconData icon;\n  final Color color;\n  final String totalCountLabel;\n  final String clientId;\n  final String memberType;\n  const _VendorSectionScreen({\n    required this.title,\n    required this.icon,\n    required this.color,\n    required this.totalCountLabel,\n    this.clientId = '',\n    this.memberType = '',\n  });`
);
console.log('✅ Added clientId/memberType to _VendorSectionScreen');

// ─── 7. Pass clientId + memberType to _VendorMemberListScreen ─────────────────
// The _VendorSectionScreen onTap navigates to _VendorMemberListScreen
// Find the navigation call in _VendorSectionScreen (the category arg uses $title and $label)
const oldMemberNav = `                  builder: (_) => _VendorMemberListScreen(\n                    category: '\$title \u2013 \$label',\n                    section: title,\n                    count: count,\n                    icon: catIcon,\n                    color: catColor,\n                  ),`;
const newMemberNav = `                  builder: (_) => _VendorMemberListScreen(\n                    category: '\$title \u2013 \$label',\n                    section: title,\n                    count: count,\n                    icon: catIcon,\n                    color: catColor,\n                    clientId: clientId,\n                    memberType: memberType,\n                  ),`;
if (content.includes(oldMemberNav)) {
  content = content.replace(oldMemberNav, newMemberNav);
  console.log('✅ Passed clientId/memberType to _VendorMemberListScreen');
} else {
  // Try with em dash character directly
  const oldNav2 = `                  builder: (_) => _VendorMemberListScreen(\n                    category: '\$title \u2013 \$label',`;
  const idx = content.indexOf(oldNav2);
  console.warn('⚠️  Nav old string not found exactly. idx=' + content.indexOf("_VendorMemberListScreen("));
}

// ─── 8. Add clientId + memberType to _VendorMemberListScreen ─────────────────
content = content.replace(
  `class _VendorMemberListScreen extends StatefulWidget {\n  final String category;\n  final String section;\n  final int count;\n  final IconData icon;\n  final Color color;\n  const _VendorMemberListScreen({\n    required this.category,\n    required this.section,\n    required this.count,\n    required this.icon,\n    required this.color,\n  });`,
  `class _VendorMemberListScreen extends StatefulWidget {\n  final String category;\n  final String section;\n  final int count;\n  final IconData icon;\n  final Color color;\n  final String clientId;\n  final String memberType;\n  const _VendorMemberListScreen({\n    required this.category,\n    required this.section,\n    required this.count,\n    required this.icon,\n    required this.color,\n    this.clientId = '',\n    this.memberType = '',\n  });`
);
console.log('✅ Added clientId/memberType to _VendorMemberListScreen');

// ─── 9. Update MemberListScreenState to fetch from API ───────────────────────
content = content.replace(
  `class _VendorMemberListScreenState extends State<_VendorMemberListScreen> {\n  late List<_VMemberEntry> _items;\n\n  @override\n  void initState() {\n    super.initState();\n    _items = [];\n  }`,
  `class _VendorMemberListScreenState extends State<_VendorMemberListScreen> {\n  late List<_VMemberEntry> _items;\n  bool _loadingMembers = false;\n\n  @override\n  void initState() {\n    super.initState();\n    _items = [];\n    if (widget.clientId.isNotEmpty && widget.memberType.isNotEmpty) {\n      _loadMembers();\n    }\n  }\n\n  Future<void> _loadMembers() async {\n    setState(() => _loadingMembers = true);\n    try {\n      final res = await _dio().get(\n        '\$_kServerBase/api/vendor/clients/\${widget.clientId}/school-members',\n        queryParameters: {'type': widget.memberType},\n      );\n      final data = res.data as Map<String, dynamic>?;\n      final list = (data?['members'] as List?) ?? [];\n      if (mounted) {\n        setState(() {\n          _items = list.asMap().entries.map((e) {\n            final m = e.value as Map<String, dynamic>;\n            return _VMemberEntry(\n              id: e.key,\n              name: m['name']?.toString() ?? '',\n              classOrDept: m['classOrDept']?.toString() ?? '',\n              phone: m['phone']?.toString() ?? '',\n              address: '',\n            );\n          }).toList();\n          _loadingMembers = false;\n        });\n      }\n    } catch (e) {\n      debugPrint('[MemberList] fetch error: \$e');\n      if (mounted) setState(() => _loadingMembers = false);\n    }\n  }`
);
console.log('✅ Updated _VendorMemberListScreenState to fetch from API');

// ─── 10. Update body to show loading state ────────────────────────────────────
content = content.replace(
  `      body: _items.isEmpty\n          ? Center(\n              child: Column(\n                  mainAxisAlignment: MainAxisAlignment.center,\n                  children: [\n                  Icon(Icons.check_circle_outline_rounded,\n                      size: 72, color: widget.color.withOpacity(0.4)),\n                  const SizedBox(height: 16),\n                  Text('All caught up!',\n                      style: AppTypography.titleSmall\n                          .copyWith(color: widget.color)),\n                  Text('No records in this category',\n                      style: AppTypography.bodyMedium.copyWith(\n                          color: Theme.of(context)\n                              .colorScheme\n                              .onSurface\n                              .withOpacity(0.5))),\n                ]))`,
  `      body: _loadingMembers\n          ? const Center(child: CircularProgressIndicator())\n          : _items.isEmpty\n          ? Center(\n              child: Column(\n                  mainAxisAlignment: MainAxisAlignment.center,\n                  children: [\n                  Icon(Icons.check_circle_outline_rounded,\n                      size: 72, color: widget.color.withOpacity(0.4)),\n                  const SizedBox(height: 16),\n                  Text('All caught up!',\n                      style: AppTypography.titleSmall\n                          .copyWith(color: widget.color)),\n                  Text('No records in this category',\n                      style: AppTypography.bodyMedium.copyWith(\n                          color: Theme.of(context)\n                              .colorScheme\n                              .onSurface\n                              .withOpacity(0.5))),\n                ]))`
);
console.log('✅ Added loading state to member list body');

fs.writeFileSync(filePath, content, 'utf8');
console.log('\n✅ ALL DONE — file written successfully');
