import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/widgets.dart';

class GoodsReceiptDetailScreen extends StatefulWidget {
  final String id;
  const GoodsReceiptDetailScreen({super.key, required this.id});
  @override
  State<GoodsReceiptDetailScreen> createState() => _GoodsReceiptDetailScreenState();
}

class _GoodsReceiptDetailScreenState extends State<GoodsReceiptDetailScreen> {
  Map? _data;
  bool _loading = true;
  String _error = '';

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = ''; });
    try {
      final d = await api.get('/api/goods-receipts/${widget.id}');
      setState(() { _data = d; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString().replaceFirst('Exception: ', ''); _loading = false; });
    }
  }

  String _fmtDate(String? s) {
    if (s == null) return '-';
    final d = DateTime.parse(s).toLocal();
    const m = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    return '${d.day} ${m[d.month-1]} ${d.year}, ${d.hour.toString().padLeft(2,'0')}:${d.minute.toString().padLeft(2,'0')}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.surface,
      appBar: AppBar(
        title: Text(_data?['receiptNumber'] != null ? 'Barang Masuk #${_data!['receiptNumber']}' : 'Detail Barang Masuk'),
        leading: IconButton(icon: const Icon(Icons.arrow_back_rounded), onPressed: () => context.pop()),
      ),
      body: _loading
        ? const LoadingCenter()
        : _error.isNotEmpty
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
                // Header info card
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppTheme.border)),
                  child: Column(children: [
                    Row(children: [
                      Container(width: 44, height: 44, decoration: BoxDecoration(color: const Color(0xFFF0FDF4), borderRadius: BorderRadius.circular(12)), child: const Icon(Icons.local_shipping_rounded, size: 22, color: Color(0xFF22C55E))),
                      const SizedBox(width: 12),
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(_data!['location']?['name'] ?? '-', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppTheme.textPrimary)),
                        Text(_fmtDate(_data!['createdAt'] as String?), style: const TextStyle(fontSize: 12, color: AppTheme.textMuted)),
                      ])),
                    ]),
                    const SizedBox(height: 14),
                    _infoRow('Supplier', (_data!['supplier'] as String?) ?? '-'),
                    if (_data!['notes'] != null && (_data!['notes'] as String).isNotEmpty) ...[
                      const Divider(height: 20),
                      _infoRow('Catatan', _data!['notes'] as String),
                    ],
                    if (_data!['totalCost'] != null) ...[
                      const Divider(height: 20),
                      _infoRow('Total Biaya', _fmtRp(_data!['totalCost'])),
                    ],
                  ]),
                ),
                const SizedBox(height: 16),

                // Image if present
                if (_data!['imageUrl'] != null) ...[
                  ClipRRect(
                    borderRadius: BorderRadius.circular(14),
                    child: Image.network(
                      _data!['imageUrl'] as String,
                      fit: BoxFit.contain,
                      errorBuilder: (_, _, _) => Container(height: 120, decoration: BoxDecoration(color: const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(14)), child: const Center(child: Icon(Icons.broken_image_rounded, color: AppTheme.textMuted))),
                    ),
                  ),
                  const SizedBox(height: 16),
                ],

                // Items
                const Text('Daftar Item', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppTheme.textPrimary)),
                const SizedBox(height: 8),
                Container(
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppTheme.border)),
                  child: Column(children: (_data!['items'] as List? ?? []).asMap().entries.map<Widget>((entry) {
                    final i = entry.key;
                    final item = entry.value;
                    final qty = num.tryParse(item['quantity'].toString()) ?? 0;
                    final unit = item['item']?['unit'] ?? '';
                    final cost = item['unitCost'];
                    final isLast = i == (_data!['items'] as List).length - 1;
                    return Container(
                      decoration: BoxDecoration(border: isLast ? null : const Border(bottom: BorderSide(color: AppTheme.border))),
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      child: Row(children: [
                        Container(width: 36, height: 36, decoration: BoxDecoration(color: const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(8)), child: const Icon(Icons.inventory_2_rounded, size: 18, color: AppTheme.textMuted)),
                        const SizedBox(width: 12),
                        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(item['item']?['name'] ?? '-', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textPrimary)),
                          if (cost != null)
                            Text('${_fmtRp(cost)}/$unit', style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                        ])),
                        Text('$qty $unit', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.primary)),
                      ]),
                    );
                  }).toList()),
                ),
                const SizedBox(height: 24),
              ]),
            ),
    );
  }

  Widget _infoRow(String label, String value) => Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
    SizedBox(width: 80, child: Text(label, style: const TextStyle(fontSize: 12, color: AppTheme.textMuted))),
    Expanded(child: Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textPrimary))),
  ]);

  String _fmtRp(dynamic v) {
    final n = num.tryParse(v.toString()) ?? 0;
    return 'Rp ${n.toStringAsFixed(0).replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (m) => '${m[1]}.')}';
  }
}
