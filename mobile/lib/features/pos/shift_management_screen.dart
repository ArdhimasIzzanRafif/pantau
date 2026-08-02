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

class ShiftManagementScreen extends ConsumerStatefulWidget {
  const ShiftManagementScreen({super.key});
  @override
  ConsumerState<ShiftManagementScreen> createState() => _ShiftManagementScreenState();
}

class _ShiftManagementScreenState extends ConsumerState<ShiftManagementScreen> {
  List<POSShift> _shifts = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final user = ref.read(authProvider).user!;
      final res = await api.get('/api/pos/shifts', params: {
        'mine': 'true',
        if (user.locationIds.isNotEmpty) 'locationId': user.locationIds.first,
      });
      final items = res is Map ? (res['items'] as List? ?? []) : (res as List);
      if (mounted) setState(() => _shifts = items.map((j) => POSShift.fromJson(Map<String, dynamic>.from(j as Map))).toList());
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  POSShift? get _openShift => _shifts.where((s) => s.status == 'OPEN').firstOrNull;
  List<POSShift> get _closedShifts => _shifts.where((s) => s.status == 'CLOSED').toList();

  Future<void> _tutupShift(POSShift shift) async {
    String kasAktual = '';
    String catatan = '';
    bool closing = false;

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => StatefulBuilder(builder: (ctx, setS) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
        child: Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              const Text('Tutup Shift', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppTheme.textPrimary)),
              const Spacer(),
              GestureDetector(onTap: () => Navigator.pop(ctx), child: const Icon(Icons.close_rounded, color: AppTheme.textMuted)),
            ]),
            const SizedBox(height: 16),

            // Summary box
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: AppTheme.surface, borderRadius: BorderRadius.circular(12)),
              child: Column(children: [
                _summaryRow('Total Penjualan', formatRp(shift.totalSales)),
                const SizedBox(height: 8),
                _summaryRow('Total Transaksi', '${shift.totalOrders} pesanan'),
                const SizedBox(height: 8),
                _summaryRow('Modal Awal', formatRp(shift.openingBalance)),
              ]),
            ),
            const SizedBox(height: 16),

            TextField(
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Kas Aktual (opsional)', prefixText: 'Rp ', hintText: 'Jumlah uang tunai di laci'),
              onChanged: (v) => kasAktual = v,
            ),
            const SizedBox(height: 12),
            TextField(
              decoration: const InputDecoration(labelText: 'Catatan (opsional)', hintText: 'Catatan penutupan shift'),
              onChanged: (v) => catatan = v,
            ),
            const SizedBox(height: 20),

            Row(children: [
              Expanded(child: OutlinedButton(
                onPressed: () => Navigator.pop(ctx),
                style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                child: const Text('Batal'),
              )),
              const SizedBox(width: 12),
              Expanded(child: StatefulBuilder(builder: (_, setSB) => ElevatedButton(
                onPressed: closing ? null : () async {
                  setSB(() => closing = true);
                  final messenger = ScaffoldMessenger.of(context);
                  try {
                    await api.patch('/api/pos/shifts/${shift.id}', data: {
                      'closingBalance': kasAktual.isNotEmpty ? (double.tryParse(kasAktual.replaceAll('.', '')) ?? 0) : 0,
                      if (catatan.isNotEmpty) 'notes': catatan,
                    });
                    if (ctx.mounted) Navigator.pop(ctx);
                    _load();
                  } catch (e) {
                    if (ctx.mounted) messenger.showSnackBar(SnackBar(content: Text(_msg(e)), backgroundColor: AppTheme.danger));
                    setSB(() => closing = false);
                  }
                },
                style: ElevatedButton.styleFrom(backgroundColor: AppTheme.danger, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                child: closing ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('Tutup Shift', style: TextStyle(fontWeight: FontWeight.w600)),
              ))),
            ]),
            const SizedBox(height: 8),
          ]),
        ),
      )),
    );
  }

  Widget _summaryRow(String label, String value) => Row(
    mainAxisAlignment: MainAxisAlignment.spaceBetween,
    children: [
      Text(label, style: const TextStyle(fontSize: 13, color: AppTheme.textSecondary)),
      Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textPrimary)),
    ],
  );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.surface,
      body: _loading
        ? const LoadingCenter()
        : RefreshIndicator(
            onRefresh: _load,
            child: ListView(padding: const EdgeInsets.all(16), children: [
              // ── Active shift card ──
              _openShift != null ? _buildActiveShiftCard(_openShift!) : _buildNoShiftCard(),
              const SizedBox(height: 16),

              // ── Riwayat Shift ──
              PantauCard(
                padding: EdgeInsets.zero,
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Padding(
                    padding: EdgeInsets.fromLTRB(16, 16, 16, 12),
                    child: Text('Riwayat Shift', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppTheme.textPrimary)),
                  ),
                  const Divider(height: 1, color: AppTheme.border),
                  if (_closedShifts.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 40),
                      child: Center(child: Text('Belum ada riwayat shift', style: TextStyle(color: AppTheme.textMuted, fontSize: 14))),
                    )
                  else
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: _buildShiftTable(),
                    ),
                ]),
              ),
            ]),
          ),
    );
  }

  Widget _buildActiveShiftCard(POSShift s) {
    return Container(
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [Color(0xFF2563EB), Color(0xFF1D4ED8)], begin: Alignment.topLeft, end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Shift Aktif', style: TextStyle(color: Color(0xFFBFDBFE), fontSize: 11, fontWeight: FontWeight.w500)),
              const SizedBox(height: 4),
              Text(s.shiftNumber, style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w700, fontFamily: 'monospace')),
              const SizedBox(height: 2),
              Text('Kasir: ${s.cashierName}', style: const TextStyle(color: Color(0xFFBFDBFE), fontSize: 12)),
            ])),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              const Text('Dibuka', style: TextStyle(color: Color(0xFFBFDBFE), fontSize: 11)),
              const SizedBox(height: 4),
              Text(formatDate(s.openedAt, withTime: true), style: const TextStyle(color: Colors.white, fontSize: 12)),
              const SizedBox(height: 2),
              Text(_elapsed(s.openedAt), style: const TextStyle(color: Color(0xFFBFDBFE), fontSize: 11)),
            ]),
          ]),
        ),

        Container(
          decoration: BoxDecoration(
            border: Border(top: BorderSide(color: Colors.white.withValues(alpha: 0.15))),
          ),
          child: Row(children: [
            _statCell(Icons.trending_up_rounded, 'Total Penjualan', formatRp(s.totalSales), const Color(0xFF4ADE80)),
            _dividerLine(),
            _statCell(Icons.shopping_bag_rounded, 'Transaksi', '${s.totalOrders}', const Color(0xFF93C5FD)),
            _dividerLine(),
            _statCell(Icons.account_balance_wallet_rounded, 'Modal Awal', formatRp(s.openingBalance), const Color(0xFFFBBF24)),
          ]),
        ),

        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          child: SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () => _tutupShift(s),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.white.withValues(alpha: 0.15),
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                padding: const EdgeInsets.symmetric(vertical: 12),
                elevation: 0,
              ),
              child: const Text('Tutup Shift', style: TextStyle(fontWeight: FontWeight.w600)),
            ),
          ),
        ),
      ]),
    );
  }

  Widget _statCell(IconData icon, String label, String value, Color iconColor) => Expanded(
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 10),
      child: Column(children: [
        Icon(icon, color: iconColor, size: 18),
        const SizedBox(height: 6),
        Text(label, style: const TextStyle(color: Color(0xFFBFDBFE), fontSize: 10), textAlign: TextAlign.center),
        const SizedBox(height: 2),
        Text(value, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700), textAlign: TextAlign.center),
      ]),
    ),
  );

  Widget _dividerLine() => Container(width: 1, height: 50, color: Colors.white.withValues(alpha: 0.15));

  Widget _buildNoShiftCard() => PantauCard(
    child: Column(children: [
      const Icon(Icons.access_time_rounded, size: 40, color: AppTheme.textMuted),
      const SizedBox(height: 12),
      const Text('Tidak ada shift aktif', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15, color: AppTheme.textPrimary)),
      const SizedBox(height: 6),
      const Text('Buka shift dari halaman kasir untuk mulai menerima pesanan', style: TextStyle(color: AppTheme.textSecondary, fontSize: 13), textAlign: TextAlign.center),
    ]),
  );

  // Column widths matching web table proportions
  static const _w = [160.0, 150.0, 140.0, 140.0, 90.0, 80.0, 90.0, 90.0, 90.0];
  static const _headers = ['Shift', 'Kasir', 'Dibuka', 'Ditutup', 'Penjualan', 'Transaksi', 'Kas Aktual', 'Ekspektasi', 'Selisih'];

  Widget _buildShiftTable() {
    final totalW = _w.fold(0.0, (a, b) => a + b);
    return SizedBox(
      width: totalW,
      child: Column(children: [
        // Header row
        Container(
          color: const Color(0xFFF8FAFC),
          child: Row(children: List.generate(_headers.length, (i) => SizedBox(
            width: _w[i],
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Text(_headers[i], style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppTheme.textMuted)),
            ),
          ))),
        ),
        const Divider(height: 1, color: AppTheme.border),
        ..._closedShifts.map((s) => _buildShiftRow(s)),
      ]),
    );
  }

  Widget _buildShiftRow(POSShift s) {
    final diff = s.closingBalance != null && s.expectedCash != null
        ? s.closingBalance! - s.expectedCash! : null;
    Color diffColor = AppTheme.success;
    Color diffBg   = const Color(0xFFDCFCE7);
    if (diff != null) {
      if (diff > 0) { diffColor = AppTheme.primary; diffBg = const Color(0xFFEFF6FF); }
      else if (diff < 0) { diffColor = AppTheme.danger; diffBg = const Color(0xFFFEE2E2); }
    }

    Widget cell(Widget child, int col) => SizedBox(
      width: _w[col],
      child: Padding(padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14), child: child),
    );
    Widget txt(String v, {Color? color, FontWeight fw = FontWeight.w400, double fs = 13, String? fontFamily}) =>
      Text(v, style: TextStyle(fontSize: fs, fontWeight: fw, color: color ?? AppTheme.textPrimary, fontFamily: fontFamily), overflow: TextOverflow.ellipsis);

    return Column(children: [
      Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
        cell(txt(s.shiftNumber, fw: FontWeight.w700, fs: 12, fontFamily: 'monospace'), 0),
        cell(txt(s.cashierName, color: const Color(0xFF2563EB), fs: 12), 1),
        cell(txt(formatDate(s.openedAt, withTime: true), fs: 12, color: AppTheme.textSecondary), 2),
        cell(txt(s.closedAt != null ? formatDate(s.closedAt!, withTime: true) : '—', fs: 12, color: AppTheme.textSecondary), 3),
        cell(txt(formatRp(s.totalSales), fw: FontWeight.w700, fs: 12), 4),
        cell(txt('${s.totalOrders}', fs: 12), 5),
        cell(txt(s.closingBalance != null ? formatRp(s.closingBalance!) : '—', fs: 12, color: s.closingBalance != null ? AppTheme.textPrimary : AppTheme.textMuted), 6),
        cell(txt(s.expectedCash != null ? formatRp(s.expectedCash!) : 'Rp 0', fs: 12), 7),
        cell(
          diff != null
            ? Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: diffBg, borderRadius: BorderRadius.circular(20)),
                child: Text('${diff > 0 ? '+' : ''}${formatRp(diff)}',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: diffColor)),
              )
            : txt('—', color: AppTheme.textMuted),
          8,
        ),
      ]),
      const Divider(height: 1, color: AppTheme.border),
    ]);
  }

  String _elapsed(String iso) {
    final diff = DateTime.now().difference(DateTime.parse(iso));
    final h = diff.inHours;
    final m = diff.inMinutes % 60;
    if (h > 0) return '${h}j ${m}m yang lalu';
    return '${m}m yang lalu';
  }
}
