import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/models/models.dart';
import '../../shared/widgets/widgets.dart';
import '../../features/auth/auth_provider.dart';

class ShiftScreen extends ConsumerStatefulWidget {
  const ShiftScreen({super.key});
  @override
  ConsumerState<ShiftScreen> createState() => _ShiftScreenState();
}

class _ShiftScreenState extends ConsumerState<ShiftScreen> {
  List<POSShift> _shifts = [];
  bool _loading = true;
  final _balanceCtrl = TextEditingController();

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data = await api.get('/api/pos/shifts', params: {'mine': 'true'}) as List;
      _shifts = data.map((j) => POSShift.fromJson(j)).toList();
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  POSShift? get _openShift => _shifts.where((s) => s.status == 'OPEN').firstOrNull;

  Future<void> _openShiftDialog() async {
    final user = ref.read(authProvider).user!;
    if (user.locationIds.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Akun kamu belum terhubung ke outlet')));
      return;
    }
    _balanceCtrl.text = '0';
    await showDialog(context: context, builder: (_) => AlertDialog(
      title: const Text('Buka Shift'),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        const Text('Modal awal kasir (Rp):', style: TextStyle(fontSize: 13)),
        const SizedBox(height: 8),
        TextField(controller: _balanceCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(prefixText: 'Rp ')),
      ]),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Batal')),
        ElevatedButton(onPressed: () async {
          Navigator.pop(context);
          try {
            await api.post('/api/pos/shifts', data: {
              'locationId': user.locationIds.first,
              'openingBalance': double.tryParse(_balanceCtrl.text) ?? 0,
            });
            _load();
          } catch (e) {
            if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString()), backgroundColor: AppTheme.danger));
          }
        }, child: const Text('Buka')),
      ],
    ));
  }

  Future<void> _closeShift(POSShift shift) async {
    final confirmed = await showDialog<bool>(context: context, builder: (_) => AlertDialog(
      title: const Text('Tutup Shift?'),
      content: Text('Shift di ${shift.locationName} akan ditutup.'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Batal')),
        ElevatedButton(style: ElevatedButton.styleFrom(backgroundColor: AppTheme.danger), onPressed: () => Navigator.pop(context, true), child: const Text('Tutup Shift')),
      ],
    ));
    if (confirmed != true) return;
    try {
      await api.post('/api/pos/shifts/${shift.id}/close', data: {});
      _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString()), backgroundColor: AppTheme.danger));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Shift'), actions: [
        if (_openShift == null)
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: ElevatedButton.icon(onPressed: _openShiftDialog, icon: const Icon(Icons.play_arrow_rounded, size: 18), label: const Text('Buka Shift'), style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8))),
          ),
      ]),
      body: _loading ? const LoadingCenter() : RefreshIndicator(
        onRefresh: _load,
        child: _shifts.isEmpty
          ? const EmptyState(icon: Icons.access_time_rounded, title: 'Belum ada shift', subtitle: 'Buka shift untuk mulai transaksi')
          : ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: _shifts.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (_, i) {
                final s = _shifts[i];
                final isOpen = s.status == 'OPEN';
                return PantauCard(
                  child: Row(children: [
                    Container(
                      width: 40, height: 40,
                      decoration: BoxDecoration(color: isOpen ? const Color(0xFFDCFCE7) : AppTheme.surface, borderRadius: BorderRadius.circular(10)),
                      child: Icon(isOpen ? Icons.play_circle_rounded : Icons.check_circle_rounded, color: isOpen ? AppTheme.success : AppTheme.textMuted, size: 22),
                    ),
                    const SizedBox(width: 12),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(s.locationName, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: AppTheme.textPrimary)),
                      Text(formatDate(s.openedAt, withTime: true), style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
                    ])),
                    if (isOpen)
                      TextButton(onPressed: () => _closeShift(s), child: const Text('Tutup', style: TextStyle(color: AppTheme.danger))),
                    if (!isOpen)
                      const StatusBadge(label: 'Selesai', bg: Color(0xFFF1F5F9), text: AppTheme.textSecondary),
                  ]),
                );
              },
            ),
      ),
    );
  }
}
