import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';

String _fmtRp(num n) => 'Rp ${n.round().toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => '.')}';

String _fmtDateLong(String s) {
  final d = DateTime.tryParse(s);
  if (d == null) return s;
  const days = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'];
  const months = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  final wd = days[d.weekday - 1];
  return '$wd, ${d.day} ${months[d.month - 1]} ${d.year} ${d.hour.toString().padLeft(2,'0')}:${d.minute.toString().padLeft(2,'0')}';
}

String _fmtTime(String s) {
  final d = DateTime.tryParse(s);
  if (d == null) return s;
  return '${d.hour.toString().padLeft(2,'0')}:${d.minute.toString().padLeft(2,'0')}';
}

const _orderTypeLabels = {'DINE_IN': 'Dine In', 'TAKEAWAY': 'Takeaway', 'DELIVERY': 'Delivery'};

class AuditShiftDetailScreen extends StatefulWidget {
  final String id;
  const AuditShiftDetailScreen({super.key, required this.id});
  @override
  State<AuditShiftDetailScreen> createState() => _State();
}

class _State extends State<AuditShiftDetailScreen> {
  Map<String, dynamic>? _shift;
  bool _loading = true;
  String _error = '';

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await api.get('/api/pos/shifts/${widget.id}') as Map?;
      if (mounted) setState(() { _shift = res?.cast<String, dynamic>(); _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = 'Data tidak ditemukan'; _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return Scaffold(
      backgroundColor: AppTheme.surface,
      appBar: _appBar(null),
      body: const Center(child: CircularProgressIndicator(strokeWidth: 2)),
    );
    if (_error.isNotEmpty || _shift == null) return Scaffold(
      backgroundColor: AppTheme.surface,
      appBar: _appBar(null),
      body: Center(child: Text(_error.isNotEmpty ? _error : 'Tidak ditemukan', style: const TextStyle(color: AppTheme.textMuted))),
    );

    final s = _shift!;
    final cashier  = (s['cashier']  as Map?)?['name'] as String? ?? '—';
    final location = (s['location'] as Map?)?['name'] as String? ?? '—';
    final openedAt = s['openedAt'] as String? ?? '';
    final closedAt = s['closedAt'] as String?;
    final notes    = s['notes'] as String?;
    final totalSales   = num.tryParse(s['totalSales']?.toString() ?? '0') ?? 0;
    final totalOrders  = s['totalOrders'] as int? ?? 0;
    final openingBal   = num.tryParse(s['openingBalance']?.toString() ?? '0') ?? 0;
    final closingBal   = s['closingBalance'] != null ? num.tryParse(s['closingBalance'].toString()) : null;
    final orders       = (s['orders'] as List?) ?? [];

    int? dur;
    if (closedAt != null) {
      final open  = DateTime.tryParse(openedAt);
      final close = DateTime.tryParse(closedAt);
      if (open != null && close != null) dur = close.difference(open).inMinutes;
    }

    return Scaffold(
      backgroundColor: AppTheme.surface,
      appBar: _appBar(s['shiftNumber'] as String?),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        // ── Subtitle ──
        Text(location, style: const TextStyle(fontSize: 13, color: AppTheme.textMuted)),
        const SizedBox(height: 16),

        // ── Summary cards ──
        GridView.count(crossAxisCount: 2, shrinkWrap: true, physics: const NeverScrollableScrollPhysics(), childAspectRatio: 2.2, crossAxisSpacing: 10, mainAxisSpacing: 10, children: [
          _SummaryCard('Total Penjualan', _fmtRp(totalSales), const Color(0xFF1D4ED8)),
          _SummaryCard('Jumlah Order',   totalOrders.toString(), AppTheme.textPrimary),
          _SummaryCard('Kas Awal',       _fmtRp(openingBal),  AppTheme.textPrimary),
          _SummaryCard('Kas Akhir',      closingBal != null ? _fmtRp(closingBal) : '—', AppTheme.textPrimary),
        ]),
        const SizedBox(height: 12),

        // ── Info block ──
        Container(
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppTheme.border)),
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              const Icon(Icons.access_time_rounded, size: 16, color: AppTheme.textMuted),
              const SizedBox(width: 8),
              const Text('Info Shift', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textPrimary)),
            ]),
            const SizedBox(height: 12),
            _InfoRow('Kasir',  cashier),
            _InfoRow('Buka',   _fmtDateLong(openedAt)),
            _InfoRow('Tutup',  closedAt != null ? _fmtDateLong(closedAt) : 'Belum ditutup'),
            _InfoRow('Durasi', dur != null ? (dur >= 60 ? '${dur ~/ 60} jam ${dur % 60} menit' : '$dur menit') : '—'),
            if (notes != null && notes.isNotEmpty) _InfoRow('Catatan', notes),
          ]),
        ),
        const SizedBox(height: 12),

        // ── Orders ──
        Container(
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppTheme.border)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
              child: Row(children: [
                const Icon(Icons.shopping_bag_rounded, size: 16, color: AppTheme.textMuted),
                const SizedBox(width: 8),
                const Expanded(child: Text('Transaksi dalam Shift', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textPrimary))),
                Text('${orders.length} order', style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
              ]),
            ),
            const Divider(height: 1, color: AppTheme.border),

            if (orders.isEmpty)
              const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: Text('Tidak ada transaksi', style: TextStyle(fontSize: 13, color: AppTheme.textMuted))),
              )
            else ...[
              ...orders.asMap().entries.map((e) {
                final o      = e.value as Map;
                final isLast = e.key == orders.length - 1;
                final isVoid = o['status'] == 'VOID';
                final total  = num.tryParse(o['total']?.toString() ?? '0') ?? 0;
                final items  = (o['items'] as List?) ?? [];
                final pays   = (o['payments'] as List?) ?? [];
                final voidReason = o['voidReason'] as String?;
                final orderType  = _orderTypeLabels[o['orderType']] ?? (o['orderType'] as String? ?? '');

                return Container(
                  decoration: BoxDecoration(
                    color: isVoid ? const Color(0xFFFFF5F5) : null,
                    border: !isLast ? const Border(bottom: BorderSide(color: AppTheme.border)) : null,
                  ),
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Expanded(child: Row(children: [
                        Text(
                          o['orderNumber'] as String? ?? '—',
                          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, fontFamily: 'monospace', color: isVoid ? AppTheme.textMuted : AppTheme.textPrimary, decoration: isVoid ? TextDecoration.lineThrough : null),
                        ),
                        const SizedBox(width: 6),
                        Text(orderType, style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                        if (isVoid) ...[
                          const SizedBox(width: 6),
                          Container(padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2), decoration: BoxDecoration(color: const Color(0xFFFEE2E2), borderRadius: BorderRadius.circular(6)), child: const Text('Void', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: Color(0xFFDC2626)))),
                        ],
                      ])),
                      Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                        Text(_fmtRp(total), style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: isVoid ? AppTheme.textMuted : AppTheme.textPrimary, decoration: isVoid ? TextDecoration.lineThrough : null)),
                        Text(_fmtTime(o['createdAt'] as String? ?? ''), style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                      ]),
                    ]),
                    if (items.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 3),
                        child: Text(
                          items.map((i) => '${(i as Map)['name']} ×${i['qty'] ?? i['quantity'] ?? 1}').join(', '),
                          style: const TextStyle(fontSize: 11, color: AppTheme.textMuted),
                          maxLines: 2, overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    if (!isVoid && pays.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 3),
                        child: Wrap(spacing: 12, children: pays.map((p) {
                          final pm     = (p as Map);
                          final method = pm['method'] as String? ?? '';
                          final amt    = num.tryParse(pm['amount']?.toString() ?? '0') ?? 0;
                          final change = num.tryParse(pm['change']?.toString() ?? '0') ?? 0;
                          return Text(
                            '${method == "CASH" ? "Tunai" : method} ${_fmtRp(amt)}${change > 0 ? " · Kembalian ${_fmtRp(change)}" : ""}',
                            style: const TextStyle(fontSize: 11, color: AppTheme.textMuted),
                          );
                        }).toList()),
                      ),
                    if (isVoid && voidReason != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 3),
                        child: Text('Alasan: $voidReason', style: const TextStyle(fontSize: 11, color: Color(0xFFDC2626))),
                      ),
                  ]),
                );
              }),
              // Total footer
              Container(
                decoration: const BoxDecoration(
                  color: Color(0xFFF8FAFC),
                  borderRadius: BorderRadius.only(bottomLeft: Radius.circular(15), bottomRight: Radius.circular(15)),
                  border: Border(top: BorderSide(color: AppTheme.border)),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                  const Text('Total Penjualan', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textPrimary)),
                  Text(_fmtRp(totalSales), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.textPrimary)),
                ]),
              ),
            ],
          ]),
        ),
        const SizedBox(height: 32),
      ]),
    );
  }

  AppBar _appBar(String? title) => AppBar(
    backgroundColor: Colors.white,
    elevation: 0,
    surfaceTintColor: Colors.transparent,
    leading: IconButton(
      icon: const Icon(Icons.arrow_back_rounded, color: AppTheme.textPrimary),
      onPressed: () => context.canPop() ? context.pop() : context.go('/audit'),
    ),
    title: Text(title ?? 'Detail Shift', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: AppTheme.textPrimary)),
    bottom: const PreferredSize(preferredSize: Size.fromHeight(1), child: Divider(height: 1, color: AppTheme.border)),
  );
}

class _SummaryCard extends StatelessWidget {
  final String label, value;
  final Color valueColor;
  const _SummaryCard(this.label, this.value, this.valueColor);
  @override
  Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppTheme.border)),
    padding: const EdgeInsets.all(12),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
      Text(label, style: const TextStyle(fontSize: 10, color: AppTheme.textMuted)),
      const SizedBox(height: 4),
      Text(value, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: valueColor), overflow: TextOverflow.ellipsis),
    ]),
  );
}

class _InfoRow extends StatelessWidget {
  final String label, value;
  const _InfoRow(this.label, this.value);
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      SizedBox(width: 80, child: Text(label, style: const TextStyle(fontSize: 12, color: AppTheme.textMuted))),
      Expanded(child: Text(value, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: AppTheme.textPrimary))),
    ]),
  );
}
