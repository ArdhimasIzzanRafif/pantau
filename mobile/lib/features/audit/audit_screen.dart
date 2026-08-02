import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';


// ── Helpers ──────────────────────────────────────────────────────────────────

String _fmtDate(String s) {
  final d = DateTime.tryParse(s);
  if (d == null) return s;
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return '${d.day} ${months[d.month - 1]} ${d.hour.toString().padLeft(2,'0')}:${d.minute.toString().padLeft(2,'0')}';
}

String _fmtLocalDate(String s) {
  final d = DateTime.tryParse(s);
  if (d == null) return s;
  return '${d.year}-${d.month.toString().padLeft(2,'0')}-${d.day.toString().padLeft(2,'0')}';
}

String _fmtRp(num n) => 'Rp ${n.round().toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => '.')}';

// ── Main Screen ───────────────────────────────────────────────────────────────

class AuditScreen extends StatefulWidget {
  const AuditScreen({super.key});
  @override
  State<AuditScreen> createState() => _AuditScreenState();
}

class _AuditScreenState extends State<AuditScreen> with SingleTickerProviderStateMixin {
  late final TabController _tab;

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 4, vsync: this);
  }

  @override
  void dispose() { _tab.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.surface,
      body: Column(children: [
        Container(
          color: Colors.white,
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Riwayat Aktivitas', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w300, color: AppTheme.textPrimary, letterSpacing: -0.5)),
            const SizedBox(height: 12),
            TabBar(
              controller: _tab,
              labelColor: AppTheme.primary,
              unselectedLabelColor: AppTheme.textMuted,
              indicatorColor: AppTheme.primary,
              labelStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
              isScrollable: true,
              tabAlignment: TabAlignment.start,
              tabs: const [
                Tab(text: 'Tutup Shift'),
                Tab(text: 'Opname'),
                Tab(text: 'Transfer'),
                Tab(text: 'Barang Masuk'),
              ],
            ),
          ]),
        ),
        const Divider(height: 1, color: AppTheme.border),
        Expanded(child: TabBarView(controller: _tab, children: const [
          _ShiftTab(),
          _OpnameTab(),
          _TransferTab(),
          _ReceiptTab(),
        ])),
      ]),
    );
  }
}

// ── Tab: Shift ────────────────────────────────────────────────────────────────

class _ShiftTab extends StatefulWidget {
  const _ShiftTab();
  @override
  State<_ShiftTab> createState() => _ShiftTabState();
}

class _ShiftTabState extends State<_ShiftTab> with AutomaticKeepAliveClientMixin {
  @override bool get wantKeepAlive => true;

  List<dynamic> _shifts = [];
  List<dynamic> _locations = [];
  bool _loading = true, _loadingMore = false;
  int _page = 1, _pages = 1;
  String _locFilter = '', _fromDate = '', _toDate = '';

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load({int page = 1}) async {
    if (page == 1) setState(() => _loading = true);
    else setState(() => _loadingMore = true);

    try {
      // Load locations sekali saja
      if (_locations.isEmpty) {
        final locs = await api.get('/api/locations') as List?;
        _locations = locs ?? [];
      }

      final params = <String, dynamic>{'status': 'CLOSED', 'page': page.toString()};
      if (_locFilter.isNotEmpty) params['locationId'] = _locFilter;

      final res = await api.get('/api/pos/shifts', params: params) as Map?;
      final items = (res?['items'] as List?) ?? [];
      if (mounted) setState(() {
        if (page == 1) _shifts = items; else _shifts = [..._shifts, ...items];
        _page  = (res?['page'] as int?) ?? page;
        _pages = (res?['pages'] as int?) ?? 1;
        _loading = false; _loadingMore = false;
      });
    } catch (_) {
      if (mounted) setState(() { _loading = false; _loadingMore = false; });
    }
  }

