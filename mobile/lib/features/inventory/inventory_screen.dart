import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/widgets.dart';

const _units = ['botol','bungkus','butir','gram','ikat','kaleng','kg','lembar','liter','ml','pcs','potong','sachet'];
const _packUnits = ['ball','box','drum','dus','galon','jerigen','karton','karung','krat','lusin','pack','peti','renteng','roll','sak','toples'];
const _defaultCats = ['Bahan Baku','Kemasan','Makanan','Minuman'];

class InventoryScreen extends ConsumerStatefulWidget {
  const InventoryScreen({super.key});
  @override
  ConsumerState<InventoryScreen> createState() => _InventoryScreenState();
}

class _InventoryScreenState extends ConsumerState<InventoryScreen> {
  List<dynamic> _items = [];
  List<dynamic> _locations = [];
  bool _loading = true;
  String _search = '';
  String _category = 'Semua';

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final r = await Future.wait([api.get('/api/inventory'), api.get('/api/locations')]);
      _items = (r[0] as List?) ?? [];
      _locations = (r[1] as List?) ?? [];
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  List<dynamic> get _filtered => _items.where((item) {
    final s = _search.toLowerCase();
    final match = item['name'].toString().toLowerCase().contains(s) || (item['sku'] ?? '').toString().toLowerCase().contains(s);
    return match && (_category == 'Semua' || item['category'] == _category);
  }).toList();

  List<String> get _cats {
    final c = _items.map((i) => i['category'] as String?).whereType<String>().toSet().toList()..sort();
    return ['Semua', ...c];
  }

  int get _missingCost => _items.where((i) => i['costPrice'] == null && toBool(i['isTrackable'])).length;

  Color _catColor(String? cat) {
    switch ((cat ?? '').toLowerCase()) {
      case 'bahan baku': return const Color(0xFF10B981);
      case 'kemasan':    return const Color(0xFF3B82F6);
      case 'makanan':    return const Color(0xFFEF4444);
      case 'minuman':    return const Color(0xFF6366F1);
      default:           return AppTheme.primary;
    }
  }

  String _rp(dynamic n) {
    if (n == null) return '—';
    return 'Rp ${(toNum(n) ?? 0).toInt().toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => '.')}';
  }

  void _openForm({Map<String, dynamic>? item}) => showModalBottomSheet(
    context: context, isScrollControlled: true, backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    builder: (_) => _ItemForm(item: item, locations: _locations, onSaved: _load),
  );

