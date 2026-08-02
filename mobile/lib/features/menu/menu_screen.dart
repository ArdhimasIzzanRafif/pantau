import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/widgets.dart';

class MenuScreen extends ConsumerStatefulWidget {
  const MenuScreen({super.key});
  @override
  ConsumerState<MenuScreen> createState() => _MenuScreenState();
}

class _MenuScreenState extends ConsumerState<MenuScreen> {
  List<dynamic> _items = [], _inventory = [], _modifiers = [], _discountRules = [];
  bool _loading = true;
  String _search = '', _category = 'Semua';

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final r = await Future.wait([api.get('/api/menu'), api.get('/api/inventory'), api.get('/api/modifiers'), api.get('/api/discount-rules')]);
      _items         = (r[0] as List?) ?? [];
      _inventory     = (r[1] as List?) ?? [];
      _modifiers     = (r[2] as List?) ?? [];
      _discountRules = (r[3] as List?) ?? [];
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  void _openModifierForm({Map? group}) => showModalBottomSheet(
    context: context, isScrollControlled: true, backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    builder: (_) => _ModifierGroupForm(group: group, onSaved: _load),
  );

  void _openDiscountForm({Map? rule}) => showModalBottomSheet(
    context: context, isScrollControlled: true, backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    builder: (_) => _DiscountRuleForm(rule: rule, onSaved: _load),
  );

