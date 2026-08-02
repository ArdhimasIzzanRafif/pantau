import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/widgets.dart';

class StockScreen extends ConsumerStatefulWidget {
  const StockScreen({super.key});
  @override
  ConsumerState<StockScreen> createState() => _StockScreenState();
}

class _StockScreenState extends ConsumerState<StockScreen> {
  List<dynamic> _inventory = [], _locations = [];
  // balances[locationId][itemId] = qty
  Map<String, Map<String, num>> _balances = {};
  bool _loading = true;
  String _search = '', _category = 'Semua', _filterLoc = '';

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final r = await Future.wait([
        api.get('/api/inventory'),
        api.get('/api/locations'),
        api.get('/api/stock-balances'),
      ]);
      _inventory = (r[0] as List?) ?? [];
      _locations = (r[1] as List?) ?? [];
      final raw   = (r[2] as List?) ?? [];
      _balances = {};
      for (final b in raw) {
        final locId  = b['locationId'] as String;
        final itemId = b['itemId'] as String;
        _balances.putIfAbsent(locId, () => {})[itemId] = toNum(b['quantity']) ?? 0;
      }
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  List<dynamic> get _filtered => _inventory.where((item) {
    final s = _search.toLowerCase();
    final match = item['name'].toString().toLowerCase().contains(s) || (item['sku'] ?? '').toString().toLowerCase().contains(s);
    return match && (_category == 'Semua' || item['category'] == _category);
  }).toList();

  List<String> get _cats {
    final c = _inventory.map((i) => i['category'] as String?).whereType<String>().toSet().toList()..sort();
    return ['Semua', ...c];
  }

  List<dynamic> get _visibleLocs => _filterLoc.isEmpty
    ? _locations
    : _locations.where((l) => l['id'] == _filterLoc).toList();

  Color _qtyColor(num qty, num? minStock) {
    if (qty == 0) return AppTheme.danger;
    if (minStock != null && qty < minStock) return AppTheme.warning;
    return AppTheme.textPrimary;
  }