  Future<void> _confirmDelete(Map item) async {
    final ok = await showDialog<bool>(context: context, builder: (_) => AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      title: const Text('Hapus Item', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
      content: Text('Yakin hapus "${item['name']}"? Semua riwayat stok juga ikut terhapus.', style: const TextStyle(fontSize: 13)),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Batal')),
        ElevatedButton(onPressed: () => Navigator.pop(context, true), style: ElevatedButton.styleFrom(backgroundColor: AppTheme.danger, foregroundColor: Colors.white), child: const Text('Hapus')),
      ],
    ));
    if (ok != true || !mounted) return;
    try {
      await api.delete('/api/inventory/${item['id']}');
      _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Widget _metricCell(String label, String value, {bool warn = false, bool green = false}) {
    Color valueColor = const Color(0xFF0F172A);
    if (warn) valueColor = const Color(0xFFF59E0B);
    if (green) valueColor = const Color(0xFF10B981);
    if (value == '—') valueColor = const Color(0xFFCBD5E1);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
      Text(label, style: const TextStyle(fontSize: 10, color: Color(0xFF94A3B8), fontWeight: FontWeight.w500)),
      const SizedBox(height: 2),
      Text(value, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: valueColor)),
    ]);
  }

  Widget _vDivider() => Container(width: 1, height: 28, color: const Color(0xFFE2E8F0), margin: const EdgeInsets.symmetric(horizontal: 10));

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;
    return Scaffold(
      backgroundColor: AppTheme.surface,
      body: _loading ? const LoadingCenter() : RefreshIndicator(
        onRefresh: _load,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          // ── Header ──
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Master Inventori', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w300, color: AppTheme.textPrimary, letterSpacing: -0.5)),
              Text('${_items.length} item${_missingCost > 0 ? " · $_missingCost tanpa harga pokok" : ""}',
                style: TextStyle(fontSize: 12, color: _missingCost > 0 ? AppTheme.warning : AppTheme.textMuted)),
            ])),
            ElevatedButton.icon(
              onPressed: () => _openForm(),
              icon: const Icon(Icons.add_rounded, size: 16),
              label: const Text('Tambah', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primary, foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10), elevation: 0),
            ),
          ]),

          // ── Missing cost banner ──
          if (_missingCost > 0) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: const Color(0xFFFFFBEB),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFFDE68A)),
              ),
              child: Row(children: [
                const Icon(Icons.warning_amber_rounded, color: Color(0xFFF59E0B), size: 18),
                const SizedBox(width: 10),
                Expanded(child: Text('$_missingCost item belum ada harga pokok — estimasi margin tidak akurat.',
                  style: const TextStyle(fontSize: 12, color: Color(0xFF92400E), fontWeight: FontWeight.w500))),
              ]),
            ),
          ],

          // ── Search ──
          const SizedBox(height: 14),
          TextField(
            onChanged: (v) => setState(() => _search = v),
            decoration: InputDecoration(
              hintText: 'Cari nama item atau SKU...',
              hintStyle: const TextStyle(color: AppTheme.textMuted, fontSize: 14),
              prefixIcon: const Icon(Icons.search_rounded, color: AppTheme.textMuted, size: 20),
              filled: true, fillColor: Colors.white,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppTheme.border)),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppTheme.border)),
              focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppTheme.primary, width: 2)),
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            ),
          ),

          // ── Category chips ──
          const SizedBox(height: 10),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(children: _cats.map((cat) => GestureDetector(
              onTap: () => setState(() => _category = cat),
              child: Container(
                margin: const EdgeInsets.only(right: 6),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: _category == cat ? const Color(0xFF0F172A) : Colors.white,
                  border: Border.all(color: _category == cat ? const Color(0xFF0F172A) : AppTheme.border),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(cat, style: TextStyle(
                  fontSize: 12, fontWeight: FontWeight.w600,
                  color: _category == cat ? Colors.white : AppTheme.textSecondary)),
              ),
            )).toList()),
          ),

          // ── Item list ──
          const SizedBox(height: 14),
          if (filtered.isEmpty)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 48),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppTheme.border)),
              child: Column(children: [
                Container(width: 56, height: 56, decoration: BoxDecoration(color: const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(16)),
                  child: const Icon(Icons.inventory_2_rounded, size: 28, color: AppTheme.textMuted)),
                const SizedBox(height: 12),
                const Text('Tidak ada item', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppTheme.textSecondary)),
                const Text('Coba ubah filter atau kata pencarian', style: TextStyle(fontSize: 12, color: AppTheme.textMuted)),
              ]),
            )
          else
            ...filtered.map((rawItem) {
              final item = rawItem as Map<String, dynamic>;
              final ps     = toNum(item['packSize']);
              final pu     = item['packUnit'] as String?;
              final cp     = toNum(item['costPrice']);
              final ms     = toNum(item['minStock']);
              final track  = toBool(item['isTrackable']);
              final active = toBool(item['isActive'], fallback: true);
              final cat    = item['category'] as String?;
              final catColor = _catColor(cat);
              final unit   = item['unit'] as String? ?? '';

              String costLabel = '—';
              bool   costWarn  = false;
              if (cp != null) {
                costLabel = ps != null && pu != null ? '${_rp(cp * ps)}/$pu' : '${_rp(cp)}/$unit';
              } else if (track) {
                costLabel = 'Belum diisi';
                costWarn  = true;
              }

              String stockLabel = ms != null
                ? '${ms.round()} $unit'
                : '—';

              return Container(
                margin: const EdgeInsets.only(bottom: 10),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: catColor.withValues(alpha: 0.18)),
                  boxShadow: [BoxShadow(blurRadius: 8, spreadRadius: 0, color: catColor.withValues(alpha: 0.06), offset: const Offset(0, 2))],
                ),
                child: Column(children: [
                  // ── Top info ──
                  Padding(
                    padding: const EdgeInsets.fromLTRB(0, 14, 14, 12),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      // Color accent bar
                      Container(
                        width: 4, height: 52,
                        margin: const EdgeInsets.only(left: 14, right: 12, top: 2),
                        decoration: BoxDecoration(color: catColor, borderRadius: BorderRadius.circular(2)),
                      ),
                      // Name + meta
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Expanded(child: Text(item['name'] ?? '',
                            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Color(0xFF0F172A)))),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                            decoration: BoxDecoration(
                              color: active ? const Color(0xFFDCFCE7) : const Color(0xFFF1F5F9),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Text(active ? 'Aktif' : 'Nonaktif',
                              style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600,
                                color: active ? const Color(0xFF15803D) : const Color(0xFF94A3B8))),
                          ),
                        ]),
                        const SizedBox(height: 5),
                        Wrap(spacing: 6, runSpacing: 4, children: [
                          if (item['sku'] != null)
                            Text(item['sku'], style: const TextStyle(fontSize: 11, color: Color(0xFF64748B), fontFamily: 'monospace')),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(color: const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(4)),
                            child: Text(unit, style: const TextStyle(fontSize: 10, color: Color(0xFF475569), fontWeight: FontWeight.w600)),
                          ),
                          if (ps != null && pu != null)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(color: const Color(0xFFEFF6FF), borderRadius: BorderRadius.circular(4)),
                              child: Text('1 $pu = $ps $unit', style: const TextStyle(fontSize: 10, color: Color(0xFF2563EB), fontWeight: FontWeight.w600)),
                            ),
                        ]),
                        if (cat != null) ...[
                          const SizedBox(height: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(color: catColor.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
                            child: Text(cat, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: catColor)),
                          ),
                        ],
                      ])),
                    ]),
                  ),

                  // ── Bottom metrics strip ──
                  Container(
                    decoration: BoxDecoration(
                      color: const Color(0xFFF8FAFC),
                      border: Border(top: BorderSide(color: catColor.withValues(alpha: 0.12))),
                      borderRadius: const BorderRadius.vertical(bottom: Radius.circular(14)),
                    ),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    child: Row(children: [
                      _metricCell('Harga Pokok', costLabel, warn: costWarn),
                      _vDivider(),
                      _metricCell('Min Stok', stockLabel),
                      _vDivider(),
                      _metricCell('Tracking', track ? '✓ Ya' : '—', green: track),
                      const Spacer(),
                      GestureDetector(
                        onTap: () => _openForm(item: item),
                        child: Container(
                          padding: const EdgeInsets.all(7),
                          decoration: BoxDecoration(color: const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(8)),
                          child: const Icon(Icons.edit_rounded, size: 14, color: Color(0xFF64748B)),
                        ),
                      ),
                      const SizedBox(width: 6),
                      GestureDetector(
                        onTap: () => _confirmDelete(item),
                        child: Container(
                          padding: const EdgeInsets.all(7),
                          decoration: BoxDecoration(color: const Color(0xFFFEF2F2), borderRadius: BorderRadius.circular(8)),
                          child: const Icon(Icons.delete_rounded, size: 14, color: Color(0xFFEF4444)),
                        ),
                      ),
                    ]),
                  ),
                ]),
              );
            }),
          const SizedBox(height: 24),
        ]),
      ),
    );
  }
}