  Future<void> _deleteDiscount(Map rule) async {
    final ok = await showDialog<bool>(context: context, builder: (_) => AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      title: const Text('Hapus Aturan', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
      content: Text('Yakin hapus "${rule['name']}"?', style: const TextStyle(fontSize: 13)),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Batal')),
        ElevatedButton(onPressed: () => Navigator.pop(context, true), style: ElevatedButton.styleFrom(backgroundColor: AppTheme.danger, foregroundColor: Colors.white), child: const Text('Hapus')),
      ],
    ));
    if (ok == true && mounted) { await api.delete('/api/discount-rules/${rule['id']}'); _load(); }
  }

  Future<void> _toggleDiscount(Map rule) async {
    final newActive = !(rule['isActive'] as bool? ?? true);
    await api.put('/api/discount-rules/${rule['id']}', data: {'isActive': newActive});
    _load();
  }

  Future<void> _deleteModifier(Map group) async {
    final ok = await showDialog<bool>(context: context, builder: (_) => AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      title: const Text('Hapus Grup', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
      content: Text('Yakin hapus "${group['name']}"?', style: const TextStyle(fontSize: 13)),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Batal')),
        ElevatedButton(onPressed: () => Navigator.pop(context, true), style: ElevatedButton.styleFrom(backgroundColor: AppTheme.danger, foregroundColor: Colors.white), child: const Text('Hapus')),
      ],
    ));
    if (ok == true && mounted) { await api.delete('/api/modifiers/${group['id']}'); _load(); }
  }

  List<dynamic> get _filtered => _items.where((item) {
    final s = _search.toLowerCase();
    final match = item['name'].toString().toLowerCase().contains(s);
    return match && (_category == 'Semua' || item['category'] == _category);
  }).toList();

  List<String> get _cats {
    final c = _items.map((i) => i['category'] as String?).whereType<String>().toSet().toList()..sort();
    return ['Semua', ...c];
  }

  Map<String, String> get _invMap => {
    for (final i in _inventory) (i['id'] as String? ?? ''): (i['name'] as String? ?? ''),
  };

  String _rp(num n) => 'Rp ${n.toInt().toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => '.')}';

  Color _catColor(String? cat) {
    switch ((cat ?? '').toLowerCase()) {
      case 'makanan':  return const Color(0xFFEF4444);
      case 'minuman':  return const Color(0xFF3B82F6);
      case 'dessert':  return const Color(0xFF8B5CF6);
      case 'snack':    return const Color(0xFFF59E0B);
      case 'paket':    return const Color(0xFF10B981);
      default:         return AppTheme.primary;
    }
  }

  Widget _avatarBox(String name, Color color, [double size = 52]) => Container(
    width: size, height: size,
    color: color.withValues(alpha: 0.12),
    child: Center(child: Text(
      name.isNotEmpty ? name[0].toUpperCase() : '?',
      style: TextStyle(fontSize: size * 0.38, fontWeight: FontWeight.w700, color: color),
    )),
  );

  void _openForm({Map? item}) => showModalBottomSheet(
    context: context, isScrollControlled: true, backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    builder: (_) => _MenuForm(item: item, inventory: _inventory, onSaved: _load),
  );

  Future<void> _delete(Map item) async {
    final ok = await showDialog<bool>(context: context, builder: (_) => AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      title: const Text('Hapus Menu', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
      content: Text('Yakin hapus "${item['name']}"?', style: const TextStyle(fontSize: 13)),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Batal')),
        ElevatedButton(onPressed: () => Navigator.pop(context, true), style: ElevatedButton.styleFrom(backgroundColor: AppTheme.danger, foregroundColor: Colors.white), child: const Text('Hapus')),
      ],
    ));
    if (ok == true && mounted) {
      await api.delete('/api/menu/${item['id']}');
      _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;
    final invMap   = _invMap;

    return Scaffold(
      backgroundColor: AppTheme.surface,
      body: _loading ? const LoadingCenter() : RefreshIndicator(
        onRefresh: _load,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          // ── Header ──
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Master Menu', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w300, color: AppTheme.textPrimary, letterSpacing: -0.5)),
              Text('${_items.length} item · ${_cats.length - 1} kategori', style: const TextStyle(fontSize: 12, color: AppTheme.textMuted)),
            ])),
            ElevatedButton.icon(
              onPressed: () => _openForm(),
              icon: const Icon(Icons.add_rounded, size: 16),
              label: const Text('Tambah', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
              style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary, foregroundColor: Colors.white, shape: const StadiumBorder(), padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10), elevation: 0),
            ),
          ]),

          const SizedBox(height: 12),

          // ── Search ──
          TextField(
            onChanged: (v) => setState(() => _search = v),
            decoration: InputDecoration(
              hintText: 'Cari menu...', hintStyle: const TextStyle(color: AppTheme.textMuted, fontSize: 14),
              prefixIcon: const Icon(Icons.search_rounded, color: AppTheme.textMuted, size: 20),
              filled: true, fillColor: Colors.white,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppTheme.border)),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppTheme.border)),
              focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppTheme.primary, width: 2)),
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            ),
          ),
          const SizedBox(height: 10),

          // ── Category chips ──
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(children: _cats.map((cat) {
              final active     = _category == cat;
              final chipColor  = cat == 'Semua' ? const Color(0xFF0F172A) : _catColor(cat);
              return GestureDetector(
                onTap: () => setState(() => _category = cat),
                child: Container(
                  margin: const EdgeInsets.only(right: 6),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(
                    color: active ? chipColor : Colors.white,
                    border: Border.all(color: active ? chipColor : AppTheme.border),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(cat, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: active ? Colors.white : AppTheme.textSecondary)),
                ),
              );
            }).toList()),
          ),
          const SizedBox(height: 12),

          // ── List ──
          if (filtered.isEmpty)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 48),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppTheme.border)),
              child: Column(children: [
                Container(width: 56, height: 56, decoration: BoxDecoration(color: const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(16)), child: const Icon(Icons.restaurant_menu_rounded, size: 28, color: AppTheme.textMuted)),
                const SizedBox(height: 12),
                const Text('Belum ada menu', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppTheme.textSecondary)),
                const Text('Tambahkan item menu pertama', style: TextStyle(fontSize: 12, color: AppTheme.textMuted)),
              ]),
            )
          else
            ...filtered.map((rawItem) {
              final item     = rawItem as Map;
              final active   = toBool(item['isActive'], fallback: true);
              final name     = (item['name'] as String?) ?? '';
              final cat      = item['category'] as String?;
              final price    = toNum(item['sellPrice']) ?? 0;
              final recipe   = (item['recipeItems'] as List? ?? []);
              final color    = _catColor(cat);
              final imageUrl = item['imageUrl'] as String?;
              final sku      = item['sku'] as String?;
              final desc     = item['description'] as String?;

              final ingredientNames = recipe.take(3).map((r) {
                final child = r['childItem'] as Map?;
                final nm    = (child?['name'] as String?) ?? invMap[(r['childItemId'] as String?) ?? ''] ?? '';
                final qty   = toNum(r['quantity']);
                if (nm.isEmpty) return '';
                return qty != null ? '$nm ×${qty % 1 == 0 ? qty.toInt() : qty}' : nm;
              }).where((s) => s.isNotEmpty).toList();
              final extra = recipe.length - 3;

              return Container(
                margin: const EdgeInsets.only(bottom: 10),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: color.withValues(alpha: 0.18)),
                  boxShadow: [BoxShadow(blurRadius: 8, spreadRadius: 0, color: color.withValues(alpha: 0.06), offset: const Offset(0, 2))],
                ),
                child: Column(children: [
                  // ── Top info ──
                  Padding(
                    padding: const EdgeInsets.fromLTRB(0, 14, 14, 12),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
                      // Color accent bar
                      Container(
                        width: 4, height: 68,
                        margin: const EdgeInsets.only(left: 14, right: 12),
                        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2)),
                      ),
                      // Image / Avatar
                      ClipRRect(
                        borderRadius: BorderRadius.circular(10),
                        child: imageUrl != null && imageUrl.isNotEmpty
                          ? Image.network(imageUrl, width: 52, height: 52, fit: BoxFit.cover,
                              errorBuilder: (ctx, e, st) => _avatarBox(name, color))
                          : _avatarBox(name, color),
                      ),
                      const SizedBox(width: 12),
                      // Content
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Expanded(child: Text(name, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Color(0xFF0F172A)))),
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
                        const SizedBox(height: 3),
                        Text(_rp(price), style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: color)),
                        const SizedBox(height: 5),
                        Wrap(spacing: 6, runSpacing: 4, children: [
                          if (sku != null)
                            Text(sku, style: const TextStyle(fontSize: 11, color: Color(0xFF64748B), fontFamily: 'monospace')),
                          if (cat != null)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
                              child: Text(cat, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color)),
                            ),
                        ]),
                        if (desc != null && desc.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(desc, style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8)), maxLines: 1, overflow: TextOverflow.ellipsis),
                        ],
                      ])),
                    ]),
                  ),

                  // ── Bottom strip: resep + actions ──
                  Container(
                    decoration: BoxDecoration(
                      color: const Color(0xFFF8FAFC),
                      border: Border(top: BorderSide(color: color.withValues(alpha: 0.12))),
                      borderRadius: const BorderRadius.vertical(bottom: Radius.circular(14)),
                    ),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
                      Expanded(child: recipe.isEmpty
                        ? Row(children: const [
                            Icon(Icons.warning_amber_rounded, size: 13, color: Color(0xFFF59E0B)),
                            SizedBox(width: 5),
                            Text('Belum ada resep', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Color(0xFF92400E))),
                          ])
                        : Wrap(spacing: 4, runSpacing: 4, children: [
                            for (final ing in ingredientNames)
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(color: const Color(0xFFEFF6FF), borderRadius: BorderRadius.circular(6)),
                                child: Text(ing, style: const TextStyle(fontSize: 10, color: Color(0xFF2563EB), fontWeight: FontWeight.w500)),
                              ),
                            if (extra > 0)
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(color: const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(6)),
                                child: Text('+$extra lagi', style: const TextStyle(fontSize: 10, color: Color(0xFF64748B))),
                              ),
                          ])),
                      const SizedBox(width: 8),
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
                        onTap: () => _delete(item),
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

          // ── Modifier Groups Section ──────────────────────────────────────
          Container(
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppTheme.border)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 12, 12),
                child: Row(children: [
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('Grup Modifier', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppTheme.textPrimary)),
                    const Text('Ukuran, topping, tingkat kepedasan, dll.', style: TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                  ])),
                  ElevatedButton.icon(
                    onPressed: () => _openModifierForm(),
                    icon: const Icon(Icons.add_rounded, size: 14),
                    label: const Text('Tambah', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                    style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary, foregroundColor: Colors.white, shape: const StadiumBorder(), padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8), elevation: 0),
                  ),
                ]),
              ),
              const Divider(height: 1, color: AppTheme.border),
              if (_modifiers.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Center(child: Text('Belum ada grup modifier', style: TextStyle(fontSize: 13, color: AppTheme.textMuted))),
                )
              else
                ...(_modifiers.map((raw) {
                  final g = raw as Map;
                  final opts = (g['options'] as List? ?? []);
                  final itemCount = (g['items'] as List? ?? []).length;
                  return Container(
                    decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AppTheme.border))),
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    child: Row(children: [
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(children: [
                          Text(g['name'] as String? ?? '', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textPrimary)),
                          const SizedBox(width: 6),
                          if (g['isRequired'] == true)
                            Container(padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2), decoration: BoxDecoration(color: const Color(0xFFFEE2E2), borderRadius: BorderRadius.circular(20)), child: const Text('Wajib', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: Color(0xFFDC2626)))),
                          if ((toNum(g['maxSelect']) ?? 1) > 1) ...[
                            const SizedBox(width: 4),
                            Container(padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2), decoration: BoxDecoration(color: const Color(0xFFEFF6FF), borderRadius: BorderRadius.circular(20)), child: Text('maks ${(toNum(g['maxSelect']) ?? 1).toInt()}', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: Color(0xFF2563EB)))),
                          ],
                          const SizedBox(width: 4),
                          Text('$itemCount item', style: const TextStyle(fontSize: 10, color: AppTheme.textMuted)),
                        ]),
                        const SizedBox(height: 6),
                        Wrap(spacing: 4, runSpacing: 4, children: opts.map((o) {
                          final price = toNum(o['price']) ?? 0;
                          return Container(
                            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                            decoration: BoxDecoration(color: const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(6)),
                            child: Text(
                              price > 0 ? '${o['name']} +Rp ${price.toInt().toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => '.')}' : '${o['name']}',
                              style: const TextStyle(fontSize: 10, color: Color(0xFF475569)),
                            ),
                          );
                        }).toList()),
                      ])),
                      const SizedBox(width: 8),
                      GestureDetector(
                        onTap: () => _openModifierForm(group: g),
                        child: Container(padding: const EdgeInsets.all(7), decoration: BoxDecoration(color: const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(8)), child: const Icon(Icons.edit_rounded, size: 14, color: Color(0xFF64748B))),
                      ),
                      const SizedBox(width: 6),
                      GestureDetector(
                        onTap: () => _deleteModifier(g),
                        child: Container(padding: const EdgeInsets.all(7), decoration: BoxDecoration(color: const Color(0xFFFEF2F2), borderRadius: BorderRadius.circular(8)), child: const Icon(Icons.delete_rounded, size: 14, color: Color(0xFFEF4444))),
                      ),
                    ]),
                  );
                })),
            ]),
          ),
          const SizedBox(height: 16),

          // ── Aturan Diskon Section ──────────────────────────────────────────
          Card(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 12, 12),
                child: Row(children: [
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      const Icon(Icons.local_offer_rounded, size: 16, color: Color(0xFF16A34A)),
                      const SizedBox(width: 6),
                      const Text('Aturan Diskon', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppTheme.textPrimary)),
                    ]),
                    const Text('Saran otomatis di POS saat syarat minimum terpenuhi', style: TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                  ])),
                  ElevatedButton.icon(
                    onPressed: () => _openDiscountForm(),
                    icon: const Icon(Icons.add_rounded, size: 14),
                    label: const Text('Tambah', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                    style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF16A34A), foregroundColor: Colors.white, shape: const StadiumBorder(), padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8), elevation: 0),
                  ),
                ]),
              ),
              const Divider(height: 1, color: AppTheme.border),
              if (_discountRules.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Center(child: Text('Belum ada aturan diskon', style: TextStyle(fontSize: 13, color: AppTheme.textMuted))),
                )
              else
                ...(_discountRules.map((raw) {
                  final r = raw as Map;
                  final isActive = r['isActive'] as bool? ?? true;
                  final type = r['type'] as String? ?? 'PERCENT';
                  final value = toNum(r['value']) ?? 0;
                  final minPurchase = toNum(r['minPurchase']) ?? 0;
                  final valLabel = type == 'PERCENT' ? '${value.toInt()}%' : 'Rp ${value.toInt().toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => '.')}';
                  final minLabel = minPurchase > 0 ? ' · min. Rp ${minPurchase.toInt().toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => '.')}' : ' · selalu aktif';
                  return Container(
                    decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AppTheme.border))),
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    child: Row(children: [
                      GestureDetector(
                        onTap: () => _toggleDiscount(r),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          width: 36, height: 20,
                          decoration: BoxDecoration(borderRadius: BorderRadius.circular(10), color: isActive ? const Color(0xFF16A34A) : AppTheme.border),
                          child: AnimatedAlign(
                            duration: const Duration(milliseconds: 200),
                            alignment: isActive ? Alignment.centerRight : Alignment.centerLeft,
                            child: Container(margin: const EdgeInsets.all(2), width: 16, height: 16, decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle)),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(r['name'] as String? ?? '', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textPrimary)),
                        Text('$valLabel$minLabel', style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                      ])),
                      const SizedBox(width: 8),
                      GestureDetector(
                        onTap: () => _openDiscountForm(rule: r),
                        child: Container(padding: const EdgeInsets.all(7), decoration: BoxDecoration(color: const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(8)), child: const Icon(Icons.edit_rounded, size: 14, color: Color(0xFF64748B))),
                      ),
                      const SizedBox(width: 6),
                      GestureDetector(
                        onTap: () => _deleteDiscount(r),
                        child: Container(padding: const EdgeInsets.all(7), decoration: BoxDecoration(color: const Color(0xFFFEF2F2), borderRadius: BorderRadius.circular(8)), child: const Icon(Icons.delete_rounded, size: 14, color: Color(0xFFEF4444))),
                      ),
                    ]),
                  );
                })),
            ]),
          ),

          const SizedBox(height: 32),
        ]),
      ),
    );
  }
}

