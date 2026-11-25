import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/widgets.dart';

const _statusConfig = {
  'PENDING':  _StatusCfg('Disiapkan',                   Color(0xFFFEF9C3), Color(0xFF854D0E), Icons.access_time_rounded),
  'SENT':     _StatusCfg('Dikirim — Tunggu Konfirmasi', Color(0xFFFFF7ED), Color(0xFFC2410C), Icons.arrow_forward_rounded),
  'RECEIVED': _StatusCfg('Diterima',                    Color(0xFFF0FDF4), Color(0xFF15803D), Icons.check_circle_rounded),
  'REJECTED': _StatusCfg('Ditolak',                     Color(0xFFFEF2F2), Color(0xFFB91C1C), Icons.close_rounded),
};

class _StatusCfg {
  final String label;
  final Color bg, text;
  final IconData icon;
  const _StatusCfg(this.label, this.bg, this.text, this.icon);
}

class TransferScreen extends ConsumerStatefulWidget {
  const TransferScreen({super.key});
  @override
  ConsumerState<TransferScreen> createState() => _TransferScreenState();
}

class _TransferScreenState extends ConsumerState<TransferScreen> {
  List<dynamic> _transfers = [], _locations = [], _inventory = [];
  Map<String, Map<String, num>> _allBalances = {};
  bool _loading = true;
  bool _showNew = false;
  String _activeTab = 'all';

  // Form state
  String _fromId = '', _toId = '', _notes = '';
  List<_Row> _rows = [_Row()];
  bool _submitting = false;
  String _error = '';

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final r = await Future.wait([
        api.get('/api/transfers'),
        api.get('/api/locations'),
        api.get('/api/inventory'),
        api.get('/api/stock-balances'),
      ]);
      _transfers = asList(r[0]);
      _locations = (r[1] as List?) ?? [];
      _inventory = (r[2] as List?) ?? [];
      if (_locations.isNotEmpty) _fromId = _locations[0]['id'];
      if (_locations.length >= 2) _toId = _locations[1]['id'];
      final balances = (r[3] as List?) ?? [];
      _allBalances = {};
      for (final b in balances) {
        final locId  = b['locationId'] as String;
        final itemId = b['itemId'] as String;
        _allBalances.putIfAbsent(locId, () => {})[itemId] = toNum(b['quantity']) ?? 0;
      }
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  Map<String, num> get _stockBalances => _allBalances[_fromId] ?? {};

  Map? _getItem(String id) => _inventory.cast<Map>().firstWhere((i) => i['id'] == id, orElse: () => {});

  int _qtyInBase(_Row row) {
    final q = int.tryParse(row.qty) ?? 0;
    if (row.inputUnit == 'pack') {
      final item = _getItem(row.itemId);
      final ps   = toNum(item?['packSize'])?.toInt() ?? 1;
      return q * ps;
    }
    return q;
  }