  List<dynamic> get _filtered {
    if (_fromDate.isEmpty && _toDate.isEmpty) return _shifts;
    return _shifts.where((s) {
      final d = _fmtLocalDate(s['closedAt'] as String? ?? s['openedAt'] as String? ?? '');
      if (_fromDate.isNotEmpty && d.compareTo(_fromDate) < 0) return false;
      if (_toDate.isNotEmpty   && d.compareTo(_toDate)   > 0) return false;
      return true;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final filtered = _filtered;
    return RefreshIndicator(
      onRefresh: () => _load(),
      child: ListView(children: [
        // ── Filter bar ──
        Container(
          color: Colors.white,
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          child: Column(children: [
            // Location dropdown
            if (_locations.isNotEmpty)
              DropdownButtonFormField<String>(
                value: _locFilter.isEmpty ? '' : _locFilter,
                decoration: _fldDec('Semua Outlet'),
                style: const TextStyle(fontSize: 13, color: AppTheme.textPrimary),
                items: [
                  const DropdownMenuItem(value: '', child: Text('Semua Outlet')),
                  ..._locations.cast<Map>().map((l) => DropdownMenuItem(value: l['id'] as String, child: Text(l['name'] as String))),
                ],
                onChanged: (v) { setState(() { _locFilter = v ?? ''; }); _load(); },
              ),
            const SizedBox(height: 8),
            // Date range
            Row(children: [
              Expanded(child: _DateField(label: 'Dari', value: _fromDate, onChanged: (v) => setState(() => _fromDate = v))),
              const Padding(padding: EdgeInsets.symmetric(horizontal: 8), child: Text('—', style: TextStyle(color: AppTheme.textMuted))),
              Expanded(child: _DateField(label: 'Sampai', value: _toDate, onChanged: (v) => setState(() => _toDate = v))),
              if (_fromDate.isNotEmpty || _toDate.isNotEmpty)
                GestureDetector(
                  onTap: () => setState(() { _fromDate = ''; _toDate = ''; }),
                  child: Padding(padding: const EdgeInsets.only(left: 8), child: Text('Reset', style: TextStyle(fontSize: 12, color: AppTheme.primary))),
                ),
            ]),
          ]),
        ),
        const Divider(height: 1, color: AppTheme.border),

        if (_loading)
          const _LoadingBox()
        else if (filtered.isEmpty)
          _emptyBox(Icons.access_time_rounded, 'Belum ada shift yang ditutup')
        else ...[
          Container(
            color: Colors.white,
            child: Column(children: filtered.asMap().entries.map((e) {
              final s = e.value as Map;
              final isLast = e.key == filtered.length - 1;
              final sales = num.tryParse(s['totalSales']?.toString() ?? '0') ?? 0;
              final cashier = (s['cashier'] as Map?)?['name'] as String? ?? '—';
              final location = (s['location'] as Map?)?['name'] as String? ?? '—';
              final closedAt = s['closedAt'] as String?;
              return _RowTile(
                isLast: isLast,
                icon: Icons.access_time_rounded,
                iconColor: const Color(0xFF64748B),
                iconBg: const Color(0xFFF1F5F9),
                title: s['shiftNumber'] as String? ?? '—',
                subtitle: '$location · $cashier',
                trailing: Text(_fmtRp(sales), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textPrimary)),
                trailingSub: closedAt != null ? _fmtDate(closedAt) : '—',
                onTap: () => context.go('/audit/shift/${s['id']}'),
              );
            }).toList()),
          ),
          // Load more
          if (_page < _pages)
            Padding(
              padding: const EdgeInsets.all(16),
              child: _loadingMore
                ? const Center(child: CircularProgressIndicator(strokeWidth: 2))
                : OutlinedButton(
                    onPressed: () => _load(page: _page + 1),
                    child: const Text('Muat lebih banyak'),
                  ),
            ),
        ],
        const SizedBox(height: 24),
      ]),
    );
  }

  InputDecoration _fldDec(String hint) => InputDecoration(
    hintText: hint, hintStyle: const TextStyle(color: AppTheme.textMuted, fontSize: 13),
    filled: true, fillColor: const Color(0xFFF9FAFB),
    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.border)),
    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.border)),
    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.primary, width: 1.5)),
  );
}

// ── Tab: Opname ───────────────────────────────────────────────────────────────

class _OpnameTab extends StatefulWidget {
  const _OpnameTab();
  @override
  State<_OpnameTab> createState() => _OpnameTabState();
}

