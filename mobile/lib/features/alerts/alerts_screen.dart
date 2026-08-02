import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/widgets.dart';
import '../auth/auth_provider.dart';

class AlertsScreen extends ConsumerStatefulWidget {
  const AlertsScreen({super.key});
  @override
  ConsumerState<AlertsScreen> createState() => _AlertsScreenState();
}

class _AlertsScreenState extends ConsumerState<AlertsScreen> {
  List<dynamic> _alerts = [];
  bool _loading = true, _showResolved = false;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data = await api.get('/api/alerts?resolved=$_showResolved') as List;
      final user = ref.read(authProvider).user;
      final filtered = user?.isAdminGudang == true
        ? data.where((a) => a['type'] == 'LOW_STOCK').toList()
        : data;
      _alerts = filtered;
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _resolve(String id) async {
    try {
      await api.patch('/api/alerts', data: {'id': id});
      _load();
    } catch (_) {}
  }

  Color _severityBorder(String s) {
    switch (s) {
      case 'CRITICAL': return AppTheme.danger;
      case 'WARNING':  return AppTheme.warning;
      default:         return AppTheme.primary;
    }
  }

  Color _severityDot(String s) {
    switch (s) {
      case 'CRITICAL': return AppTheme.danger;
      case 'WARNING':  return AppTheme.warning;
      default:         return AppTheme.primary;
    }
  }

  String _severityLabel(String s) {
    switch (s) {
      case 'CRITICAL': return 'Kritis';
      case 'WARNING':  return 'Perhatian';
      default:         return 'Info';
    }
  }

  @override
  Widget build(BuildContext context) {
    final critical   = _alerts.where((a) => a['severity'] == 'CRITICAL').length;
    final warning    = _alerts.where((a) => a['severity'] == 'WARNING').length;

    return Scaffold(
      backgroundColor: AppTheme.surface,
      body: _loading ? const LoadingCenter() : RefreshIndicator(
        onRefresh: _load,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Peringatan', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w300, color: AppTheme.textPrimary, letterSpacing: -0.5)),
              Text('${_alerts.length} peringatan ${_showResolved ? 'diselesaikan' : 'aktif'}', style: const TextStyle(fontSize: 12, color: AppTheme.textMuted)),
            ])),
            OutlinedButton(
              onPressed: () { setState(() => _showResolved = !_showResolved); _load(); },
              style: OutlinedButton.styleFrom(shape: const StadiumBorder(), side: const BorderSide(color: AppTheme.border), padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8)),
              child: Text(_showResolved ? 'Lihat Aktif' : 'Lihat Selesai', style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
            ),
          ]),

          // Summary cards
          const SizedBox(height: 14),
          Row(children: [
            _summCard('Kritis', critical, AppTheme.danger, const Color(0xFFFEF2F2)),
            const SizedBox(width: 10),
            _summCard('Perhatian', warning, AppTheme.warning, const Color(0xFFFFFBEB)),
            const SizedBox(width: 10),
            _summCard('Total', _alerts.length, AppTheme.textSecondary, const Color(0xFFF8FAFC)),
          ]),

          const SizedBox(height: 14),

          if (_alerts.isEmpty)
            Container(
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppTheme.border)),
              padding: const EdgeInsets.all(40),
              child: Column(children: [
                Container(width: 56, height: 56, decoration: BoxDecoration(color: const Color(0xFFF0FDF4), borderRadius: BorderRadius.circular(16)), child: const Icon(Icons.check_circle_rounded, size: 28, color: Color(0xFF22C55E))),
                const SizedBox(height: 12),
                Text(_showResolved ? 'Tidak ada peringatan selesai' : 'Semua aman!', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppTheme.textSecondary)),
                Text(_showResolved ? '' : 'Tidak ada peringatan aktif saat ini', style: const TextStyle(fontSize: 12, color: AppTheme.textMuted)),
              ]),
            )
          else
            ..._alerts.map((a) {
              final severity = a['severity'] as String? ?? 'INFO';
              final border   = _severityBorder(severity);
              final dot      = _severityDot(severity);
              final resolved = toBool(a['resolved']);
              return ClipRRect(
                borderRadius: BorderRadius.circular(14),
                child: Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  child: IntrinsicHeight(
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Container(width: 4, color: border),
                        Expanded(
                          child: Container(
                            decoration: BoxDecoration(
                              color: Colors.white,
                              border: Border(
                                top:    BorderSide(color: border.withValues(alpha: 0.2)),
                                right:  BorderSide(color: border.withValues(alpha: 0.2)),
                                bottom: BorderSide(color: border.withValues(alpha: 0.2)),
                              ),
                            ),
                            padding: const EdgeInsets.all(14),
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Container(width: 8, height: 8, margin: const EdgeInsets.only(top: 4, right: 8), decoration: BoxDecoration(color: dot, shape: BoxShape.circle)),
                                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  Text(a['title'] ?? '', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppTheme.textPrimary)),
                                  const SizedBox(height: 3),
                                  Text(a['message'] ?? '', style: const TextStyle(fontSize: 13, color: AppTheme.textSecondary, height: 1.4)),
                                ])),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(color: border.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(6)),
                                  child: Text(_severityLabel(severity), style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: border)),
                                ),
                              ]),
                              const SizedBox(height: 8),
                              Row(children: [
                                Text(formatDate(a['createdAt'] as String? ?? '', withTime: true), style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                                const Spacer(),
                                if (!resolved)
                                  TextButton(
                                    onPressed: () => _resolve(a['id'] as String),
                                    style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4), shape: const StadiumBorder(), backgroundColor: const Color(0xFFF0FDF4)),
                                    child: const Text('Selesaikan', style: TextStyle(fontSize: 12, color: Color(0xFF15803D), fontWeight: FontWeight.w600)),
                                  ),
                              ]),
                            ]),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }),
          const SizedBox(height: 24),
        ]),
      ),
    );
  }

  Widget _summCard(String label, int count, Color color, Color bg) => Expanded(
    child: Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(12), border: Border.all(color: color.withValues(alpha: 0.2))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('$count', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: color)),
        Text(label, style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w500)),
      ]),
    ),
  );
}
