import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/models/models.dart';
import '../../shared/widgets/widgets.dart';
import '../../features/auth/auth_provider.dart';

String _msg(dynamic e) {
  if (e is DioException) return e.error?.toString() ?? e.message ?? 'Terjadi kesalahan';
  return e.toString();
}

const _statusColor = {
  'PAID': Color(0xFF16A34A),
  'OPEN': Color(0xFFD97706),
  'VOID': Color(0xFFDC2626),
};
const _statusBg = {
  'PAID': Color(0xFFDCFCE7),
  'OPEN': Color(0xFFFEF3C7),
  'VOID': Color(0xFFFEE2E2),
};
const _statusLabel = {
  'PAID': 'Lunas',
  'OPEN': 'Terbuka',
  'VOID': 'Batal',
};
const _typeLabel = {
  'DINE_IN': 'Dine In',
  'TAKEAWAY': 'Takeaway',
  'DELIVERY': 'Delivery',
};

class OrdersScreen extends ConsumerStatefulWidget {
  const OrdersScreen({super.key});
  @override
  ConsumerState<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends ConsumerState<OrdersScreen> {
  List<POSOrder> _orders = [];
  bool _loading = true;
  String _search = '';
  String _dateFilter = _todayStr();
  POSOrder? _detail;

  static String _todayStr() {
    final d = DateTime.now();
    return '${d.year}-${d.month.toString().padLeft(2,'0')}-${d.day.toString().padLeft(2,'0')}';
  }

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final user = ref.read(authProvider).user!;
      final params = <String, String>{'date': _dateFilter};
      if (user.locationIds.isNotEmpty) params['locationId'] = user.locationIds.first;
      final data = await api.get('/api/pos/orders', params: params) as List;
      if (mounted) setState(() => _orders = data.map((j) => POSOrder.fromJson(Map<String, dynamic>.from(j as Map))).toList());
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(_msg(e)), backgroundColor: AppTheme.danger));
    }
    if (mounted) setState(() => _loading = false);
  }

  List<POSOrder> get _filtered => _orders.where((o) =>
    _search.isEmpty ||
    o.orderNumber.toLowerCase().contains(_search.toLowerCase()) ||
    (o.customerName?.toLowerCase().contains(_search.toLowerCase()) ?? false) ||
    (o.tableNumber?.toLowerCase().contains(_search.toLowerCase()) ?? false)
  ).toList();

  double get _totalSales => _orders.where((o) => o.status == 'PAID').fold(0, (s, o) => s + o.total);
  int get _totalTransaksi => _orders.where((o) => o.status == 'PAID').length;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.surface,
      body: Column(children: [
        // ── Filter bar ──
        Container(
          color: Colors.white,
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          child: Column(children: [
            // Search
            TextField(
              onChanged: (v) => setState(() => _search = v),
              decoration: InputDecoration(
                hintText: 'Cari nomor, nama pelanggan, meja...',
                prefixIcon: const Icon(Icons.search_rounded, size: 18, color: AppTheme.textMuted),
                contentPadding: const EdgeInsets.symmetric(vertical: 10),
                isDense: true,
                filled: true, fillColor: AppTheme.surface,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.border)),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.border)),
              ),
            ),
            const SizedBox(height: 8),
            // Date + refresh
            Row(children: [
              Expanded(child: GestureDetector(
                onTap: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: DateTime.parse(_dateFilter),
                    firstDate: DateTime(2024),
                    lastDate: DateTime.now(),
                  );
                  if (picked != null) {
                    setState(() => _dateFilter = '${picked.year}-${picked.month.toString().padLeft(2,'0')}-${picked.day.toString().padLeft(2,'0')}');
                    _load();
                  }
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(color: AppTheme.surface, borderRadius: BorderRadius.circular(10), border: Border.all(color: AppTheme.border)),
                  child: Row(children: [
                    const Icon(Icons.calendar_today_rounded, size: 14, color: AppTheme.textSecondary),
                    const SizedBox(width: 8),
                    Text(_formatDateDisplay(_dateFilter), style: const TextStyle(fontSize: 13, color: AppTheme.textPrimary)),
                  ]),
                ),
              )),
              const SizedBox(width: 8),
              GestureDetector(
                onTap: _load,
                child: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(color: AppTheme.surface, borderRadius: BorderRadius.circular(10), border: Border.all(color: AppTheme.border)),
                  child: const Icon(Icons.refresh_rounded, size: 18, color: AppTheme.textSecondary),
                ),
              ),
            ]),
          ]),
        ),
        const Divider(height: 1, color: AppTheme.border),

        // ── Stats ──
        Container(
          color: Colors.white,
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
          child: Row(children: [
            _statCard('Total Penjualan', formatRp(_totalSales), const Color(0xFF16A34A)),
            const SizedBox(width: 8),
            _statCard('Transaksi', '$_totalTransaksi', AppTheme.primary),
            const SizedBox(width: 8),
            _statCard('Rata-rata', _totalTransaksi > 0 ? formatRp(_totalSales / _totalTransaksi) : 'Rp 0', const Color(0xFFD97706)),
          ]),
        ),
        const Divider(height: 1, color: AppTheme.border),

        // ── List ──
        Expanded(child: _loading
          ? const LoadingCenter()
          : _filtered.isEmpty
            ? EmptyState(
                icon: Icons.receipt_long_rounded,
                title: _orders.isEmpty ? 'Belum ada pesanan' : 'Tidak ditemukan',
                subtitle: _orders.isEmpty ? 'Tidak ada pesanan pada tanggal ini' : 'Coba ubah kata kunci',
              )
            : ListView.separated(
                padding: const EdgeInsets.all(12),
                itemCount: _filtered.length,
                separatorBuilder: (_, i) => const SizedBox(height: 8),
                itemBuilder: (_, i) => _buildOrderCard(_filtered[i]),
              ),
        ),
      ]),

      // ── Detail sheet ──
      bottomSheet: _detail != null ? _buildDetailSheet(_detail!) : null,
    );
  }

  Widget _statCard(String label, String value, Color color) => Expanded(
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.15)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: TextStyle(fontSize: 10, color: color, fontWeight: FontWeight.w500)),
        const SizedBox(height: 3),
        Text(value, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: color)),
      ]),
    ),
  );

  Widget _buildOrderCard(POSOrder o) {
    final statusColor = _statusColor[o.status] ?? AppTheme.textMuted;
    final statusBg = _statusBg[o.status] ?? AppTheme.surface;
    final statusLabel = _statusLabel[o.status] ?? o.status;
    final typeLabel = _typeLabel[o.orderType] ?? o.orderType;

    return GestureDetector(
      onTap: () => setState(() => _detail = o),
      child: PantauCard(
        padding: const EdgeInsets.all(12),
        child: Row(children: [
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Text(o.orderNumber, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.primary, fontFamily: 'monospace')),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(color: statusBg, borderRadius: BorderRadius.circular(6)),
                child: Text(statusLabel, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: statusColor)),
              ),
            ]),
            const SizedBox(height: 4),
            Row(children: [
              Text(typeLabel, style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
              if (o.tableNumber != null) ...[
                const Text(' · ', style: TextStyle(color: AppTheme.textMuted)),
                Text('Meja ${o.tableNumber}', style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
              ],
              if (o.customerName != null) ...[
                const Text(' · ', style: TextStyle(color: AppTheme.textMuted)),
                Flexible(child: Text(o.customerName!, style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary), overflow: TextOverflow.ellipsis)),
              ],
            ]),
            const SizedBox(height: 4),
            Text(
              o.items.take(2).map((i) => '${i['name']} ×${i['qty']}').join(', ') + (o.items.length > 2 ? ' +${o.items.length - 2} lagi' : ''),
              style: const TextStyle(fontSize: 11, color: AppTheme.textMuted),
              overflow: TextOverflow.ellipsis,
            ),
          ])),
          const SizedBox(width: 12),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(formatRp(o.total), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppTheme.textPrimary)),
            const SizedBox(height: 4),
            Text(_timeOnly(o.createdAt), style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
          ]),
        ]),
      ),
    );
  }

  Widget _buildDetailSheet(POSOrder o) {
    final statusColor = _statusColor[o.status] ?? AppTheme.textMuted;
    final statusBg = _statusBg[o.status] ?? AppTheme.surface;
    final statusLabel = _statusLabel[o.status] ?? o.status;
    final typeLabel = _typeLabel[o.orderType] ?? o.orderType;

    return GestureDetector(
      onTap: () {}, // prevent sheet dismissal on tap inside
      child: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 20, offset: Offset(0, -4))],
        ),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          // Handle + header
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Column(children: [
              Container(width: 36, height: 4, decoration: BoxDecoration(color: AppTheme.border, borderRadius: BorderRadius.circular(2))),
              const SizedBox(height: 14),
              Row(children: [
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(o.orderNumber, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, fontFamily: 'monospace', color: AppTheme.textPrimary)),
                  const SizedBox(height: 2),
                  Text(formatDate(o.createdAt, withTime: true), style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
                ])),
                GestureDetector(
                  onTap: () => setState(() => _detail = null),
                  child: Container(padding: const EdgeInsets.all(6), decoration: BoxDecoration(color: AppTheme.surface, borderRadius: BorderRadius.circular(8)), child: const Icon(Icons.close_rounded, size: 16, color: AppTheme.textSecondary)),
                ),
              ]),
              const SizedBox(height: 10),
              Row(children: [
                Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3), decoration: BoxDecoration(color: statusBg, borderRadius: BorderRadius.circular(6)), child: Text(statusLabel, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: statusColor))),
                const SizedBox(width: 8),
                Text(typeLabel + (o.tableNumber != null ? ' · Meja ${o.tableNumber}' : ''), style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
              ]),
            ]),
          ),
          const SizedBox(height: 12),
          const Divider(height: 1, color: AppTheme.border),

          ConstrainedBox(
            constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.45),
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                // Items
                ...o.items.map((item) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(children: [
                    Expanded(child: Text('${item['name']}', style: const TextStyle(fontSize: 13, color: AppTheme.textPrimary))),
                    Text('×${item['qty']}', style: const TextStyle(fontSize: 13, color: AppTheme.textSecondary)),
                    const SizedBox(width: 16),
                    Text(formatRp(_d(item['subtotal'] ?? 0)), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textPrimary)),
                  ]),
                )),
                const Divider(color: AppTheme.border),
                // Totals
                _detailRow('Subtotal', formatRp(o.subtotal)),
                if (o.discountAmount > 0) _detailRow('Diskon', '-${formatRp(o.discountAmount)}', color: const Color(0xFF16A34A)),
                const SizedBox(height: 4),
                _detailRow('Total', formatRp(o.total), bold: true),
                // Payments
                if (o.payments.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  const Divider(color: AppTheme.border),
                  ...o.payments.map((p) => Column(children: [
                    _detailRow('Bayar (${p['method']})', formatRp(_d(p['amount'] ?? 0))),
                    if (_d(p['change'] ?? 0) > 0) _detailRow('Kembalian', formatRp(_d(p['change'] ?? 0))),
                  ])),
                ],
              ]),
            ),
          ),
        ]),
      ),
    );
  }

  Widget _detailRow(String label, String value, {bool bold = false, Color? color}) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 3),
    child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
      Text(label, style: TextStyle(fontSize: 13, color: color ?? AppTheme.textSecondary, fontWeight: bold ? FontWeight.w700 : FontWeight.normal)),
      Text(value, style: TextStyle(fontSize: 13, color: color ?? AppTheme.textPrimary, fontWeight: bold ? FontWeight.w700 : FontWeight.w600)),
    ]),
  );

  String _timeOnly(String iso) {
    try {
      final d = DateTime.parse(iso).toLocal();
      return '${d.hour.toString().padLeft(2,'0')}:${d.minute.toString().padLeft(2,'0')}';
    } catch (_) { return ''; }
  }

  String _formatDateDisplay(String iso) {
    try {
      final d = DateTime.parse(iso);
      const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
      return '${d.day} ${months[d.month - 1]} ${d.year}';
    } catch (_) { return iso; }
  }

  double _d(dynamic v) {
    if (v == null) return 0;
    if (v is num) return v.toDouble();
    return double.tryParse(v.toString()) ?? 0;
  }
}