class _OpnameTabState extends State<_OpnameTab> with AutomaticKeepAliveClientMixin {
  @override bool get wantKeepAlive => true;
  List<dynamic> _items = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await api.get('/api/opnames') as List?;
      if (mounted) setState(() { _items = res ?? []; _loading = false; });
    } catch (_) { if (mounted) setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    if (_loading) return const _LoadingBox();
    if (_items.isEmpty) return _emptyBox(Icons.fact_check_rounded, 'Belum ada opname fisik');
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(children: [
        Container(
          color: Colors.white,
          child: Column(children: _items.asMap().entries.map((e) {
            final op = e.value as Map;
            final isLast = e.key == _items.length - 1;
            final location = (op['location'] as Map?)?['name'] as String? ?? '—';
            final status = op['status'] as String? ?? '';
            final items = (op['items'] as List?) ?? [];
            final selisih = items.where((i) {
              final diff = (i as Map)['difference'];
              return diff != null && diff != 0;
            }).length;
            return _RowTile(
              isLast: isLast,
              icon: Icons.fact_check_rounded,
              iconColor: const Color(0xFF2563EB),
              iconBg: const Color(0xFFEFF6FF),
              title: location,
              subtitle: '${items.length} item${selisih > 0 ? " · $selisih selisih" : ""}',
              subtitleColor: selisih > 0 ? AppTheme.danger : null,
              trailing: _statusBadge(status, _opnameStatusMap),
              trailingSub: _fmtDate(op['createdAt'] as String? ?? ''),
              onTap: () => context.go('/opname/${op['id']}'),
            );
          }).toList()),
        ),
        const SizedBox(height: 24),
      ]),
    );
  }
}

// ── Tab: Transfer ─────────────────────────────────────────────────────────────

class _TransferTab extends StatefulWidget {
  const _TransferTab();
  @override
  State<_TransferTab> createState() => _TransferTabState();
}

class _TransferTabState extends State<_TransferTab> with AutomaticKeepAliveClientMixin {
  @override bool get wantKeepAlive => true;
  List<dynamic> _items = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await api.get('/api/transfers') as List?;
      if (mounted) setState(() { _items = res ?? []; _loading = false; });
    } catch (_) { if (mounted) setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    if (_loading) return const _LoadingBox();
    if (_items.isEmpty) return _emptyBox(Icons.swap_horiz_rounded, 'Belum ada transfer barang');
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(children: [
        Container(
          color: Colors.white,
          child: Column(children: _items.asMap().entries.map((e) {
            final tr = e.value as Map;
            final isLast = e.key == _items.length - 1;
            final from = (tr['fromLocation'] as Map?)?['name'] as String? ?? '—';
            final to   = (tr['toLocation']   as Map?)?['name'] as String? ?? '—';
            final status = tr['status'] as String? ?? '';
            final itemCount = ((tr['items'] as List?) ?? []).length;
            return _RowTile(
              isLast: isLast,
              icon: Icons.swap_horiz_rounded,
              iconColor: const Color(0xFF2563EB),
              iconBg: const Color(0xFFEFF6FF),
              title: '$from → $to',
              subtitle: '$itemCount item',
              trailing: _statusBadge(status, _transferStatusMap),
              trailingSub: _fmtDate(tr['createdAt'] as String? ?? ''),
              onTap: () => context.go('/transfer/${tr['id']}'),
            );
          }).toList()),
        ),
        const SizedBox(height: 24),
      ]),
    );
  }
}

// ── Tab: Barang Masuk ─────────────────────────────────────────────────────────

class _ReceiptTab extends StatefulWidget {
  const _ReceiptTab();
  @override
  State<_ReceiptTab> createState() => _ReceiptTabState();
}