  Future<void> _submit() async {
    setState(() { _submitting = true; _error = ''; });
    try {
      if (_fromId == _toId) { setState(() { _error = 'Lokasi asal dan tujuan tidak boleh sama'; _submitting = false; }); return; }
      final valid = _rows.where((r) => r.itemId.isNotEmpty && (int.tryParse(r.qty) ?? 0) > 0).toList();
      if (valid.isEmpty) { setState(() { _error = 'Tambahkan minimal 1 item'; _submitting = false; }); return; }
      for (final r in valid) {
        final avail = _stockBalances[r.itemId] ?? 0;
        if (_qtyInBase(r) > avail) {
          final item = _getItem(r.itemId);
          setState(() { _error = 'Stok "${item?['name']}" tidak cukup — tersedia $avail ${item?['unit']}'; _submitting = false; });
          return;
        }
      }
      final res = await api.post('/api/transfers', data: {
        'fromLocationId': _fromId,
        'toLocationId':   _toId,
        'notes': _notes.isEmpty ? null : _notes,
        'items': valid.map((r) => {'itemId': r.itemId, 'quantity': _qtyInBase(r)}).toList(),
      });
      if (res != null) {
        setState(() { _showNew = false; _rows = [_Row()]; _notes = ''; });
        _load();
      }
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _reject(String id) async {
    await api.post('/api/transfers/$id/confirm', data: {'action': 'reject'});
    _load();
  }

  void _openReceive(Map t) => showModalBottomSheet(
    context: context, isScrollControlled: true, backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    builder: (_) => _ReceiveModal(transfer: t, onConfirmed: _load),
  );

  List<dynamic> get _filtered => _transfers.where((t) {
    if (_activeTab == 'pending') return ['PENDING','SENT'].contains(t['status']);
    if (_activeTab == 'received') return t['status'] == 'RECEIVED';
    return true;
  }).toList();

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;
    final pendingCount  = _transfers.where((t) => ['PENDING','SENT'].contains(t['status'])).length;
    final receivedCount = _transfers.where((t) => t['status'] == 'RECEIVED').length;

    return Scaffold(
      backgroundColor: AppTheme.surface,
      body: _loading ? const LoadingCenter() : RefreshIndicator(
        onRefresh: _load,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Transfer Barang', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w300, color: AppTheme.textPrimary, letterSpacing: -0.5)),
              Text('Kirim barang dari gudang ke outlet', style: TextStyle(fontSize: 12, color: AppTheme.textMuted)),
            ])),
            if (!_showNew)
              ElevatedButton.icon(
                onPressed: () => setState(() { _showNew = true; _error = ''; }),
                icon: const Icon(Icons.add_rounded, size: 16),
                label: const Text('Transfer Baru', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary, foregroundColor: Colors.white, shape: const StadiumBorder(), padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10), elevation: 0),
              ),
          ]),

          // Inline create form
          if (_showNew) ...[
            const SizedBox(height: 14),
            Container(
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppTheme.border)),
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                  const Text('Transfer Baru', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppTheme.textPrimary)),
                  IconButton(icon: const Icon(Icons.close_rounded, color: AppTheme.textMuted, size: 20), onPressed: () => setState(() => _showNew = false)),
                ]),

                if (_error.isNotEmpty)
                  Container(margin: const EdgeInsets.only(bottom: 12), padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: const Color(0xFFFEF2F2), borderRadius: BorderRadius.circular(10), border: Border.all(color: const Color(0xFFFECACA))), child: Text(_error, style: const TextStyle(color: AppTheme.danger, fontSize: 13))),

                Row(children: [
                  Expanded(child: _locDropdown('Dari', _fromId, (v) => setState(() { _fromId = v!; if (_toId == v) _toId = _locations.cast<Map>().firstWhere((l) => l['id'] != v, orElse: () => {})['id'] ?? ''; }))),
                  const SizedBox(width: 10),
                  Expanded(child: _locDropdown('Ke', _toId, (v) => setState(() => _toId = v!), exclude: _fromId)),
                ]),
                const SizedBox(height: 12),

                const Text('Daftar Barang', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: AppTheme.textPrimary)),
                const SizedBox(height: 8),
                ..._rows.asMap().entries.map((e) {
                  final i    = e.key;
                  final row  = e.value;
                  final item = row.itemId.isNotEmpty ? _getItem(row.itemId) : null;
                  final hasPack = item != null && item['packSize'] != null && item['packUnit'] != null;
                  final avail   = row.itemId.isNotEmpty ? (_stockBalances[row.itemId] ?? 0) : null;
                  final qtyBase = _qtyInBase(row);
                  final overStock = avail != null && qtyBase > avail;
                  return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Expanded(child: DropdownButtonFormField<String>(
                        initialValue: row.itemId.isEmpty ? null : row.itemId,
                        hint: const Text('Pilih item...', style: TextStyle(color: AppTheme.textMuted, fontSize: 13)),
                        onChanged: (v) => setState(() { _rows[i].itemId = v ?? ''; _rows[i].inputUnit = 'base'; }),
                        decoration: _fldDec(),
                        items: _inventory.cast<Map>().map((it) => DropdownMenuItem<String>(value: it['id'] as String, child: Text('${it['name']} (${it['unit']})', style: const TextStyle(fontSize: 13)))).toList(),
                      )),
                      const SizedBox(width: 8),
                      SizedBox(width: 80, child: TextField(
                        onChanged: (v) => setState(() => _rows[i].qty = v),
                        keyboardType: TextInputType.number,
                        textAlign: TextAlign.center,
                        style: const TextStyle(fontSize: 13),
                        decoration: _fldDec(hint: 'Jumlah').copyWith(
                          filled: true, fillColor: overStock ? const Color(0xFFFEF2F2) : const Color(0xFFF9FAFB),
                          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: overStock ? AppTheme.danger : AppTheme.border)),
                        ),
                      )),
                      const SizedBox(width: 4),
                      if (hasPack)
                        SizedBox(width: 60, child: DropdownButtonFormField<String>(
                          initialValue: row.inputUnit,
                          onChanged: (v) => setState(() => _rows[i].inputUnit = v ?? 'base'),
                          decoration: _fldDec(),
                          items: [
                            DropdownMenuItem(value: 'base', child: Text(item['unit'] as String, style: const TextStyle(fontSize: 12))),
                            DropdownMenuItem(value: 'pack', child: Text(item['packUnit'] as String, style: const TextStyle(fontSize: 12))),
                          ],
                        ))
                      else
                        Text(item?['unit'] ?? '', style: const TextStyle(fontSize: 13, color: AppTheme.textMuted)),
                      IconButton(icon: const Icon(Icons.close_rounded, size: 18, color: AppTheme.textMuted), onPressed: () => setState(() => _rows.removeAt(i))),
                    ]),
                    if (avail != null) ...[
                      const SizedBox(height: 4),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: overStock ? const Color(0xFFFEF2F2) : avail == 0 ? const Color(0xFFFFF7ED) : const Color(0xFFF8FAFC),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(children: [
                          const Icon(Icons.inventory_2_rounded, size: 12, color: AppTheme.textMuted),
                          const SizedBox(width: 4),
                          Text('Tersedia: ', style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                          Text('$avail ${item?['unit'] ?? ''}', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: overStock ? AppTheme.danger : avail == 0 ? AppTheme.warning : AppTheme.textPrimary)),
                          if (overStock) const Spacer(),
                          if (overStock) const Text('Melebihi stok!', style: TextStyle(fontSize: 11, color: AppTheme.danger, fontWeight: FontWeight.w600)),
                        ]),
                      ),
                    ],
                    const SizedBox(height: 8),
                  ]);
                }),

                TextButton.icon(
                  onPressed: () => setState(() => _rows.add(_Row())),
                  icon: const Icon(Icons.add_rounded, size: 16, color: AppTheme.primary),
                  label: const Text('Tambah Item', style: TextStyle(color: AppTheme.primary, fontWeight: FontWeight.w600)),
                ),
                const SizedBox(height: 8),

                TextField(
                  onChanged: (v) => setState(() => _notes = v),
                  decoration: _fldDec(hint: 'Catatan (opsional)...'),
                  style: const TextStyle(fontSize: 13),
                ),
                const SizedBox(height: 14),

                Row(children: [
                  Expanded(child: OutlinedButton(
                    onPressed: () => setState(() => _showNew = false),
                    style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)), side: const BorderSide(color: AppTheme.border)),
                    child: const Text('Batal', style: TextStyle(color: AppTheme.textSecondary)),
                  )),
                  const SizedBox(width: 10),
                  Expanded(child: ElevatedButton.icon(
                    onPressed: _submitting ? null : _submit,
                    icon: _submitting ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.arrow_forward_rounded, size: 16),
                    label: Text(_submitting ? 'Mengirim...' : 'Kirim Sekarang', style: const TextStyle(fontWeight: FontWeight.w600)),
                    style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(vertical: 14), shape: const StadiumBorder(), elevation: 0),
                  )),
                ]),
              ]),
            ),
          ],

          const SizedBox(height: 14),

          // Tabs
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(children: [
              for (final tab in [('all', 'Semua', _transfers.length), ('pending', 'Belum Selesai', pendingCount), ('received', 'Diterima', receivedCount)])
                GestureDetector(
                  onTap: () => setState(() => _activeTab = tab.$1),
                  child: Container(
                    margin: const EdgeInsets.only(right: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(
                      color: _activeTab == tab.$1 ? AppTheme.primary : Colors.white,
                      border: Border.all(color: _activeTab == tab.$1 ? AppTheme.primary : AppTheme.border),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Row(children: [
                      Text(tab.$2, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: _activeTab == tab.$1 ? Colors.white : AppTheme.textSecondary)),
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                        decoration: BoxDecoration(color: _activeTab == tab.$1 ? const Color(0xFF1D4ED8) : const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(8)),
                        child: Text('${tab.$3}', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: _activeTab == tab.$1 ? Colors.white : AppTheme.textMuted)),
                      ),
                    ]),
                  ),
                ),
            ]),
          ),

          const SizedBox(height: 12),

          if (filtered.isEmpty)
            Container(
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppTheme.border)),
              padding: const EdgeInsets.all(40),
              child: Column(children: [
                Container(width: 56, height: 56, decoration: BoxDecoration(color: const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(16)), child: const Icon(Icons.swap_horiz_rounded, size: 28, color: AppTheme.textMuted)),
                const SizedBox(height: 12),
                const Text('Belum ada transfer', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppTheme.textSecondary)),
                const Text('Transfer yang dibuat akan muncul di sini', style: TextStyle(fontSize: 12, color: AppTheme.textMuted)),
              ]),
            )
          else
            ...filtered.map((t) {
              final status = t['status'] as String;
              final cfg    = _statusConfig[status] ?? _statusConfig['PENDING']!;
              final isSent = status == 'SENT';
              final isDone = status == 'RECEIVED';
              return GestureDetector(
                onTap: () => context.go('/transfer/${t['id']}'),
                child: Container(
                margin: const EdgeInsets.only(bottom: 10),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: isSent ? const Color(0xFFFDBA74) : isDone ? const Color(0xFF86EFAC) : AppTheme.border),
                ),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  if (isSent) Container(height: 4, decoration: const BoxDecoration(color: Color(0xFFF97316), borderRadius: BorderRadius.only(topLeft: Radius.circular(16), topRight: Radius.circular(16)))),
                  if (isDone) Container(height: 4, decoration: const BoxDecoration(color: Color(0xFF22C55E), borderRadius: BorderRadius.only(topLeft: Radius.circular(16), topRight: Radius.circular(16)))),
                  Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Container(
                          width: 40, height: 40,
                          decoration: BoxDecoration(color: isSent ? const Color(0xFFFFF7ED) : isDone ? const Color(0xFFF0FDF4) : const Color(0xFFF8FAFC), borderRadius: BorderRadius.circular(10)),
                          child: Icon(Icons.inventory_2_rounded, size: 20, color: isSent ? const Color(0xFFF97316) : isDone ? const Color(0xFF22C55E) : AppTheme.textMuted),
                        ),
                        const SizedBox(width: 10),
                        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Row(children: [
                            Flexible(child: Text(t['fromLocation']['name'] ?? '', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textPrimary), overflow: TextOverflow.ellipsis)),
                            const Padding(padding: EdgeInsets.symmetric(horizontal: 4), child: Icon(Icons.arrow_forward_rounded, size: 12, color: AppTheme.textMuted)),
                            Flexible(child: Text(t['toLocation']['name'] ?? '', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textPrimary), overflow: TextOverflow.ellipsis)),
                          ]),
                          const SizedBox(height: 2),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                            decoration: BoxDecoration(color: cfg.bg, borderRadius: BorderRadius.circular(8)),
                            child: Row(mainAxisSize: MainAxisSize.min, children: [
                              Icon(cfg.icon, size: 11, color: cfg.text),
                              const SizedBox(width: 4),
                              Text(cfg.label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: cfg.text)),
                            ]),
                          ),
                          const SizedBox(height: 2),
                          Text(formatDate(t['createdAt'] as String, withTime: true), style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                          if ((t['notes'] as String?)?.isNotEmpty == true)
                            Text('· ${t['notes']}', style: const TextStyle(fontSize: 11, color: AppTheme.textMuted, fontStyle: FontStyle.italic)),
                        ])),
                      ]),
                      const SizedBox(height: 10),
                      Wrap(spacing: 6, runSpacing: 4, children: (t['items'] as List).map((item) {
                        final displayQty = (status == 'RECEIVED' && item['receivedQty'] != null) ? item['receivedQty'] : item['quantity'];
                        final hasSelisih = status == 'RECEIVED' && item['receivedQty'] != null && item['receivedQty'] != item['quantity'];
                        return Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: hasSelisih ? const Color(0xFFFEF2F2) : const Color(0xFFF8FAFC),
                            borderRadius: BorderRadius.circular(20),
                            border: hasSelisih ? Border.all(color: const Color(0xFFFECACA)) : null,
                          ),
                          child: Text('${item['item']['name']} $displayQty ${item['item']['unit']}', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: hasSelisih ? AppTheme.danger : AppTheme.textSecondary)),
                        );
                      }).toList()),
                      if (isSent) ...[
                        const SizedBox(height: 10),
                        Row(children: [
                          Expanded(child: ElevatedButton.icon(
                            onPressed: () => _openReceive(t as Map),
                            icon: const Icon(Icons.check_circle_rounded, size: 16),
                            label: const Text('Konfirmasi Diterima', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF22C55E), foregroundColor: Colors.white, shape: const StadiumBorder(), padding: const EdgeInsets.symmetric(vertical: 10), elevation: 0),
                          )),
                          const SizedBox(width: 8),
                          OutlinedButton(
                            onPressed: () => _reject(t['id'] as String),
                            style: OutlinedButton.styleFrom(shape: const StadiumBorder(), side: const BorderSide(color: Color(0xFFFECACA)), foregroundColor: AppTheme.danger, padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10)),
                            child: const Text('Tolak', style: TextStyle(fontSize: 13)),
                          ),
                        ]),
                      ],
                    ]),
                  ),
                ]),
              ));
            }),
          const SizedBox(height: 24),
        ]),
      ),
    );
  }

  Widget _locDropdown(String label, String value, ValueChanged<String?> onChanged, {String? exclude}) =>
    Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: AppTheme.textPrimary)),
      const SizedBox(height: 6),
      DropdownButtonFormField<String>(
        initialValue: value.isEmpty ? null : value,
        onChanged: onChanged,
        decoration: _fldDec(),
        items: _locations.cast<Map>().where((l) => l['id'] != exclude).map((l) => DropdownMenuItem<String>(value: l['id'] as String, child: Text(l['name'] as String, style: const TextStyle(fontSize: 13)))).toList(),
      ),
    ]);

  InputDecoration _fldDec({String? hint}) => InputDecoration(
    hintText: hint, hintStyle: const TextStyle(color: AppTheme.textMuted, fontSize: 13),
    filled: true, fillColor: const Color(0xFFF9FAFB),
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.border)),
    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.border)),
    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.primary, width: 2)),
    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
  );
}