class _ItemForm extends StatefulWidget {
  final Map<String, dynamic>? item;
  final List locations;
  final VoidCallback onSaved;
  const _ItemForm({this.item, required this.locations, required this.onSaved});
  @override
  State<_ItemForm> createState() => _ItemFormState();
}

class _ItemFormState extends State<_ItemForm> {
  final _nc = TextEditingController();
  final _sc = TextEditingController();
  final _cc = TextEditingController();
  final _mc = TextEditingController();
  final _pc = TextEditingController();
  String _unit = 'pcs', _packUnit = '', _category = '';
  bool _trackable = true, _active = true, _saving = false;
  String _error = '';
  final Map<String, String> _locMin = {};

  @override
  void initState() {
    super.initState();
    final it = widget.item;
    if (it != null) {
      _nc.text = it['name'] ?? '';
      _sc.text = it['sku'] ?? '';
      _unit    = it['unit'] ?? 'pcs';
      _packUnit= it['packUnit'] ?? '';
      _category= it['category'] ?? '';
      _trackable = toBool(it['isTrackable'], fallback: true);
      _active  = toBool(it['isActive'], fallback: true);
      final ps = toNum(it['packSize']);
      if (ps != null) _pc.text = ps.toString();
      final cp = toNum(it['costPrice']);
      if (cp != null) _cc.text = (ps != null ? (cp * ps).round() : cp.round()).toString();
      final ms = toNum(it['minStock']);
      if (ms != null) _mc.text = (ps != null ? (ms / ps).round() : ms.round()).toString();
      for (final s in (it['locationSettings'] as List?) ?? []) {
        final lm = toNum(s['minStock']);
        if (lm != null) _locMin[s['locationId']] = (ps != null ? (lm / ps).round() : lm.round()).toString();
      }
    }
  }

  @override
  void dispose() { _nc.dispose(); _sc.dispose(); _cc.dispose(); _mc.dispose(); _pc.dispose(); super.dispose(); }