// ── Bottom-sheet form ──────────────────────────────────────────────────────

class _MenuForm extends StatefulWidget {
  final Map? item;
  final List inventory;
  final VoidCallback onSaved;
  const _MenuForm({this.item, required this.inventory, required this.onSaved});
  @override
  State<_MenuForm> createState() => _MenuFormState();
}

class _MenuFormState extends State<_MenuForm> {
  final _nameCtrl  = TextEditingController();
  final _priceCtrl = TextEditingController();
  final _descCtrl  = TextEditingController();
  final _catCtrl   = TextEditingController();
  final _skuCtrl   = TextEditingController();
  final _notesCtrl = TextEditingController();
  String _formError = '';
  bool _formActive = true, _saving = false;
  List<_RecipeRow> _recipe = [];

  @override
  void initState() {
    super.initState();
    final it = widget.item;
    if (it != null) {
      _nameCtrl.text  = (it['name'] as String?) ?? '';
      _priceCtrl.text = '${it['sellPrice'] ?? 0}';
      _descCtrl.text  = (it['description'] as String?) ?? '';
      _catCtrl.text   = (it['category'] as String?) ?? '';
      _skuCtrl.text   = (it['sku'] as String?) ?? '';
      _notesCtrl.text = (it['notes'] as String?) ?? '';
      _formActive     = toBool(it['isActive'], fallback: true);
      _recipe         = (it['recipeItems'] as List? ?? []).map((r) => _RecipeRow(itemId: (r['childItemId'] as String?) ?? '', qty: '${r['quantity'] ?? 1}')).toList();
    }
    if (_recipe.isEmpty) _recipe.add(_RecipeRow());
  }

