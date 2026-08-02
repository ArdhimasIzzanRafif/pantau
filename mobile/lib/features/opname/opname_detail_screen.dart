import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/widgets.dart';
import '../auth/auth_provider.dart';

class OpnameDetailScreen extends ConsumerStatefulWidget {
  final String id;
  const OpnameDetailScreen({super.key, required this.id});
  @override
  ConsumerState<OpnameDetailScreen> createState() => _OpnameDetailScreenState();
}

class _OpnameDetailScreenState extends ConsumerState<OpnameDetailScreen> {
  Map? _data;
  bool _loading = true;
  String _error = '';

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = ''; });
    try {
      final d = await api.get('/api/opnames/${widget.id}');
      setState(() { _data = d; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString().replaceFirst('Exception: ', ''); _loading = false; });
    }
  }

  String _fmtDate(String? s) {
    if (s == null) return '-';
    final d = DateTime.parse(s).toLocal();
    const m = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    return '${d.day} ${m[d.month-1]} ${d.year}';
  }

  String _rp(dynamic v) {
    final n = num.tryParse(v.toString()) ?? 0;
    return 'Rp ${n.toStringAsFixed(0).replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (m) => '${m[1]}.')}';
  }

  @override
  Widget build(BuildContext context) {
    final isOwner = ref.watch(authProvider).user?.isOwner ?? false;

    return Scaffold(
      backgroundColor: AppTheme.surface,
      appBar: AppBar(
        title: Text(_data?['location']?['name'] ?? 'Detail Opname'),
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
          : RefreshIndicator(onRefresh: _load, child: _buildBody(isOwner)),
    );
  }

  Widget _buildBody(bool isOwner) {
    final items    = (_data!['items'] as List? ?? []);
    final total    = items.length;
    final shortage = items.where((i) => (toNum(i['difference']) ?? 0) < 0).length;
    final surplus  = items.where((i) => (toNum(i['difference']) ?? 0) > 0).length;
    final estLoss  = items.fold<num>(0, (s, i) {
      final diff = toNum(i['difference']) ?? 0;
      if (diff >= 0) return s;
      final price = toNum(i['item']?['costPrice']) ?? 0;
      return s + (diff.abs() * price);
    });

    final status      = _data!['status'] as String? ?? '';
    final statusLabel = status == 'SUBMITTED' ? 'Diajukan' : status == 'DRAFT' ? 'Draf' : status;
    final statusColor = status == 'SUBMITTED' ? const Color(0xFF15803D) : AppTheme.textMuted;
    final statusBg    = status == 'SUBMITTED' ? const Color(0xFFF0FDF4) : const Color(0xFFF1F5F9);

    return ListView(padding: const EdgeInsets.all(16), children: [
      // Status + period
      Row(children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(color: statusBg, borderRadius: BorderRadius.circular(8)),
          child: Text(statusLabel, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: statusColor)),
        ),
        const SizedBox(width: 8),
        Text('${_fmtDate(_data!['periodStart'] as String?)} – ${_fmtDate(_data!['periodEnd'] as String?)}',
          style: const TextStyle(fontSize: 12, color: AppTheme.textMuted)),
      ]),
      const SizedBox(height: 14),

      // Summary grid
      GridView.count(
        crossAxisCount: 2, shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 10, crossAxisSpacing: 10, childAspectRatio: 2.2,
        children: [
          _summCard('Total Item', '$total', Icons.inventory_2_rounded, const Color(0xFFEFF6FF), AppTheme.primary),
          _summCard('Kekurangan', '$shortage', Icons.arrow_downward_rounded, const Color(0xFFFEF2F2), AppTheme.danger),
          _summCard('Kelebihan', '$surplus', Icons.arrow_upward_rounded, const Color(0xFFF0FDF4), const Color(0xFF22C55E)),
          if (isOwner) _summCard('Est. Kerugian', _rp(estLoss), Icons.trending_down_rounded, const Color(0xFFFEF2F2), AppTheme.danger),
        ],
      ),
      const SizedBox(height: 16),

      // Items
      const Text('Daftar Item', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppTheme.textPrimary)),
      const SizedBox(height: 8),
      Container(
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppTheme.border)),
        child: Column(children: items.asMap().entries.map<Widget>((entry) {
          final i    = entry.key;
          final item = entry.value as Map;
          final diff = toNum(item['difference']) ?? 0;
          final isLast = i == items.length - 1;
          return Container(
            decoration: BoxDecoration(border: !isLast ? const Border(bottom: BorderSide(color: AppTheme.border)) : null),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Row(children: [
              Container(width: 4, height: 32, decoration: BoxDecoration(
                color: diff < 0 ? AppTheme.danger : diff > 0 ? const Color(0xFF22C55E) : AppTheme.border,
                borderRadius: BorderRadius.circular(2),
              )),
              const SizedBox(width: 10),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(item['item']?['name'] ?? '', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: AppTheme.textPrimary)),
                Text('Fisik: ${item['physicalQty']} · ${item['item']?['unit'] ?? ''}', style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
              ])),
              if (isOwner) ...[
                Text('Sistem: ${item['systemQty']}', style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
                const SizedBox(width: 8),
              ],
              Text(diff >= 0 ? '+$diff' : '$diff', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: diff < 0 ? AppTheme.danger : diff > 0 ? const Color(0xFF22C55E) : AppTheme.textMuted)),
            ]),
          );
        }).toList()),
      ),
      const SizedBox(height: 24),
    ]);
  }

  Widget _summCard(String title, String val, IconData icon, Color bg, Color color) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppTheme.border)),
    child: Row(children: [
      Container(width: 34, height: 34, decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(8)), child: Icon(icon, size: 16, color: color)),
      const SizedBox(width: 8),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, style: const TextStyle(fontSize: 10, color: AppTheme.textMuted, fontWeight: FontWeight.w500)),
        Text(val, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: color), overflow: TextOverflow.ellipsis),
      ])),
    ]),
  );
}