  Future<void> _save() async {
    if (_nc.text.trim().isEmpty) { setState(() => _error = 'Nama wajib diisi'); return; }
    setState(() { _saving = true; _error = ''; });
    try {
      final ps = double.tryParse(_pc.text);
      final cp = double.tryParse(_cc.text.replaceAll('.', ''));
      final ms = double.tryParse(_mc.text);
      final body = <String, dynamic>{
        'name': _nc.text.trim(),
        'sku': _sc.text.trim().isEmpty ? null : _sc.text.trim(),
        'category': _category.isEmpty ? null : _category,
        'unit': _unit,
        'packSize': ps,
        'packUnit': _packUnit.isEmpty ? null : _packUnit,
        'costPrice': cp == null ? null : (ps != null && ps > 0 ? cp / ps : cp),
        'minStock': ms == null ? null : (ps != null && ps > 0 ? ms * ps : ms),
        'isTrackable': _trackable,
        'isActive': _active,
      };
      if (widget.locations.isNotEmpty) {
        body['locationMinStocks'] = widget.locations.map((l) {
          final v = double.tryParse(_locMin[l['id']] ?? '');
          return {'locationId': l['id'], 'minStock': v == null ? null : (ps != null && ps > 0 ? v * ps : v)};
        }).toList();
      }
      final id = widget.item?['id'];
      if (id != null) {
        await api.patch('/api/inventory/$id', data: body);
      } else {
        await api.post('/api/inventory', data: body);
      }
      widget.onSaved();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final hasP = _packUnit.isNotEmpty;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.92),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(margin: const EdgeInsets.symmetric(vertical: 8), width: 36, height: 4, decoration: BoxDecoration(color: AppTheme.border, borderRadius: BorderRadius.circular(2))),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 8, 12),
            child: Row(children: [
              Text(widget.item != null ? 'Edit Item' : 'Tambah Item Baru', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
              const Spacer(),
              IconButton(icon: const Icon(Icons.close_rounded, color: AppTheme.textMuted), onPressed: () => Navigator.pop(context)),
            ]),
          ),
          const Divider(height: 1, color: AppTheme.border),
          Flexible(child: SingleChildScrollView(padding: const EdgeInsets.all(20), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (_error.isNotEmpty) _errBox(_error),

            _lbl('Nama Item *'), _tf(_nc, 'Contoh: Beef Patty 80gr'),
            const SizedBox(height: 14),
            Row(children: [
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [_lbl('SKU'), _tf(_sc, 'BP-001')])),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [_lbl('Satuan *'), _dd(_unit, _units, (v) => setState(() => _unit = v ?? _unit))])),
            ]),
            const SizedBox(height: 14),

            _lbl('Kemasan (opsional)'),
            Row(children: [
              const Text('1', style: TextStyle(color: AppTheme.textMuted, fontSize: 13)),
              const SizedBox(width: 8),
              Expanded(child: _dd(_packUnit.isEmpty ? null : _packUnit, _packUnits, (v) => setState(() => _packUnit = v ?? ''))),
              const SizedBox(width: 6),
              const Text('=', style: TextStyle(color: AppTheme.textMuted)),
              const SizedBox(width: 6),
              SizedBox(width: 60, child: _tf(_pc, 'Isi', num: true, center: true)),
              const SizedBox(width: 6),
              Text(_unit, style: const TextStyle(color: AppTheme.textMuted, fontSize: 13)),
            ]),
            if (hasP && _pc.text.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text('1 $_packUnit = ${_pc.text} $_unit', style: const TextStyle(fontSize: 11, color: AppTheme.primary))),
            const SizedBox(height: 14),

            _lbl('Kategori'),
            _dd(_category.isEmpty ? null : _category, [..._defaultCats, ...(_category.isNotEmpty && !_defaultCats.contains(_category) ? [_category] : [])], (v) => setState(() => _category = v ?? ''), hint: 'Pilih kategori...'),
            const SizedBox(height: 14),

            Row(children: [
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                _lbl('Harga Pokok/${hasP && _packUnit.isNotEmpty ? _packUnit : _unit}'),
                TextField(controller: _cc, keyboardType: TextInputType.number, style: const TextStyle(fontSize: 14),
                  decoration: _dec('0', prefix: 'Rp ')),
              ])),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                _lbl('Stok Minimum (${hasP && _packUnit.isNotEmpty ? _packUnit : _unit})'),
                _tf(_mc, '0', num: true),
              ])),
            ]),

            if (widget.locations.isNotEmpty) ...[
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(border: Border.all(color: AppTheme.border), borderRadius: BorderRadius.circular(12)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Minimum per Lokasi', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textPrimary)),
                  Text('Dalam ${hasP && _packUnit.isNotEmpty ? _packUnit : _unit}', style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                  const SizedBox(height: 10),
                  ...widget.locations.map((loc) {
                    final ctrl = TextEditingController(text: _locMin[loc['id']] ?? '');
                    ctrl.addListener(() => setState(() => _locMin[loc['id']] = ctrl.text));
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Row(children: [
                        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(loc['name'] ?? '', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
                          Container(padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1), decoration: BoxDecoration(color: const Color(0xFFEFF6FF), borderRadius: BorderRadius.circular(4)), child: Text(loc['type'] == 'WAREHOUSE' ? 'Gudang' : 'Outlet', style: const TextStyle(fontSize: 10, color: AppTheme.primary))),
                        ])),
                        const SizedBox(width: 8),
                        SizedBox(width: 80, child: _tf(ctrl, '0', num: true)),
                      ]),
                    );
                  }),
                ]),
              ),
            ],

            const SizedBox(height: 14),
            _toggle('Dilacak di opname', 'Nonaktifkan untuk bumbu atau garnish', _trackable, () => setState(() => _trackable = !_trackable)),
            if (widget.item != null) ...[
              const SizedBox(height: 10),
              _toggle('Status item', _active ? 'Aktif — muncul di daftar pilihan' : 'Nonaktif — tersembunyi dari form', _active, () => setState(() => _active = !_active)),
            ],
            const SizedBox(height: 20),
            Row(children: [
              Expanded(child: OutlinedButton(onPressed: () => Navigator.pop(context), style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)), side: const BorderSide(color: AppTheme.border)), child: const Text('Batal', style: TextStyle(color: AppTheme.textSecondary)))),
              const SizedBox(width: 10),
              Expanded(child: ElevatedButton(
                onPressed: _saving ? null : _save,
                style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(vertical: 14), shape: const StadiumBorder(), elevation: 0),
                child: _saving ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('Simpan', style: TextStyle(fontWeight: FontWeight.w600)),
              )),
            ]),
          ]))),
        ]),
      ),
    );
  }

  Widget _errBox(String e) => Container(margin: const EdgeInsets.only(bottom: 12), padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: const Color(0xFFFEF2F2), borderRadius: BorderRadius.circular(10), border: Border.all(color: const Color(0xFFFECACA))), child: Text(e, style: const TextStyle(color: AppTheme.danger, fontSize: 13)));

  Widget _lbl(String t) => Padding(padding: const EdgeInsets.only(bottom: 6), child: Text(t, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: AppTheme.textPrimary)));

  InputDecoration _dec(String hint, {String? prefix}) => InputDecoration(
    hintText: hint, hintStyle: const TextStyle(color: AppTheme.textMuted, fontSize: 14),
    prefixText: prefix, prefixStyle: const TextStyle(color: AppTheme.textMuted, fontSize: 14),
    filled: true, fillColor: const Color(0xFFF9FAFB),
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.border)),
    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.border)),
    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.primary, width: 2)),
    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
  );

  Widget _tf(TextEditingController c, String hint, {bool num = false, bool center = false}) => TextField(
    controller: c, keyboardType: num ? TextInputType.number : null, textAlign: center ? TextAlign.center : TextAlign.start,
    style: const TextStyle(fontSize: 14, color: AppTheme.textPrimary), decoration: _dec(hint));

  Widget _dd(String? val, List<String> opts, ValueChanged<String?> cb, {String hint = 'Pilih...'}) =>
    DropdownButtonFormField<String>(
      initialValue: opts.contains(val) ? val : null,
      hint: Text(hint, style: const TextStyle(color: AppTheme.textMuted, fontSize: 14)),
      onChanged: cb,
      style: const TextStyle(fontSize: 14, color: AppTheme.textPrimary),
      decoration: _dec(''),
      items: opts.map((o) => DropdownMenuItem(value: o, child: Text(o))).toList(),
    );

  Widget _toggle(String title, String sub, bool val, VoidCallback onTap) => GestureDetector(
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: const Color(0xFFF8FAFC), borderRadius: BorderRadius.circular(12)),
      child: Row(children: [
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: AppTheme.textPrimary)),
          Text(sub, style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
        ])),
        Container(
          width: 40, height: 24,
          decoration: BoxDecoration(color: val ? AppTheme.primary : const Color(0xFFD1D5DB), borderRadius: BorderRadius.circular(12)),
          child: AnimatedAlign(duration: const Duration(milliseconds: 150), alignment: val ? Alignment.centerRight : Alignment.centerLeft,
            child: Container(margin: const EdgeInsets.all(2), width: 20, height: 20, decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle))),
        ),
      ]),
    ),
  );
}