  @override
  void dispose() { _nameCtrl.dispose(); _priceCtrl.dispose(); _descCtrl.dispose(); _catCtrl.dispose(); _skuCtrl.dispose(); _notesCtrl.dispose(); super.dispose(); }

  Future<void> _save() async {
    setState(() { _saving = true; _formError = ''; });
    try {
      if (_nameCtrl.text.trim().isEmpty) { setState(() { _formError = 'Nama wajib diisi'; _saving = false; }); return; }
      final price = int.tryParse(_priceCtrl.text.replaceAll('.', ''));
      if (price == null || price < 0) { setState(() { _formError = 'Harga tidak valid'; _saving = false; }); return; }
      final validRecipe = _recipe.where((r) => r.itemId.isNotEmpty && (double.tryParse(r.qty) ?? 0) > 0).toList();
      final body = {
        'name':        _nameCtrl.text.trim(),
        'sellPrice':   price,
        'description': _descCtrl.text.isEmpty ? null : _descCtrl.text,
        'category':    _catCtrl.text.isEmpty ? null : _catCtrl.text,
        'sku':         _skuCtrl.text.trim().isEmpty ? null : _skuCtrl.text.trim(),
        'notes':       _notesCtrl.text.isEmpty ? null : _notesCtrl.text,
        'isActive':    _formActive,
      };
      final existingId = widget.item?['id'] as String?;
      String menuId;
      if (existingId != null) {
        await api.patch('/api/menu/$existingId', data: body);
        menuId = existingId;
      } else {
        final res = await api.post('/api/menu', data: body) as Map;
        menuId = res['id'] as String;
      }
      // Resep disimpan via endpoint terpisah
      await api.put('/api/menu/$menuId/recipe', data: {
        'items': validRecipe.map((r) => {'childItemId': r.itemId, 'quantity': double.parse(r.qty)}).toList(),
      });
      widget.onSaved();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      setState(() => _formError = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.92),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(margin: const EdgeInsets.symmetric(vertical: 8), width: 36, height: 4, decoration: BoxDecoration(color: AppTheme.border, borderRadius: BorderRadius.circular(2))),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 8, 12),
            child: Row(children: [
              Text(widget.item != null ? 'Edit Menu' : 'Tambah Menu Baru', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
              const Spacer(),
              IconButton(icon: const Icon(Icons.close_rounded, color: AppTheme.textMuted), onPressed: () => Navigator.pop(context)),
            ]),
          ),
          const Divider(height: 1, color: AppTheme.border),
          Flexible(child: SingleChildScrollView(padding: const EdgeInsets.all(20), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (_formError.isNotEmpty)
              Container(margin: const EdgeInsets.only(bottom: 12), padding: const EdgeInsets.all(10), decoration: BoxDecoration(color: const Color(0xFFFEF2F2), borderRadius: BorderRadius.circular(8), border: Border.all(color: const Color(0xFFFECACA))), child: Text(_formError, style: const TextStyle(color: AppTheme.danger, fontSize: 12))),

            _lbl('Nama Menu *'),
            _tf(_nameCtrl, 'Contoh: Burger Bali Special'),
            const SizedBox(height: 12),

            Row(children: [
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                _lbl('Harga Jual *'),
                TextField(controller: _priceCtrl, keyboardType: TextInputType.number, style: const TextStyle(fontSize: 14), decoration: _dec('0', prefix: 'Rp ')),
              ])),
              const SizedBox(width: 10),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                _lbl('Kategori'),
                _tf(_catCtrl, 'Makanan, Minuman...'),
              ])),
            ]),
            const SizedBox(height: 12),

            Row(children: [
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                _lbl('SKU'),
                _tf(_skuCtrl, 'MN-001'),
              ])),
            ]),
            const SizedBox(height: 12),

            _lbl('Deskripsi'),
            TextField(controller: _descCtrl, maxLines: 2, style: const TextStyle(fontSize: 14), decoration: _dec('Deskripsi singkat menu...')),
            const SizedBox(height: 12),

            _lbl('Catatan Internal'),
            TextField(controller: _notesCtrl, maxLines: 2, style: const TextStyle(fontSize: 14), decoration: _dec('Catatan untuk tim dapur...')),
            const SizedBox(height: 14),

            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              const Text('Resep / Bahan Baku', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textPrimary)),
              TextButton.icon(
                onPressed: () => setState(() => _recipe.add(_RecipeRow())),
                icon: const Icon(Icons.add_rounded, size: 14, color: AppTheme.primary),
                label: const Text('Tambah', style: TextStyle(fontSize: 12, color: AppTheme.primary, fontWeight: FontWeight.w600)),
              ),
            ]),
            ..._recipe.asMap().entries.map((e) {
              final i = e.key; final row = e.value;
              return Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(children: [
                  Expanded(child: DropdownButtonFormField<String>(
                    initialValue: row.itemId.isEmpty ? null : row.itemId,
                    hint: const Text('Pilih bahan...', style: TextStyle(color: AppTheme.textMuted, fontSize: 12)),
                    onChanged: (v) => setState(() => _recipe[i].itemId = v ?? ''),
                    decoration: _dec(''),
                    items: widget.inventory.cast<Map>().map((it) => DropdownMenuItem<String>(
                      value: (it['id'] as String?) ?? '',
                      child: Text('${it['name']} (${it['unit']})', style: const TextStyle(fontSize: 12)),
                    )).toList(),
                  )),
                  const SizedBox(width: 6),
                  SizedBox(width: 70, child: TextField(
                    onChanged: (v) => setState(() => _recipe[i].qty = v),
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 13),
                    decoration: _dec('1'),
                    controller: TextEditingController(text: row.qty),
                  )),
                  IconButton(icon: const Icon(Icons.close_rounded, size: 16, color: AppTheme.textMuted), onPressed: () => setState(() { if (_recipe.length > 1) _recipe.removeAt(i); }), padding: const EdgeInsets.all(4), constraints: const BoxConstraints()),
                ]),
              );
            }),

            const SizedBox(height: 12),
            _toggle('Status menu', _formActive ? 'Aktif — muncul di kasir' : 'Nonaktif — tersembunyi dari kasir', _formActive, () => setState(() => _formActive = !_formActive)),
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

  Widget _lbl(String t) => Padding(padding: const EdgeInsets.only(bottom: 6), child: Text(t, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: AppTheme.textPrimary)));

  InputDecoration _dec(String hint, {String? prefix}) => InputDecoration(
    hintText: hint, hintStyle: const TextStyle(color: AppTheme.textMuted, fontSize: 13),
    prefixText: prefix, prefixStyle: const TextStyle(color: AppTheme.textMuted, fontSize: 13),
    filled: true, fillColor: const Color(0xFFF9FAFB),
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.border)),
    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.border)),
    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.primary, width: 2)),
    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
  );

  Widget _tf(TextEditingController c, String hint) => TextField(
    controller: c, style: const TextStyle(fontSize: 14, color: AppTheme.textPrimary), decoration: _dec(hint));

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

