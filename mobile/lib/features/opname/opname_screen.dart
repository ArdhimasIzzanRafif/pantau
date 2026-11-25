import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/widgets.dart';
import '../auth/auth_provider.dart';

class OpnameScreen extends ConsumerStatefulWidget {
  const OpnameScreen({super.key});
  @override
  ConsumerState<OpnameScreen> createState() => _OpnameScreenState();
}

class _OpnameScreenState extends ConsumerState<OpnameScreen> {
  List<dynamic> _opnames = [], _locations = [], _inventory = [];
  bool _loading = true;
  // view: 'list' | 'create' | 'detail'
  String _view = 'list';
  Map? _detail;

  // Create form
  String _locId = '';
  DateTime _periodStart = DateTime.now().subtract(const Duration(days: 1));
  DateTime _periodEnd = DateTime.now();
  final Map<String, String> _physQty = {};
  final Map<String, String> _inputUnit = {};
  bool _submitting = false;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final r = await Future.wait([
        api.get('/api/opnames'),
        api.get('/api/locations'),
        api.get('/api/inventory'),
      ]);
      _opnames = asList(r[0]);
      _locations = (r[1] as List?) ?? [];
      _inventory = (r[2] as List?) ?? [];
      if (_locId.isEmpty && _locations.isNotEmpty) {
        _locId = _locations[0]['id'] as String;
      }
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _loadDetail(String id) async {
    try {
      final d = await api.get('/api/opnames/$id');
      setState(() {
        _detail = d;
        _view = 'detail';
      });
    } catch (_) {}
  }

  // Semua item boleh dihitung agar saldo fisiknya dapat diperbarui. Namun hanya
  // item terlacak yang diklasifikasikan sebagai selisih oleh laporan opname.
  List<dynamic> get _opnameItems => _inventory;