class _ReceiptTabState extends State<_ReceiptTab> with AutomaticKeepAliveClientMixin {
  @override bool get wantKeepAlive => true;
  List<dynamic> _items = [];
  List<dynamic> _locations = [];
  bool _loading = true;
  String _fromDate = '', _toDate = '', _locFilter = '';

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        api.get('/api/goods-receipts'),
        if (_locations.isEmpty) api.get('/api/locations'),
      ]);
      if (mounted) setState(() {
        _items = (results[0] as List?) ?? [];
        if (results.length > 1) _locations = (results[1] as List?) ?? [];
        _loading = false;
      });
    } catch (_) { if (mounted) setState(() => _loading = false); }
  }

  List<dynamic> get _filtered => _items.where((r) {
    final localDate = _fmtLocalDate(r['createdAt'] as String? ?? '');
    if (_fromDate.isNotEmpty && localDate.compareTo(_fromDate) < 0) return false;
    if (_toDate.isNotEmpty   && localDate.compareTo(_toDate)   > 0) return false;
    if (_locFilter.isNotEmpty && (r['location'] as Map?)?['id'] != _locFilter) return false;
    return true;
  }).toList();

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final filtered = _filtered;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(children: [
        // ── Filter bar ──
        Container(
          color: Colors.white,
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          child: Column(children: [
            if (_locations.isNotEmpty)
              DropdownButtonFormField<String>(
                value: _locFilter.isEmpty ? '' : _locFilter,
                decoration: _fldDec('Semua Lokasi'),
                style: const TextStyle(fontSize: 13, color: AppTheme.textPrimary),
                items: [
                  const DropdownMenuItem(value: '', child: Text('Semua Lokasi')),
                  ..._locations.cast<Map>().map((l) => DropdownMenuItem(value: l['id'] as String, child: Text(l['name'] as String))),
                ],
                onChanged: (v) => setState(() => _locFilter = v ?? ''),
              ),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(child: _DateField(label: 'Dari', value: _fromDate, onChanged: (v) => setState(() => _fromDate = v))),
              const Padding(padding: EdgeInsets.symmetric(horizontal: 8), child: Text('—', style: TextStyle(color: AppTheme.textMuted))),
              Expanded(child: _DateField(label: 'Sampai', value: _toDate, onChanged: (v) => setState(() => _toDate = v))),
              if (_fromDate.isNotEmpty || _toDate.isNotEmpty || _locFilter.isNotEmpty)
                GestureDetector(
                  onTap: () => setState(() { _fromDate = ''; _toDate = ''; _locFilter = ''; }),
                  child: Padding(padding: const EdgeInsets.only(left: 8), child: Text('Reset', style: TextStyle(fontSize: 12, color: AppTheme.primary))),
                ),
            ]),
          ]),
        ),
        const Divider(height: 1, color: AppTheme.border),

        if (_loading)
          const _LoadingBox()
        else if (filtered.isEmpty)
          _emptyBox(Icons.local_shipping_rounded, 'Belum ada penerimaan barang')
        else
          Container(
            color: Colors.white,
            child: Column(children: filtered.asMap().entries.map((e) {
              final gr = e.value as Map;
              final isLast = e.key == filtered.length - 1;
              final loc = (gr['location'] as Map?)?['name'] as String? ?? '—';
              final supplier = gr['supplier'] as String?;
              final itemCount = ((gr['items'] as List?) ?? []).length;
              return _RowTile(
                isLast: isLast,
                icon: Icons.local_shipping_rounded,
                iconColor: const Color(0xFF059669),
                iconBg: const Color(0xFFECFDF5),
                title: loc,
                subtitle: '${supplier != null ? "dari $supplier · " : ""}$itemCount item',
                trailingSub: _fmtDate(gr['createdAt'] as String? ?? ''),
                onTap: () => context.go('/goods-receipt/${gr['id']}'),
              );
            }).toList()),
          ),
        const SizedBox(height: 24),
      ]),
    );
  }

  InputDecoration _fldDec(String hint) => InputDecoration(
    hintText: hint, hintStyle: const TextStyle(color: AppTheme.textMuted, fontSize: 13),
    filled: true, fillColor: const Color(0xFFF9FAFB),
    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.border)),
    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.border)),
    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.primary, width: 1.5)),
  );
}

// ── Shared widgets ─────────────────────────────────────────────────────────────