class _RecipeRow {
  String itemId = '', qty = '1';
  _RecipeRow({this.itemId = '', this.qty = '1'});
}

// ── Modifier Group Form ────────────────────────────────────────────────────────

class _ModifierGroupForm extends StatefulWidget {
  final Map? group;
  final VoidCallback onSaved;
  const _ModifierGroupForm({this.group, required this.onSaved});
  @override
  State<_ModifierGroupForm> createState() => _ModifierGroupFormState();
}

class _ModifierGroupFormState extends State<_ModifierGroupForm> {
  final _nameCtrl = TextEditingController();
  bool _isRequired = false;
  int _maxSelect = 1;
  List<Map<String, dynamic>> _options = [{'name': '', 'price': 0}];
  bool _saving = false;
  String _error = '';

  @override
  void initState() {
    super.initState();
    final g = widget.group;
    if (g != null) {
      _nameCtrl.text = g['name'] as String? ?? '';
      _isRequired = g['isRequired'] == true;
      _maxSelect = (toNum(g['maxSelect']) ?? 1).toInt();
      _options = (g['options'] as List? ?? []).map((o) => {'name': (o['name'] as String?) ?? '', 'price': (toNum(o['price']) ?? 0).toDouble()}).toList();
      if (_options.isEmpty) _options = [{'name': '', 'price': 0.0}];
    }
  }