  Future<void> _submit() async {
    setState(() {
      _submitting = true;
      _error = '';
    });
    try {
      if (_periodEnd.isBefore(_periodStart)) {
        setState(() {
          _error = 'Tanggal akhir harus setelah tanggal awal';
          _submitting = false;
        });
        return;
      }
      if (_periodEnd.isAfter(DateTime.now())) {
        setState(() {
          _error = 'Tidak boleh tanggal yang akan datang';
          _submitting = false;
        });
        return;
      }
      final filled = _physQty.entries.where((e) => e.value.isNotEmpty).toList();
      if (filled.isEmpty) {
        setState(() {
          _error = 'Isi minimal 1 data stok fisik';
          _submitting = false;
        });
        return;
      }

      final items = filled.map((e) {
        final item = _inventory.cast<Map>().firstWhere((i) => i['id'] == e.key);
        final ps = toNum(item['packSize'])?.toDouble();
        final unit = _inputUnit[e.key] ?? 'base';
        final qty = double.tryParse(e.value) ?? 0;
        final qtyBase = (unit == 'pack' && ps != null) ? qty * ps : qty;
        return {'itemId': e.key, 'physicalQty': qtyBase};
      }).toList();

      await api.post(
        '/api/opnames',
        data: {
          'locationId': _locId,
          'periodStart': _periodStart.toIso8601String(),
          'periodEnd': _periodEnd.toIso8601String(),
          'submit': true,
          'items': items,
        },
      );
      setState(() {
        _view = 'list';
        _physQty.clear();
        _inputUnit.clear();
      });
      _load();
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  String _fmtDt(DateTime dt) =>
      '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';

  Future<void> _pickDt(bool isStart) async {
    final d = await showDatePicker(
      context: context,
      initialDate: isStart ? _periodStart : _periodEnd,
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
    );
    if (d == null) return;
    if (!mounted) return;
    final t = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(isStart ? _periodStart : _periodEnd),
    );
    if (t == null) return;
    final result = DateTime(d.year, d.month, d.day, t.hour, t.minute);
    setState(() {
      if (isStart) {
        _periodStart = result;
      } else {
        _periodEnd = result;
      }
    });
  }

  String _rp(num n) =>
      'Rp ${n.toInt().toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => '.')}';

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    final isOwner = user?.isOwner ?? false;

    if (_view == 'create') return _buildCreate(isOwner);
    if (_view == 'detail' && _detail != null) return _buildDetail(isOwner);

    return Scaffold(
      backgroundColor: AppTheme.surface,
      body: _loading
          ? const LoadingCenter()
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Opname Fisik',
                              style: TextStyle(
                                fontSize: 22,
                                fontWeight: FontWeight.w300,
                                color: AppTheme.textPrimary,
                                letterSpacing: -0.5,
                              ),
                            ),
                            Text(
                              'Cocokkan stok sistem dengan kondisi nyata',
                              style: TextStyle(
                                fontSize: 12,
                                color: AppTheme.textMuted,
                              ),
                            ),
                          ],
                        ),
                      ),
                      ElevatedButton.icon(
                        onPressed: () => setState(() {
                          _view = 'create';
                          _error = '';
                          _physQty.clear();
                          _inputUnit.clear();
                        }),
                        icon: const Icon(Icons.add_rounded, size: 16),
                        label: const Text(
                          'Opname Baru',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.primary,
                          foregroundColor: Colors.white,
                          shape: const StadiumBorder(),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 10,
                          ),
                          elevation: 0,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),

                  if (_opnames.isEmpty)
                    Container(
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: AppTheme.border),
                      ),
                      padding: const EdgeInsets.all(40),
                      child: Column(
                        children: [
                          Container(
                            width: 56,
                            height: 56,
                            decoration: BoxDecoration(
                              color: const Color(0xFFF1F5F9),
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: const Icon(
                              Icons.fact_check_rounded,
                              size: 28,
                              color: AppTheme.textMuted,
                            ),
                          ),
                          const SizedBox(height: 12),
                          const Text(
                            'Belum ada opname',
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                              color: AppTheme.textSecondary,
                            ),
                          ),
                          const Text(
                            'Mulai opname pertama untuk mencocokkan stok',
                            style: TextStyle(
                              fontSize: 12,
                              color: AppTheme.textMuted,
                            ),
                          ),
                        ],
                      ),
                    )
                  else
                    ..._opnames.map((op) {
                      final itemCount = (op['items'] as List?)?.length ?? 0;
                      final shortage = (op['items'] as List? ?? [])
                          .where(
                            (i) =>
                                toBool(i['item']?['isTrackable']) &&
                                (toNum(i['difference']) ?? 0) < 0,
                          )
                          .length;
                      return GestureDetector(
                        onTap: () => _loadDetail(op['id'] as String),
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: AppTheme.border),
                          ),
                          padding: const EdgeInsets.all(14),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Container(
                                    width: 40,
                                    height: 40,
                                    decoration: BoxDecoration(
                                      color: const Color(0xFFF0FDF4),
                                      borderRadius: BorderRadius.circular(10),
                                    ),
                                    child: const Icon(
                                      Icons.fact_check_rounded,
                                      size: 20,
                                      color: Color(0xFF22C55E),
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          op['location']?['name'] ?? '',
                                          style: const TextStyle(
                                            fontSize: 13,
                                            fontWeight: FontWeight.w700,
                                            color: AppTheme.textPrimary,
                                          ),
                                        ),
                                        Text(
                                          formatDate(
                                            op['createdAt'] as String,
                                            withTime: true,
                                          ),
                                          style: const TextStyle(
                                            fontSize: 11,
                                            color: AppTheme.textMuted,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  const Icon(
                                    Icons.chevron_right_rounded,
                                    size: 18,
                                    color: AppTheme.textMuted,
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Wrap(
                                spacing: 6,
                                children: [
                                  _badge(
                                    '$itemCount item',
                                    const Color(0xFFEFF6FF),
                                    AppTheme.primary,
                                  ),
                                  if (shortage > 0)
                                    _badge(
                                      '$shortage selisih',
                                      const Color(0xFFFEF2F2),
                                      AppTheme.danger,
                                    ),
                                  _badge(
                                    '${formatDate(op['periodStart'] as String)} – ${formatDate(op['periodEnd'] as String)}',
                                    const Color(0xFFF8FAFC),
                                    AppTheme.textSecondary,
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      );
                    }),
                  const SizedBox(height: 24),
                ],
              ),
            ),
    );
  }

  Widget _buildCreate(bool isOwner) {
    final items = _opnameItems;
    return Scaffold(
      backgroundColor: AppTheme.surface,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          icon: const Icon(
            Icons.arrow_back_rounded,
            color: AppTheme.textPrimary,
          ),
          onPressed: () => setState(() => _view = 'list'),
        ),
        title: const Text(
          'Opname Baru',
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            color: AppTheme.textPrimary,
          ),
        ),
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(1),
          child: Divider(height: 1, color: AppTheme.border),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_error.isNotEmpty)
            Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFFEF2F2),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFFFECACA)),
              ),
              child: Text(
                _error,
                style: const TextStyle(color: AppTheme.danger, fontSize: 13),
              ),
            ),

          _lbl('Lokasi *'),
          DropdownButtonFormField<String>(
            initialValue: _locId.isEmpty ? null : _locId,
            onChanged: (v) => setState(() => _locId = v ?? ''),
            decoration: _fldDec(),
            items: _locations
                .cast<Map>()
                .map(
                  (l) => DropdownMenuItem<String>(
                    value: l['id'] as String,
                    child: Text(
                      l['name'] as String,
                      style: const TextStyle(fontSize: 13),
                    ),
                  ),
                )
                .toList(),
          ),
          const SizedBox(height: 12),

          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _lbl('Dari'),
                    GestureDetector(
                      onTap: () => _pickDt(true),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 13,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF9FAFB),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: AppTheme.border),
                        ),
                        child: Row(
                          children: [
                            const Icon(
                              Icons.calendar_today_rounded,
                              size: 14,
                              color: AppTheme.textMuted,
                            ),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(
                                _fmtDt(_periodStart),
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: AppTheme.textPrimary,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _lbl('Sampai'),
                    GestureDetector(
                      onTap: () => _pickDt(false),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 13,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF9FAFB),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: AppTheme.border),
                        ),
                        child: Row(
                          children: [
                            const Icon(
                              Icons.calendar_today_rounded,
                              size: 14,
                              color: AppTheme.textMuted,
                            ),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(
                                _fmtDt(_periodEnd),
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: AppTheme.textPrimary,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          const Text(
            'Stok Fisik per Item',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppTheme.textPrimary,
            ),
          ),
          if (!isOwner)
            const Padding(
              padding: EdgeInsets.only(top: 4, bottom: 4),
              child: Text(
                'Masukkan stok yang kamu hitung secara fisik di lokasi ini.',
                style: TextStyle(fontSize: 12, color: AppTheme.textMuted),
              ),
            ),
          const SizedBox(height: 8),

          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppTheme.border),
            ),
            child: Column(
              children: items.asMap().entries.map((e) {
                final i = e.key;
                final item = e.value as Map;
                final hasPack =
                    item['packSize'] != null && item['packUnit'] != null;
                final unit = _inputUnit[item['id']] ?? 'base';
                final isLast = i == items.length - 1;
                return Container(
                  decoration: BoxDecoration(
                    border: !isLast
                        ? const Border(
                            bottom: BorderSide(color: AppTheme.border),
                          )
                        : null,
                  ),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 10,
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              item['name'] as String,
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w500,
                                color: AppTheme.textPrimary,
                              ),
                            ),
                            Text(
                              toBool(item['isTrackable'])
                                  ? '${item['unit']} · Terlacak'
                                  : '${item['unit']} · Hanya memperbarui stok',
                              style: const TextStyle(
                                fontSize: 11,
                                color: AppTheme.textMuted,
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (hasPack)
                        SizedBox(
                          width: 90,
                          child: DropdownButtonFormField<String>(
                            initialValue: unit,
                            onChanged: (v) => setState(
                              () => _inputUnit[item['id']] = v ?? 'base',
                            ),
                            decoration: _fldDec(),
                            items: [
                              DropdownMenuItem(
                                value: 'base',
                                child: Text(
                                  item['unit'] as String,
                                  style: const TextStyle(fontSize: 11),
                                ),
                              ),
                              DropdownMenuItem(
                                value: 'pack',
                                child: Text(
                                  item['packUnit'] as String,
                                  style: const TextStyle(fontSize: 11),
                                ),
                              ),
                            ],
                          ),
                        ),
                      const SizedBox(width: 8),
                      SizedBox(
                        width: 80,
                        child: TextField(
                          onChanged: (v) =>
                              setState(() => _physQty[item['id']] = v),
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 13),
                          decoration: _fldDec(hint: '0'),
                        ),
                      ),
                    ],
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 16),

          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => setState(() => _view = 'list'),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    side: const BorderSide(color: AppTheme.border),
                  ),
                  child: const Text(
                    'Batal',
                    style: TextStyle(color: AppTheme.textSecondary),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: _submitting ? null : _submit,
                  icon: _submitting
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.check_circle_rounded, size: 16),
                  label: Text(
                    _submitting ? 'Menyimpan...' : 'Simpan & Sesuaikan Stok',
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: const StadiumBorder(),
                    elevation: 0,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _buildDetail(bool isOwner) {
    final d = _detail!;
    final items = (d['items'] as List?) ?? [];
    final trackedItems = items.where((i) => toBool(i['item']?['isTrackable']));
    final shortage = trackedItems
        .where((i) => (toNum(i['difference']) ?? 0) < 0)
        .length;
    final surplus = trackedItems
        .where((i) => (toNum(i['difference']) ?? 0) > 0)
        .length;
    final estLoss = trackedItems.fold<num>(
      0,
      (sum, i) => sum + (toNum(i['estimatedLoss']) ?? 0),
    );
    final totalItems = items.length;

    return Scaffold(
      backgroundColor: AppTheme.surface,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          icon: const Icon(
            Icons.arrow_back_rounded,
            color: AppTheme.textPrimary,
          ),
          onPressed: () => setState(() => _view = 'list'),
        ),
        title: Text(
          d['location']?['name'] ?? 'Detail Opname',
          style: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            color: AppTheme.textPrimary,
          ),
        ),
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(1),
          child: Divider(height: 1, color: AppTheme.border),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Summary cards
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 2.2,
            children: [
              _summCard(
                'Total Item',
                '$totalItems',
                Icons.inventory_2_rounded,
                const Color(0xFFEFF6FF),
                AppTheme.primary,
              ),
              _summCard(
                'Kekurangan',
                '$shortage',
                Icons.arrow_downward_rounded,
                const Color(0xFFFEF2F2),
                AppTheme.danger,
              ),
              _summCard(
                'Kelebihan',
                '$surplus',
                Icons.arrow_upward_rounded,
                const Color(0xFFF0FDF4),
                const Color(0xFF22C55E),
              ),
              if (isOwner)
                _summCard(
                  'Est. Kerugian',
                  _rp(estLoss),
                  Icons.trending_down_rounded,
                  const Color(0xFFFEF2F2),
                  AppTheme.danger,
                ),
            ],
          ),
          const SizedBox(height: 14),

          Text(
            '${formatDate(d['periodStart'] as String)} – ${formatDate(d['periodEnd'] as String)}',
            style: const TextStyle(fontSize: 12, color: AppTheme.textMuted),
          ),
          const SizedBox(height: 10),

          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppTheme.border),
            ),
            child: Column(
              children: items.asMap().entries.map((e) {
                final i = e.key;
                final item = e.value as Map;
                final diff = toNum(item['difference']) ?? 0;
                final isTrackable = toBool(item['item']?['isTrackable']);
                final isLast = i == items.length - 1;
                return Container(
                  decoration: BoxDecoration(
                    border: !isLast
                        ? const Border(
                            bottom: BorderSide(color: AppTheme.border),
                          )
                        : null,
                  ),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 10,
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 4,
                        height: 32,
                        decoration: BoxDecoration(
                          color: !isTrackable
                              ? AppTheme.border
                              : diff < 0
                              ? AppTheme.danger
                              : diff > 0
                              ? const Color(0xFF22C55E)
                              : AppTheme.border,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              item['item']?['name'] ?? '',
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w500,
                                color: AppTheme.textPrimary,
                              ),
                            ),
                            Text(
                              'Fisik: ${item['physicalQty']} · ${item['item']?['unit'] ?? ''}',
                              style: const TextStyle(
                                fontSize: 11,
                                color: AppTheme.textMuted,
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (isOwner)
                        Text(
                          'Sistem: ${item['systemQty']}',
                          style: const TextStyle(
                            fontSize: 11,
                            color: AppTheme.textSecondary,
                          ),
                        ),
                      const SizedBox(width: 8),
                      Text(
                        isTrackable
                            ? (diff >= 0 ? '+$diff' : '$diff')
                            : 'Stok diperbarui',
                        style: TextStyle(
                          fontSize: isTrackable ? 13 : 11,
                          fontWeight: FontWeight.w700,
                          color: !isTrackable
                              ? AppTheme.textMuted
                              : diff < 0
                              ? AppTheme.danger
                              : diff > 0
                              ? const Color(0xFF22C55E)
                              : AppTheme.textMuted,
                        ),
                      ),
                    ],
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _summCard(
    String title,
    String val,
    IconData icon,
    Color bg,
    Color color,
  ) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: AppTheme.border),
    ),
    child: Row(
      children: [
        Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(icon, size: 16, color: color),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 10,
                  color: AppTheme.textMuted,
                  fontWeight: FontWeight.w500,
                ),
              ),
              Text(
                val,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: color,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ],
    ),
  );

  Widget _badge(String t, Color bg, Color text) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
    decoration: BoxDecoration(
      color: bg,
      borderRadius: BorderRadius.circular(20),
    ),
    child: Text(
      t,
      style: TextStyle(fontSize: 11, color: text, fontWeight: FontWeight.w600),
    ),
  );
  Widget _lbl(String t) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Text(
      t,
      style: const TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w500,
        color: AppTheme.textPrimary,
      ),
    ),
  );

  InputDecoration _fldDec({String? hint}) => InputDecoration(
    hintText: hint,
    hintStyle: const TextStyle(color: AppTheme.textMuted, fontSize: 13),
    filled: true,
    fillColor: Colors.white,
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: const BorderSide(color: AppTheme.border),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: const BorderSide(color: AppTheme.border),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: const BorderSide(color: AppTheme.primary, width: 2),
    ),
    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
  );
}