const _transferStatusMap = {
  'SENT':     ('Terkirim', Color(0xFF1D4ED8), Color(0xFFDBEAFE)),
  'RECEIVED': ('Diterima', Color(0xFF15803D), Color(0xFFDCFCE7)),
  'PENDING':  ('Pending',  Color(0xFF92400E), Color(0xFFFEF3C7)),
};
const _opnameStatusMap = {
  'DRAFT':     ('Draft',     Color(0xFF475569), Color(0xFFF1F5F9)),
  'SUBMITTED': ('Submitted', Color(0xFF15803D), Color(0xFFDCFCE7)),
};

Widget _statusBadge(String status, Map<String, (String, Color, Color)> map) {
  final cfg = map[status];
  if (cfg == null) return Text(status, style: const TextStyle(fontSize: 11, color: AppTheme.textMuted));
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
    decoration: BoxDecoration(color: cfg.$3, borderRadius: BorderRadius.circular(6)),
    child: Text(cfg.$1, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: cfg.$2)),
  );
}

Widget _emptyBox(IconData icon, String msg) => Padding(
  padding: const EdgeInsets.all(40),
  child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
    Container(width: 56, height: 56, decoration: BoxDecoration(color: const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(16)), child: Icon(icon, size: 28, color: AppTheme.textMuted)),
    const SizedBox(height: 12),
    Text(msg, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: AppTheme.textSecondary), textAlign: TextAlign.center),
  ]),
);

class _LoadingBox extends StatelessWidget {
  const _LoadingBox();
  @override
  Widget build(BuildContext context) => const Padding(
    padding: EdgeInsets.all(48),
    child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
  );
}

class _RowTile extends StatelessWidget {
  final bool isLast;
  final IconData icon;
  final Color iconColor, iconBg;
  final String title, subtitle;
  final Color? subtitleColor;
  final Widget? trailing;
  final String trailingSub;
  final VoidCallback onTap;

  const _RowTile({
    required this.isLast, required this.icon, required this.iconColor,
    required this.iconBg, required this.title, required this.subtitle,
    this.subtitleColor, this.trailing, required this.trailingSub,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      decoration: BoxDecoration(border: !isLast ? const Border(bottom: BorderSide(color: AppTheme.border)) : null),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
      child: Row(children: [
        Container(width: 38, height: 38, decoration: BoxDecoration(color: iconBg, borderRadius: BorderRadius.circular(10)), child: Icon(icon, size: 18, color: iconColor)),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textPrimary), maxLines: 1, overflow: TextOverflow.ellipsis),
          const SizedBox(height: 2),
          Text(subtitle, style: TextStyle(fontSize: 11, color: subtitleColor ?? AppTheme.textMuted), maxLines: 1, overflow: TextOverflow.ellipsis),
        ])),
        const SizedBox(width: 8),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          if (trailing != null) trailing!,
          const SizedBox(height: 2),
          Text(trailingSub, style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
        ]),
        const SizedBox(width: 4),
        const Icon(Icons.chevron_right_rounded, size: 16, color: AppTheme.border),
      ]),
    ),
  );
}

class _DateField extends StatelessWidget {
  final String label, value;
  final ValueChanged<String> onChanged;
  const _DateField({required this.label, required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: () async {
      final picked = await showDatePicker(
        context: context,
        initialDate: value.isNotEmpty ? DateTime.tryParse(value) ?? DateTime.now() : DateTime.now(),
        firstDate: DateTime(2020),
        lastDate: DateTime.now(),
        locale: const Locale('id'),
      );
      if (picked != null) {
        onChanged('${picked.year}-${picked.month.toString().padLeft(2,'0')}-${picked.day.toString().padLeft(2,'0')}');
      }
    },
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFFF9FAFB),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppTheme.border),
      ),
      child: Row(children: [
        const Icon(Icons.calendar_today_rounded, size: 13, color: AppTheme.textMuted),
        const SizedBox(width: 6),
        Expanded(child: Text(
          value.isNotEmpty ? value : label,
          style: TextStyle(fontSize: 12, color: value.isNotEmpty ? AppTheme.textPrimary : AppTheme.textMuted),
          overflow: TextOverflow.ellipsis,
        )),
      ]),
    ),
  );
}