  @override
  void dispose() { _nameCtrl.dispose(); super.dispose(); }

  Future<void> _save() async {
    if (_nameCtrl.text.trim().isEmpty) { setState(() => _error = 'Nama grup wajib diisi'); return; }
    if (_options.any((o) => (o['name'] as String).trim().isEmpty)) { setState(() => _error = 'Semua opsi harus ada namanya'); return; }
    setState(() { _saving = true; _error = ''; });
    try {
      final payload = {
        'name': _nameCtrl.text.trim(),
        'isRequired': _isRequired,
        'maxSelect': _maxSelect,
        'options': _options.where((o) => (o['name'] as String).isNotEmpty).toList(),
      };
      if (widget.group != null) {
        await api.put('/api/modifiers/${widget.group!['id']}', data: payload);
      } else {
        await api.post('/api/modifiers', data: payload);
      }
      if (mounted) { Navigator.pop(context); widget.onSaved(); }
    } catch (e) {
      setState(() { _error = 'Gagal menyimpan'; _saving = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(margin: const EdgeInsets.only(top: 10, bottom: 4), width: 36, height: 4, decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(2))),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(children: [
            Text(widget.group != null ? 'Edit Grup Modifier' : 'Tambah Grup Modifier', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppTheme.textPrimary)),
            const Spacer(),
            IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close_rounded, color: AppTheme.textMuted, size: 20), padding: EdgeInsets.zero, constraints: const BoxConstraints()),
          ]),
        ),
        const Divider(height: 1),
        ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.55),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              // Name
              const Text('Nama Grup', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textSecondary)),
              const SizedBox(height: 6),
              TextField(
                controller: _nameCtrl,
                decoration: InputDecoration(
                  hintText: 'cth: Ukuran, Topping, Tingkat Kepedasan',
                  hintStyle: const TextStyle(color: AppTheme.textMuted, fontSize: 13),
                  filled: true, fillColor: const Color(0xFFF8FAFC),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.border)),
                  enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.border)),
                  focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.primary, width: 2)),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                ),
              ),
              const SizedBox(height: 14),
              // Settings row
              Row(children: [
                GestureDetector(
                  onTap: () => setState(() => _isRequired = !_isRequired),
                  child: Row(children: [
                    Container(
                      width: 36, height: 20,
                      decoration: BoxDecoration(color: _isRequired ? AppTheme.primary : const Color(0xFFE2E8F0), borderRadius: BorderRadius.circular(10)),
                      child: AnimatedAlign(
                        duration: const Duration(milliseconds: 150),
                        alignment: _isRequired ? Alignment.centerRight : Alignment.centerLeft,
                        child: Container(margin: const EdgeInsets.all(2), width: 16, height: 16, decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle)),
                      ),
                    ),
                    const SizedBox(width: 8),
                    const Text('Wajib dipilih', style: TextStyle(fontSize: 13, color: AppTheme.textSecondary)),
                  ]),
                ),
                const SizedBox(width: 20),
                const Text('Maks:', style: TextStyle(fontSize: 13, color: AppTheme.textSecondary)),
                const SizedBox(width: 6),
                DropdownButton<int>(
                  value: _maxSelect,
                  underline: const SizedBox(),
                  isDense: true,
                  items: [1, 2, 3, 5, 99].map((v) => DropdownMenuItem(value: v, child: Text(v == 99 ? 'Bebas' : '$v', style: const TextStyle(fontSize: 13)))).toList(),
                  onChanged: (v) { if (v != null) setState(() => _maxSelect = v); },
                ),
              ]),
              const SizedBox(height: 14),
              // Options
              Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                const Text('Opsi', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textSecondary)),
                GestureDetector(
                  onTap: () => setState(() => _options.add({'name': '', 'price': 0.0})),
                  child: const Text('+ Tambah opsi', style: TextStyle(fontSize: 12, color: AppTheme.primary, fontWeight: FontWeight.w600)),
                ),
              ]),
              const SizedBox(height: 8),
              ..._options.asMap().entries.map((e) {
                final i = e.key;
                final o = e.value;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(children: [
                    Expanded(
                      child: TextField(
                        controller: TextEditingController(text: o['name'] as String)..selection = TextSelection.collapsed(offset: (o['name'] as String).length),
                        onChanged: (v) => _options[i]['name'] = v,
                        decoration: InputDecoration(
                          hintText: 'Nama opsi',
                          hintStyle: const TextStyle(color: AppTheme.textMuted, fontSize: 12),
                          filled: true, fillColor: const Color(0xFFF8FAFC),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: AppTheme.border)),
                          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: AppTheme.border)),
                          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: AppTheme.primary)),
                          contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    SizedBox(
                      width: 90,
                      child: TextField(
                        controller: TextEditingController(text: o['price'].toString()),
                        onChanged: (v) => _options[i]['price'] = double.tryParse(v) ?? 0,
                        keyboardType: TextInputType.number,
                        decoration: InputDecoration(
                          prefixText: '+Rp ', prefixStyle: const TextStyle(fontSize: 11, color: AppTheme.textMuted),
                          filled: true, fillColor: const Color(0xFFF8FAFC),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: AppTheme.border)),
                          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: AppTheme.border)),
                          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: AppTheme.primary)),
                          contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                        ),
                      ),
                    ),
                    if (_options.length > 1)
                      IconButton(
                        onPressed: () => setState(() => _options.removeAt(i)),
                        icon: const Icon(Icons.close_rounded, size: 16, color: AppTheme.textMuted),
                        padding: const EdgeInsets.only(left: 4),
                        constraints: const BoxConstraints(),
                      ),
                  ]),
                );
              }),
              if (_error.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(_error, style: const TextStyle(fontSize: 12, color: AppTheme.danger)),
              ],
            ]),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: SizedBox(
            width: double.infinity, height: 48,
            child: ElevatedButton(
              onPressed: _saving ? null : _save,
              style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary, foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)), elevation: 0),
              child: _saving ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('Simpan', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
            ),
          ),
        ),
      ]),
    );
  }
}

