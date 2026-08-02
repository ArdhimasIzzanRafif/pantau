import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/widgets.dart';

const _statusConfig = {
  'PENDING':  _SCfg('Disiapkan',                   Color(0xFFFEF9C3), Color(0xFF854D0E)),
  'SENT':     _SCfg('Dikirim — Tunggu Konfirmasi', Color(0xFFFFF7ED), Color(0xFFC2410C)),
  'RECEIVED': _SCfg('Diterima',                    Color(0xFFF0FDF4), Color(0xFF15803D)),
  'REJECTED': _SCfg('Ditolak',                     Color(0xFFFEF2F2), Color(0xFFB91C1C)),
};

class _SCfg {
  final String label;
  final Color bg, text;
  const _SCfg(this.label, this.bg, this.text);
}

class TransferDetailScreen extends StatefulWidget {
  final String id;
  const TransferDetailScreen({super.key, required this.id});
  @override
  State<TransferDetailScreen> createState() => _TransferDetailScreenState();
}

class _TransferDetailScreenState extends State<TransferDetailScreen> {
  Map? _data;
  bool _loading = true;
  String _error = '';
  bool _acting = false;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = ''; });
    try {
      final d = await api.get('/api/transfers/${widget.id}');
      setState(() { _data = d; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString().replaceFirst('Exception: ', ''); _loading = false; });
    }
  }

  Future<void> _act(String action) async {
    setState(() { _acting = true; _error = ''; });
    try {
      await api.post('/api/transfers/${widget.id}/confirm', data: {'action': action});
      await _load();
    } catch (e) {
      setState(() { _error = e.toString().replaceFirst('Exception: ', ''); _acting = false; });
    }
  }

  Future<void> _rejectWithConfirm() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Tolak Transfer?', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
        content: const Text('Stok akan dikembalikan ke lokasi asal. Tindakan ini tidak bisa dibatalkan.', style: TextStyle(fontSize: 13, color: AppTheme.textSecondary)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Batal')),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.danger, foregroundColor: Colors.white, elevation: 0),
            child: const Text('Ya, Tolak'),
          ),
        ],
      ),
    );
    if (ok == true && mounted) _act('reject');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.surface,
      appBar: AppBar(
        title: Text(_data == null ? 'Detail Transfer' : 'Transfer #${(_data!['transferNumber'] ?? '').toString().padLeft(4, '0')}'),
        leading: IconButton(icon: const Icon(Icons.arrow_back_rounded), onPressed: () => context.pop()),
      ),
      body: _loading
        ? const LoadingCenter()
        : _error.isNotEmpty && _data == null
          ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.error_outline_rounded, color: AppTheme.danger, size: 40),
              const SizedBox(height: 12),
              Text(_error, style: const TextStyle(color: AppTheme.danger, fontSize: 13), textAlign: TextAlign.center),
              const SizedBox(height: 12),
              ElevatedButton(onPressed: _load, child: const Text('Coba Lagi')),
            ]))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(padding: const EdgeInsets.all(16), children: [
                _statusBadge(_data!['status'] as String? ?? ''),
                const SizedBox(height: 16),
                _infoCard(),
                const SizedBox(height: 16),
                const Text('Item Transfer', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppTheme.textPrimary)),
                const SizedBox(height: 8),
                _itemsCard(),
                const SizedBox(height: 16),
                if (_error.isNotEmpty)
                  Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(color: const Color(0xFFFEF2F2), borderRadius: BorderRadius.circular(10), border: Border.all(color: const Color(0xFFFECACA))),
                    child: Text(_error, style: const TextStyle(color: AppTheme.danger, fontSize: 13)),
                  ),
                if (_data!['status'] == 'SENT') ...[
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: _acting ? null : () => _act('receive'),
                      icon: _acting ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.check_circle_rounded, size: 16),
                      label: Text(_acting ? 'Memproses...' : 'Konfirmasi Diterima', style: const TextStyle(fontWeight: FontWeight.w600)),
                      style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF15803D), foregroundColor: Colors.white, shape: const StadiumBorder(), elevation: 0, padding: const EdgeInsets.symmetric(vertical: 14)),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: _acting ? null : _rejectWithConfirm,
                      style: OutlinedButton.styleFrom(shape: const StadiumBorder(), side: const BorderSide(color: AppTheme.danger), padding: const EdgeInsets.symmetric(vertical: 14)),
                      child: Text('Tolak Transfer', style: TextStyle(color: _acting ? AppTheme.textMuted : AppTheme.danger, fontWeight: FontWeight.w600)),
                    ),
                  ),
                ],
                const SizedBox(height: 24),
              ]),
            ),
    );
  }

  Widget _statusBadge(String status) {
    final cfg = _statusConfig[status] ?? const _SCfg('Tidak Diketahui', Color(0xFFF1F5F9), Color(0xFF64748B));
    final icons = {'PENDING': Icons.access_time_rounded, 'SENT': Icons.arrow_forward_rounded, 'RECEIVED': Icons.check_circle_rounded, 'REJECTED': Icons.cancel_rounded};
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(color: cfg.bg, borderRadius: BorderRadius.circular(12)),
      child: Row(children: [
        Icon(icons[status] ?? Icons.info_rounded, color: cfg.text, size: 18),
        const SizedBox(width: 8),
        Text(cfg.label, style: TextStyle(color: cfg.text, fontWeight: FontWeight.w700, fontSize: 14)),
      ]),
    );
  }

  Widget _infoCard() => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppTheme.border)),
    child: Column(children: [
      _infoRow('Dari', (_data!['fromLocation']?['name'] ?? '-') as String),
      const Divider(height: 20),
      _infoRow('Ke', (_data!['toLocation']?['name'] ?? '-') as String),
      const Divider(height: 20),
      _infoRow('Tanggal', _fmtDate(_data!['createdAt'] as String?)),
      if (_data!['notes'] != null && (_data!['notes'] as String).isNotEmpty) ...[
        const Divider(height: 20),
        _infoRow('Catatan', _data!['notes'] as String),
      ],
    ]),
  );

  Widget _itemsCard() => Container(
    padding: const EdgeInsets.symmetric(horizontal: 16),
    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppTheme.border)),
    child: Column(children: (_data!['items'] as List? ?? []).map<Widget>((item) {
      final sentQty = num.tryParse(item['quantity'].toString()) ?? 0;
      final recvQty = item['receivedQty'] != null ? num.tryParse(item['receivedQty'].toString()) : null;
      final hasShortage = recvQty != null && recvQty < sentQty;
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Column(children: [
          Row(children: [
            Container(width: 36, height: 36, decoration: BoxDecoration(color: const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(8)), child: const Icon(Icons.inventory_2_rounded, size: 18, color: AppTheme.textMuted)),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(item['item']?['name'] ?? '-', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textPrimary)),
              Text(item['item']?['unit'] ?? 'pcs', style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
            ])),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text('$sentQty dikirim', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppTheme.textPrimary)),
              if (recvQty != null)
                Text('$recvQty diterima', style: TextStyle(fontSize: 11, color: hasShortage ? AppTheme.danger : const Color(0xFF15803D))),
            ]),
          ]),
        ]),
      );
    }).toList()),
  );

  Widget _infoRow(String label, String value) => Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
    SizedBox(width: 80, child: Text(label, style: const TextStyle(fontSize: 12, color: AppTheme.textMuted))),
    Expanded(child: Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textPrimary))),
  ]);

  String _fmtDate(String? s) {
    if (s == null) return '-';
    final d = DateTime.parse(s).toLocal();
    const m = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    return '${d.day} ${m[d.month-1]} ${d.year}, ${d.hour.toString().padLeft(2,'0')}:${d.minute.toString().padLeft(2,'0')}';
  }
}