class _Row {
  String itemId = '', qty = '', inputUnit = 'base';
}

class _ReceiveModal extends StatefulWidget {
  final Map transfer;
  final VoidCallback onConfirmed;
  const _ReceiveModal({required this.transfer, required this.onConfirmed});
  @override
  State<_ReceiveModal> createState() => _ReceiveModalState();
}

class _ReceiveModalState extends State<_ReceiveModal> {
  late List<Map<String, dynamic>> _items;
  final _notesCtrl = TextEditingController();
  bool _confirming = false;

  @override
  void initState() {
    super.initState();
    _items = (widget.transfer['items'] as List).map((i) => {
      'id': i['id'],
      'name': i['item']['name'],
      'unit': i['item']['unit'],
      'sentQty': (toNum(i['quantity']) ?? 0).toInt(),
      'receivedQty': (toNum(i['quantity']) ?? 0).toInt(),
    }).toList();
  }

  @override
  void dispose() { _notesCtrl.dispose(); super.dispose(); }

  bool get _hasShortage => _items.any((i) => (i['receivedQty'] as int) < (i['sentQty'] as int));

  Future<void> _confirm() async {
    if (_hasShortage && _notesCtrl.text.trim().isEmpty) return;
    setState(() => _confirming = true);
    try {
      await api.post('/api/transfers/${widget.transfer['id']}/confirm', data: {
        'action': 'receive',
        'receivedItems': _items.map((i) => {'id': i['id'], 'receivedQty': i['receivedQty']}).toList(),
        'notes': _notesCtrl.text.isEmpty ? null : _notesCtrl.text,
      });
      widget.onConfirmed();
      if (mounted) Navigator.pop(context);
    } catch (_) {
    } finally {
      if (mounted) setState(() => _confirming = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.transfer;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.85),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(margin: const EdgeInsets.symmetric(vertical: 8), width: 36, height: 4, decoration: BoxDecoration(color: AppTheme.border, borderRadius: BorderRadius.circular(2))),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 8, 8),
            child: Row(children: [
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Verifikasi Barang Diterima', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                Text('${t['fromLocation']['name']} → ${t['toLocation']['name']}', style: const TextStyle(fontSize: 12, color: AppTheme.textMuted)),
              ])),
              IconButton(icon: const Icon(Icons.close_rounded, color: AppTheme.textMuted), onPressed: () => Navigator.pop(context)),
            ]),
          ),
          const Divider(height: 1, color: AppTheme.border),
          Flexible(child: SingleChildScrollView(padding: const EdgeInsets.all(16), child: Column(children: [
            const Text('Masukkan jumlah aktual yang diterima. Jika ada selisih, stok kekurangan otomatis kembali ke lokasi asal.', style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
            const SizedBox(height: 12),
            ..._items.asMap().entries.map((e) {
              final i    = e.key;
              final item = e.value;
              final recv = item['receivedQty'] as int;
              final sent = item['sentQty'] as int;
              final short = recv < sent;
              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: short ? const Color(0xFFFFFBEB) : Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: short ? const Color(0xFFFDE68A) : AppTheme.border),
                ),
                child: Column(children: [
                  Row(children: [
                    Expanded(child: Text(item['name'] as String, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500))),
                    if (short) Text('Selisih ${sent - recv} ${item['unit']}', style: const TextStyle(fontSize: 11, color: AppTheme.warning, fontWeight: FontWeight.w600)),
                  ]),
                  const SizedBox(height: 8),
                  Row(children: [
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('Dikirim', style: TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                      Text('$sent ${item['unit']}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textSecondary)),
                    ])),
                    const Icon(Icons.arrow_forward_rounded, size: 16, color: AppTheme.textMuted),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                      const Text('Diterima', style: TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                      Row(mainAxisAlignment: MainAxisAlignment.end, children: [
                        SizedBox(width: 64, child: TextField(
                          keyboardType: TextInputType.number,
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                          controller: TextEditingController(text: recv.toString()),
                          onChanged: (v) => setState(() => _items[i]['receivedQty'] = int.tryParse(v) ?? 0),
                          decoration: InputDecoration(
                            contentPadding: const EdgeInsets.symmetric(vertical: 8),
                            filled: true, fillColor: const Color(0xFFF9FAFB),
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide(color: short ? AppTheme.warning : AppTheme.border)),
                            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide(color: short ? AppTheme.warning : AppTheme.border)),
                            focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: AppTheme.primary, width: 2)),
                          ),
                        )),
                        const SizedBox(width: 4),
                        Text(item['unit'] as String, style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                      ]),
                    ])),
                  ]),
                ]),
              );
            }),
            if (_hasShortage) ...[
              const SizedBox(height: 4),
              Container(padding: const EdgeInsets.all(10), decoration: BoxDecoration(color: const Color(0xFFFFFBEB), borderRadius: BorderRadius.circular(10), border: Border.all(color: const Color(0xFFFDE68A))), child: const Row(children: [
                Icon(Icons.warning_rounded, size: 14, color: AppTheme.warning),
                SizedBox(width: 6),
                Expanded(child: Text('Ada selisih — tambahkan catatan penyebabnya agar tercatat.', style: TextStyle(fontSize: 12, color: Color(0xFF92400E)))),
              ])),
              const SizedBox(height: 8),
            ],
            TextField(
              controller: _notesCtrl,
              onChanged: (_) => setState(() {}),
              maxLines: 2,
              decoration: InputDecoration(
                hintText: 'Catatan penerimaan${_hasShortage ? " *" : " (opsional)"}',
                hintStyle: const TextStyle(color: AppTheme.textMuted, fontSize: 13),
                filled: true, fillColor: const Color(0xFFF9FAFB),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: _hasShortage && _notesCtrl.text.isEmpty ? AppTheme.danger : AppTheme.border)),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: _hasShortage && _notesCtrl.text.isEmpty ? AppTheme.danger : AppTheme.border)),
                focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.primary, width: 2)),
                contentPadding: const EdgeInsets.all(12),
              ),
            ),
          ]))),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(children: [
              Expanded(child: OutlinedButton(onPressed: () => Navigator.pop(context), style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)), side: const BorderSide(color: AppTheme.border)), child: const Text('Batal', style: TextStyle(color: AppTheme.textSecondary)))),
              const SizedBox(width: 10),
              Expanded(child: ElevatedButton.icon(
                onPressed: (_confirming || (_hasShortage && _notesCtrl.text.trim().isEmpty)) ? null : _confirm,
                icon: _confirming ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.check_circle_rounded, size: 16),
                label: Text(_confirming ? 'Memproses...' : 'Konfirmasi', style: const TextStyle(fontWeight: FontWeight.w600)),
                style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF22C55E), foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(vertical: 14), shape: const StadiumBorder(), elevation: 0),
              )),
            ]),
          ),
        ]),
      ),
    );
  }
}