  Color _qtyBg(num qty, num? minStock) {
    if (qty == 0) return const Color(0xFFFEF2F2);
    if (minStock != null && qty < minStock) return const Color(0xFFFFFBEB);
    return Colors.transparent;
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;
    final visLocs  = _visibleLocs;
    return Scaffold(
      backgroundColor: AppTheme.surface,
      body: _loading ? const LoadingCenter() : RefreshIndicator(
        onRefresh: _load,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Stok per Lokasi', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w300, color: AppTheme.textPrimary, letterSpacing: -0.5)),
            Text('${_inventory.length} item terlacak', style: const TextStyle(fontSize: 12, color: AppTheme.textMuted)),
          ]),
          const SizedBox(height: 12),

          // Search
          TextField(
            onChanged: (v) => setState(() => _search = v),
            decoration: InputDecoration(
              hintText: 'Cari nama item atau SKU...', hintStyle: const TextStyle(color: AppTheme.textMuted, fontSize: 14),
              prefixIcon: const Icon(Icons.search_rounded, color: AppTheme.textMuted, size: 20),
              filled: true, fillColor: Colors.white,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppTheme.border)),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppTheme.border)),
              focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppTheme.primary, width: 2)),
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            ),
          ),
          const SizedBox(height: 10),

          // Category filter
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(children: _cats.map((cat) => GestureDetector(
              onTap: () => setState(() => _category = cat),
              child: Container(
                margin: const EdgeInsets.only(right: 6),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                decoration: BoxDecoration(
                  color: _category == cat ? const Color(0xFF0F172A) : Colors.white,
                  border: Border.all(color: _category == cat ? const Color(0xFF0F172A) : AppTheme.border),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(cat, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: _category == cat ? Colors.white : AppTheme.textSecondary)),
              ),
            )).toList()),
          ),
          const SizedBox(height: 10),

          // Location tabs
          if (_locations.length > 1) ...[
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(children: [
                _locTab('Semua', ''),
                ..._locations.cast<Map>().map((l) => _locTab(l['name'] as String, l['id'] as String)),
              ]),
            ),
            const SizedBox(height: 10),
          ],

          // Stock table
          if (filtered.isEmpty)
            Container(
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppTheme.border)),
              padding: const EdgeInsets.all(40),
              child: Column(children: [
                Container(width: 56, height: 56, decoration: BoxDecoration(color: const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(16)), child: const Icon(Icons.warehouse_rounded, size: 28, color: AppTheme.textMuted)),
                const SizedBox(height: 12),
                const Text('Tidak ada item', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppTheme.textSecondary)),
              ]),
            )
          else
            Container(
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppTheme.border)),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: ConstrainedBox(
                  constraints: BoxConstraints(minWidth: MediaQuery.of(context).size.width - 32),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    // Header row
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      decoration: const BoxDecoration(
                        color: Color(0xFFF8FAFC),
                        borderRadius: BorderRadius.only(topLeft: Radius.circular(16), topRight: Radius.circular(16)),
                        border: Border(bottom: BorderSide(color: AppTheme.border)),
                      ),
                      child: Row(children: [
                        const SizedBox(
                          width: 140,
                          child: Text('Item', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppTheme.textMuted)),
                        ),
                        ...visLocs.cast<Map>().map((l) => SizedBox(
                          width: 90,
                          child: Text(l['name'] as String, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppTheme.textMuted), textAlign: TextAlign.center, overflow: TextOverflow.ellipsis, maxLines: 1),
                        )),
                      ]),
                    ),
                    ...filtered.asMap().entries.map((e) {
                      final item   = e.value as Map;
                      final isLast = e.key == filtered.length - 1;
                      final ms     = toNum(item['minStock']);
                      return Container(
                        decoration: BoxDecoration(border: !isLast ? const Border(bottom: BorderSide(color: AppTheme.border)) : null),
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        child: Row(children: [
                          SizedBox(
                            width: 140,
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(item['name'] as String, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: AppTheme.textPrimary), overflow: TextOverflow.ellipsis, maxLines: 2),
                              Text(item['unit'] as String? ?? '', style: const TextStyle(fontSize: 10, color: AppTheme.textMuted)),
                            ]),
                          ),
                          ...visLocs.cast<Map>().map((loc) {
                            final qty   = _balances[loc['id']]?[item['id']] ?? 0;
                            final color = _qtyColor(qty, ms);
                            final bg    = _qtyBg(qty, ms);
                            return SizedBox(
                              width: 90,
                              child: Center(
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                  decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(8)),
                                  child: Text('$qty', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: color), textAlign: TextAlign.center),
                                ),
                              ),
                            );
                          }),
                        ]),
                      );
                    }),
                  ]),
                ),
              ),
            ),

          const SizedBox(height: 12),
          // Legend
          Row(children: [
            _legendDot(AppTheme.danger, 'Habis'),
            const SizedBox(width: 12),
            _legendDot(AppTheme.warning, 'Di bawah minimum'),
            const SizedBox(width: 12),
            _legendDot(AppTheme.textPrimary, 'Normal'),
          ]),
          const SizedBox(height: 24),
        ]),
      ),
    );
  }

  Widget _locTab(String label, String val) => GestureDetector(
    onTap: () => setState(() => _filterLoc = val),
    child: Container(
      margin: const EdgeInsets.only(right: 6),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(color: _filterLoc == val ? AppTheme.primary : Colors.white, border: Border.all(color: _filterLoc == val ? AppTheme.primary : AppTheme.border), borderRadius: BorderRadius.circular(20)),
      child: Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: _filterLoc == val ? Colors.white : AppTheme.textSecondary)),
    ),
  );

  Widget _legendDot(Color c, String label) => Row(children: [
    Container(width: 8, height: 8, decoration: BoxDecoration(color: c, shape: BoxShape.circle)),
    const SizedBox(width: 4),
    Text(label, style: const TextStyle(fontSize: 10, color: AppTheme.textMuted)),
  ]);
}