// ── Discount Rule Form ─────────────────────────────────────────────────────

class _DiscountRuleForm extends StatefulWidget {
  final Map? rule;
  final VoidCallback onSaved;
  const _DiscountRuleForm({this.rule, required this.onSaved});
  @override State<_DiscountRuleForm> createState() => _DiscountRuleFormState();
}

class _DiscountRuleFormState extends State<_DiscountRuleForm> {
  final _nameCtrl = TextEditingController();
  final _valueCtrl = TextEditingController();
  final _minCtrl = TextEditingController();
  String _type = 'PERCENT';
  bool _saving = false;
  String _error = '';

  @override
  void initState() {
    super.initState();
    if (widget.rule != null) {
      final r = widget.rule!;
      _nameCtrl.text = r['name'] as String? ?? '';
      _type = r['type'] as String? ?? 'PERCENT';
      _valueCtrl.text = (toNum(r['value']) ?? 0).toInt().toString();
      final min = toNum(r['minPurchase']) ?? 0;
      if (min > 0) _minCtrl.text = min.toInt().toString();
    }
  }

  @override
  void dispose() { _nameCtrl.dispose(); _valueCtrl.dispose(); _minCtrl.dispose(); super.dispose(); }

  Future<void> _save() async {
    if (_nameCtrl.text.trim().isEmpty || _valueCtrl.text.trim().isEmpty) {
      setState(() => _error = 'Nama dan nilai wajib diisi');
      return;
    }
    setState(() { _saving = true; _error = ''; });
    try {
      final data = {
        'name': _nameCtrl.text.trim(),
        'type': _type,
        'value': double.tryParse(_valueCtrl.text) ?? 0,
        'minPurchase': double.tryParse(_minCtrl.text) ?? 0,
      };
      if (widget.rule != null) {
        await api.put('/api/discount-rules/${widget.rule!['id']}', data: data);
      } else {
        await api.post('/api/discount-rules', data: data);
      }
      widget.onSaved();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  InputDecoration _dec(String hint) => InputDecoration(
    hintText: hint, hintStyle: const TextStyle(color: AppTheme.textMuted, fontSize: 13),
    filled: true, fillColor: const Color(0xFFF8FAFC),
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.border)),
    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.border)),
    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Color(0xFF16A34A), width: 1.5)),
    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
  );

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          Row(children: [
            Text(widget.rule != null ? 'Edit Aturan Diskon' : 'Tambah Aturan Diskon',
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppTheme.textPrimary)),
            const Spacer(),
            IconButton(icon: const Icon(Icons.close_rounded, color: AppTheme.textMuted), onPressed: () => Navigator.pop(context)),
          ]),
          const SizedBox(height: 14),
          if (_error.isNotEmpty)
            Padding(padding: const EdgeInsets.only(bottom: 8),
              child: Text(_error, style: const TextStyle(color: AppTheme.danger, fontSize: 12))),
          TextField(controller: _nameCtrl, decoration: _dec('Nama aturan (contoh: Happy Hour, Member)'), style: const TextStyle(fontSize: 14)),
          const SizedBox(height: 10),
          Row(children: [
            for (final dt in [('PERCENT', '%'), ('AMOUNT', 'Rp')])
              GestureDetector(
                onTap: () => setState(() => _type = dt.$1),
                child: Container(
                  margin: EdgeInsets.only(right: dt.$1 == 'PERCENT' ? 8 : 0),
                  padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
                  decoration: BoxDecoration(
                    color: _type == dt.$1 ? const Color(0xFF16A34A) : Colors.white,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: _type == dt.$1 ? const Color(0xFF16A34A) : AppTheme.border),
                  ),
                  child: Text(dt.$2, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: _type == dt.$1 ? Colors.white : AppTheme.textSecondary)),
                ),
              ),
            const SizedBox(width: 0),
            Expanded(child: TextField(
              controller: _valueCtrl,
              keyboardType: TextInputType.number,
              decoration: _dec(_type == 'PERCENT' ? 'Nilai % (contoh: 10)' : 'Nilai Rp'),
              style: const TextStyle(fontSize: 14),
            )),
          ]),
          const SizedBox(height: 10),
          TextField(controller: _minCtrl, keyboardType: TextInputType.number, decoration: _dec('Min. pembelian Rp (opsional, 0 = selalu aktif)'), style: const TextStyle(fontSize: 14)),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity, height: 48,
            child: ElevatedButton(
              onPressed: _saving ? null : _save,
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF16A34A), foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)), elevation: 0),
              child: _saving ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : Text(widget.rule != null ? 'Simpan Perubahan' : 'Buat Aturan', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
            ),
          ),
        ]),
      ),
    );
  }
}
