import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/widgets.dart';

class TeamScreen extends ConsumerStatefulWidget {
  const TeamScreen({super.key});
  @override
  ConsumerState<TeamScreen> createState() => _TeamScreenState();
}

class _TeamScreenState extends ConsumerState<TeamScreen> with SingleTickerProviderStateMixin {
  late TabController _tab;
  List<dynamic> _members = [], _locations = [];
  bool _loading = true;
  Map? _editMember, _editLoc;
  bool _showAddMember = false, _showAddLoc = false;

  // Add member form
  String _mName = '', _mEmail = '', _mPass = '', _mRole = 'KASIR';
  List<String> _mOutlets = [];
  String _mError = '', _lName = '', _lType = 'OUTLET', _lError = '';
  bool _saving = false;

  @override
  void initState() { super.initState(); _tab = TabController(length: 3, vsync: this); _load(); }

  @override
  void dispose() { _tab.dispose(); super.dispose(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final r = await Future.wait([api.get('/api/team'), api.get('/api/locations')]);
      _members   = (r[0] as List?) ?? [];
      _locations = (r[1] as List?) ?? [];
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  List<dynamic> get _outlets => _locations.where((l) => l['type'] == 'OUTLET').toList();
  List<dynamic> get _warehouses => _locations.where((l) => l['type'] == 'WAREHOUSE').toList();

  Future<void> _saveMember() async {
    setState(() { _saving = true; _mError = ''; });
    try {
      if (_mName.isEmpty || _mEmail.isEmpty || _mPass.isEmpty) { setState(() { _mError = 'Nama, email, dan password wajib diisi'; _saving = false; }); return; }
      if (_mRole == 'KASIR' && _mOutlets.isEmpty) { setState(() { _mError = 'Kasir harus memiliki minimal 1 outlet'; _saving = false; }); return; }
      if (_editMember != null) {
        await api.patch('/api/team', data: {'userId': _editMember!['userId'], 'name': _mName, 'role': _mRole, 'locationIds': _mOutlets});
      } else {
        await api.post('/api/team', data: {'name': _mName, 'email': _mEmail, 'password': _mPass, 'role': _mRole, 'locationIds': _mOutlets});
      }
      setState(() { _showAddMember = false; _editMember = null; });
      _load();
    } catch (e) {
      setState(() => _mError = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _deleteMember(String id) async {
    final ok = await showDialog<bool>(context: context, builder: (_) => AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      title: const Text('Hapus Anggota', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
      content: const Text('Yakin hapus anggota tim ini?', style: TextStyle(fontSize: 13)),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Batal')),
        ElevatedButton(onPressed: () => Navigator.pop(context, true), style: ElevatedButton.styleFrom(backgroundColor: AppTheme.danger, foregroundColor: Colors.white), child: const Text('Hapus')),
      ],
    ));
    if (ok != true) return;
    await api.deleteWithBody('/api/team', data: {'userId': id});
    _load();
  }

  Future<void> _saveLoc() async {
    setState(() { _saving = true; _lError = ''; });
    try {
      if (_lName.isEmpty) { setState(() { _lError = 'Nama wajib diisi'; _saving = false; }); return; }
      if (_editLoc != null) {
        await api.patch('/api/locations/${_editLoc!['id']}', data: {'name': _lName, 'type': _lType});
      } else {
        await api.post('/api/locations', data: {'name': _lName, 'type': _lType});
      }
      setState(() { _showAddLoc = false; _editLoc = null; });
      _load();
    } catch (e) {
      setState(() => _lError = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _toggleLocActive(Map loc) async {
    await api.patch('/api/locations/${loc['id']}', data: {'isActive': !toBool(loc['isActive'], fallback: true)});
    _load();
  }

  void _openEditMember(Map m) {
    final u = m['user'] as Map? ?? {};
    _editMember = m;
    _mName  = (u['name'] as String?) ?? '';
    _mEmail = (u['email'] as String?) ?? '';
    _mPass  = '';
    _mRole  = (m['role'] as String?) ?? 'KASIR';
    _mOutlets = (m['assignedLocations'] as List? ?? []).map((o) => (o['locationId'] as String?) ?? '').where((s) => s.isNotEmpty).toList();
    setState(() { _showAddMember = true; _mError = ''; });
  }

  void _openAddMember() {
    _editMember = null;
    _mName = _mEmail = _mPass = '';
    _mRole = 'KASIR';
    _mOutlets = [];
    setState(() { _showAddMember = true; _mError = ''; });
  }

  void _openEditLoc(Map loc) {
    _editLoc = loc;
    _lName = loc['name'] ?? '';
    _lType = loc['type'] ?? 'OUTLET';
    setState(() { _showAddLoc = true; _lError = ''; });
  }

  void _openAddLoc() {
    _editLoc = null;
    _lName = '';
    _lType = 'OUTLET';
    setState(() { _showAddLoc = true; _lError = ''; });
  }

  String _roleLabel(String r) => {'ADMIN_GUDANG': 'Admin Gudang', 'SUPERVISOR': 'Supervisor', 'KASIR': 'Kasir'}[r] ?? r;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.surface,
      body: _loading ? const LoadingCenter() : Column(children: [
        Container(
          color: Colors.white,
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Tim & Lokasi', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w300, color: AppTheme.textPrimary, letterSpacing: -0.5)),
            const SizedBox(height: 12),
            TabBar(
              controller: _tab,
              labelColor: AppTheme.primary,
              unselectedLabelColor: AppTheme.textMuted,
              indicatorColor: AppTheme.primary,
              labelStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
              tabs: const [Tab(text: 'Tim'), Tab(text: 'Gudang'), Tab(text: 'Outlet')],
            ),
          ]),
        ),
        const Divider(height: 1, color: AppTheme.border),
        Expanded(child: TabBarView(controller: _tab, children: [
          _buildTimTab(),
          _buildLocTab(_warehouses, 'Gudang'),
          _buildLocTab(_outlets, 'Outlet'),
        ])),
      ]),
    );
  }

  Widget _buildTimTab() {
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.all(16), children: [
        // Shortcut ke pengaturan permissions — sama dengan web team page
        GestureDetector(
          onTap: () => context.go('/permissions'),
          child: Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: const Color(0xFFEFF6FF),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFFBFDBFE)),
            ),
            child: Row(children: [
              const Icon(Icons.shield_outlined, size: 18, color: Color(0xFF2563EB)),
              const SizedBox(width: 10),
              const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Atur Akses Fitur per Role', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF1E3A8A))),
                Text('Pilih fitur yang bisa diakses Admin Gudang & Supervisor', style: TextStyle(fontSize: 11, color: Color(0xFF3B82F6))),
              ])),
              const Icon(Icons.chevron_right_rounded, size: 16, color: Color(0xFF93C5FD)),
            ]),
          ),
        ),

        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text('${_members.length} anggota tim', style: const TextStyle(fontSize: 13, color: AppTheme.textMuted)),
          ElevatedButton.icon(
            onPressed: _openAddMember,
            icon: const Icon(Icons.add_rounded, size: 16),
            label: const Text('Tambah', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary, foregroundColor: Colors.white, shape: const StadiumBorder(), padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10), elevation: 0),
          ),
        ]),

        if (_showAddMember) ...[
          const SizedBox(height: 12),
          _memberForm(),
        ],

        const SizedBox(height: 12),
        if (_members.isEmpty)
          _emptyBox(Icons.people_rounded, 'Belum ada anggota tim')
        else
          Container(
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppTheme.border)),
            child: Column(children: _members.asMap().entries.map((e) {
              final m      = e.value as Map;
              final isLast = e.key == _members.length - 1;
              final u      = m['user'] as Map? ?? {};
              final name   = (u['name'] as String?) ?? '';
              final email  = (u['email'] as String?) ?? '';
              final role   = (m['role'] as String?) ?? 'KASIR';
              final userId = (m['userId'] as String?) ?? '';
              return Container(
                decoration: BoxDecoration(border: !isLast ? const Border(bottom: BorderSide(color: AppTheme.border)) : null),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                child: Row(children: [
                  CircleAvatar(radius: 18, backgroundColor: const Color(0xFFEFF6FF), child: Text(name.isNotEmpty ? name[0].toUpperCase() : '?', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.primary))),
                  const SizedBox(width: 10),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(name,  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textPrimary)),
                    Text(email, style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                    const SizedBox(height: 3),
                    Container(padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2), decoration: BoxDecoration(color: const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(6)), child: Text(_roleLabel(role), style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: AppTheme.textSecondary))),
                  ])),
                  IconButton(icon: const Icon(Icons.edit_rounded, size: 15, color: AppTheme.textMuted), onPressed: () => _openEditMember(m), padding: const EdgeInsets.all(6), constraints: const BoxConstraints()),
                  IconButton(icon: const Icon(Icons.delete_rounded, size: 15, color: AppTheme.textMuted), onPressed: () => _deleteMember(userId), padding: const EdgeInsets.all(6), constraints: const BoxConstraints()),
                ]),
              );
            }).toList()),
          ),
        const SizedBox(height: 24),
      ]),
    );
  }

  Widget _memberForm() => Container(
    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppTheme.border)),
    padding: const EdgeInsets.all(14),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Text(_editMember != null ? 'Edit Anggota' : 'Tambah Anggota Baru', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
        IconButton(icon: const Icon(Icons.close_rounded, color: AppTheme.textMuted, size: 18), onPressed: () => setState(() { _showAddMember = false; _editMember = null; })),
      ]),
      if (_mError.isNotEmpty) _errBox(_mError),

      _lbl('Nama *'), _tf((v) => setState(() => _mName = v), _mName, 'Nama lengkap'),
      const SizedBox(height: 10),
      _lbl('Email *'), _tf((v) => setState(() => _mEmail = v), _mEmail, 'email@bisnis.com', type: TextInputType.emailAddress),
      if (_editMember == null) ...[
        const SizedBox(height: 10),
        _lbl('Password *'), _tf((v) => setState(() => _mPass = v), '', '••••••••', obscure: true),
      ],
      const SizedBox(height: 12),

      const Text('Role', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: AppTheme.textPrimary)),
      const SizedBox(height: 6),
      for (final role in [('ADMIN_GUDANG', 'Admin Gudang', 'Akses inventori dan transfer'), ('SUPERVISOR', 'Supervisor', 'Akses stok dan opname'), ('KASIR', 'Kasir', 'Akses POS dan shift')])
        GestureDetector(
          onTap: () => setState(() { _mRole = role.$1; if (_mRole != 'KASIR') _mOutlets = []; }),
          child: Container(
            margin: const EdgeInsets.only(bottom: 6),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: _mRole == role.$1 ? const Color(0xFFEFF6FF) : const Color(0xFFF9FAFB),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: _mRole == role.$1 ? AppTheme.primary : AppTheme.border, width: _mRole == role.$1 ? 2 : 1),
            ),
            child: Row(children: [
              Container(width: 18, height: 18, decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: _mRole == role.$1 ? AppTheme.primary : AppTheme.border, width: 2), color: _mRole == role.$1 ? AppTheme.primary : Colors.transparent), child: _mRole == role.$1 ? const Icon(Icons.check_rounded, size: 10, color: Colors.white) : null),
              const SizedBox(width: 10),
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(role.$2, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _mRole == role.$1 ? AppTheme.primary : AppTheme.textPrimary)),
                Text(role.$3, style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
              ]),
            ]),
          ),
        ),

      if (_mRole == 'KASIR' && _outlets.isNotEmpty) ...[
        const SizedBox(height: 10),
        const Text('Outlet yang bisa diakses *', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: AppTheme.textPrimary)),
        const SizedBox(height: 6),
        ..._outlets.cast<Map>().map((loc) {
          final locId   = (loc['id'] as String?) ?? '';
          final locName = (loc['name'] as String?) ?? '';
          final checked = _mOutlets.contains(locId);
          return GestureDetector(
            onTap: () => setState(() {
              if (checked) { _mOutlets.remove(locId); } else { _mOutlets.add(locId); }
            }),
            child: Container(
              margin: const EdgeInsets.only(bottom: 6),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(color: checked ? const Color(0xFFEFF6FF) : const Color(0xFFF9FAFB), borderRadius: BorderRadius.circular(10), border: Border.all(color: checked ? AppTheme.primary : AppTheme.border)),
              child: Row(children: [
                Icon(checked ? Icons.check_box_rounded : Icons.check_box_outline_blank_rounded, color: checked ? AppTheme.primary : AppTheme.textMuted, size: 18),
                const SizedBox(width: 10),
                Text(locName, style: TextStyle(fontSize: 13, color: checked ? AppTheme.primary : AppTheme.textPrimary, fontWeight: checked ? FontWeight.w600 : FontWeight.normal)),
              ]),
            ),
          );
        }),
      ],

      const SizedBox(height: 14),
      Row(children: [
        Expanded(child: OutlinedButton(onPressed: () => setState(() { _showAddMember = false; _editMember = null; }), style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 12), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)), side: const BorderSide(color: AppTheme.border)), child: const Text('Batal', style: TextStyle(color: AppTheme.textSecondary)))),
        const SizedBox(width: 10),
        Expanded(child: ElevatedButton(
          onPressed: _saving ? null : _saveMember,
          style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(vertical: 12), shape: const StadiumBorder(), elevation: 0),
          child: _saving ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('Simpan', style: TextStyle(fontWeight: FontWeight.w600)),
        )),
      ]),
    ]),
  );

  Widget _buildLocTab(List<dynamic> locs, String typeName) {
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.all(16), children: [
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text('${locs.length} $typeName', style: const TextStyle(fontSize: 13, color: AppTheme.textMuted)),
          ElevatedButton.icon(
            onPressed: () { _lType = typeName == 'Gudang' ? 'WAREHOUSE' : 'OUTLET'; _openAddLoc(); },
            icon: const Icon(Icons.add_rounded, size: 16),
            label: const Text('Tambah', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary, foregroundColor: Colors.white, shape: const StadiumBorder(), padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10), elevation: 0),
          ),
        ]),

        if (_showAddLoc) ...[
          const SizedBox(height: 12),
          Container(
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppTheme.border)),
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                Text(_editLoc != null ? 'Edit Lokasi' : 'Tambah Lokasi Baru', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
                IconButton(icon: const Icon(Icons.close_rounded, color: AppTheme.textMuted, size: 18), onPressed: () => setState(() { _showAddLoc = false; _editLoc = null; })),
              ]),
              if (_lError.isNotEmpty) _errBox(_lError),
              _lbl('Nama Lokasi *'),
              TextField(onChanged: (v) => setState(() => _lName = v), style: const TextStyle(fontSize: 13), decoration: _fldDec(hint: 'Contoh: Outlet Denpasar')),
              const SizedBox(height: 14),
              Row(children: [
                Expanded(child: OutlinedButton(onPressed: () => setState(() { _showAddLoc = false; _editLoc = null; }), style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 12), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)), side: const BorderSide(color: AppTheme.border)), child: const Text('Batal', style: TextStyle(color: AppTheme.textSecondary)))),
                const SizedBox(width: 10),
                Expanded(child: ElevatedButton(
                  onPressed: _saving ? null : _saveLoc,
                  style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(vertical: 12), shape: const StadiumBorder(), elevation: 0),
                  child: _saving ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('Simpan', style: TextStyle(fontWeight: FontWeight.w600)),
                )),
              ]),
            ]),
          ),
        ],

        const SizedBox(height: 12),
        if (locs.isEmpty)
          _emptyBox(Icons.location_on_rounded, 'Belum ada $typeName')
        else
          Container(
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppTheme.border)),
            child: Column(children: locs.asMap().entries.map((e) {
              final loc    = e.value as Map;
              final isLast = e.key == locs.length - 1;
              final active  = toBool(loc['isActive'], fallback: true);
              final locName = (loc['name'] as String?) ?? '';
              final locType = (loc['type'] as String?) ?? '';
              return Container(
                decoration: BoxDecoration(border: !isLast ? const Border(bottom: BorderSide(color: AppTheme.border)) : null),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                child: Row(children: [
                  Container(width: 36, height: 36, decoration: BoxDecoration(color: active ? const Color(0xFFEFF6FF) : const Color(0xFFF8FAFC), borderRadius: BorderRadius.circular(8)), child: Icon(locType == 'WAREHOUSE' ? Icons.warehouse_rounded : Icons.store_rounded, size: 18, color: active ? AppTheme.primary : AppTheme.textMuted)),
                  const SizedBox(width: 10),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(locName, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: active ? AppTheme.textPrimary : AppTheme.textMuted)),
                    Container(padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1), decoration: BoxDecoration(color: active ? const Color(0xFFF0FDF4) : const Color(0xFFF8FAFC), borderRadius: BorderRadius.circular(6)), child: Text(active ? 'Aktif' : 'Nonaktif', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: active ? const Color(0xFF15803D) : AppTheme.textMuted))),
                  ])),
                  IconButton(icon: const Icon(Icons.edit_rounded, size: 15, color: AppTheme.textMuted), onPressed: () => _openEditLoc(loc), padding: const EdgeInsets.all(6), constraints: const BoxConstraints()),
                  IconButton(icon: Icon(active ? Icons.block_rounded : Icons.check_circle_rounded, size: 15, color: AppTheme.textMuted), onPressed: () => _toggleLocActive(loc), padding: const EdgeInsets.all(6), constraints: const BoxConstraints()),
                ]),
              );
            }).toList()),
          ),
        const SizedBox(height: 24),
      ]),
    );
  }

  Widget _emptyBox(IconData icon, String msg) => Container(
    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppTheme.border)),
    padding: const EdgeInsets.all(40),
    child: Column(children: [
      Container(width: 56, height: 56, decoration: BoxDecoration(color: const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(16)), child: Icon(icon, size: 28, color: AppTheme.textMuted)),
      const SizedBox(height: 12),
      Text(msg, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppTheme.textSecondary)),
    ]),
  );

  Widget _errBox(String e) => Container(margin: const EdgeInsets.only(bottom: 10), padding: const EdgeInsets.all(10), decoration: BoxDecoration(color: const Color(0xFFFEF2F2), borderRadius: BorderRadius.circular(8), border: Border.all(color: const Color(0xFFFECACA))), child: Text(e, style: const TextStyle(color: AppTheme.danger, fontSize: 12)));
  Widget _lbl(String t) => Padding(padding: const EdgeInsets.only(bottom: 6), child: Text(t, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: AppTheme.textPrimary)));
  Widget _tf(ValueChanged<String> onChanged, String init, String hint, {TextInputType? type, bool obscure = false}) => TextField(onChanged: onChanged, keyboardType: type, obscureText: obscure, style: const TextStyle(fontSize: 13), decoration: _fldDec(hint: hint));
  InputDecoration _fldDec({String? hint}) => InputDecoration(hintText: hint, hintStyle: const TextStyle(color: AppTheme.textMuted, fontSize: 13), filled: true, fillColor: const Color(0xFFF9FAFB), border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.border)), enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.border)), focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.primary, width: 2)), contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11));
}
