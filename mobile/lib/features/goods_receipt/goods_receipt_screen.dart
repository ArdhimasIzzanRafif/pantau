import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/widgets.dart';

const _units = ['botol','bungkus','butir','gram','ikat','kaleng','kg','lembar','liter','ml','pcs','potong','sachet'];
const _packUnits = ['ball','box','drum','dus','galon','jerigen','karton','karung','krat','lusin','pack','peti','renteng','roll','sak','toples'];

class GoodsReceiptScreen extends ConsumerStatefulWidget {
  const GoodsReceiptScreen({super.key});
  @override
  ConsumerState<GoodsReceiptScreen> createState() => _GoodsReceiptScreenState();
}

class _GoodsReceiptScreenState extends ConsumerState<GoodsReceiptScreen> {
  List<dynamic> _receipts = [], _locations = [], _inventory = [];
  bool _loading = true, _showNew = false, _submitting = false;
  String _filterLoc = '', _error = '';

  String _locId = '', _supplier = '', _receiptNum = '', _notes = '';
  List<_ReceiptRow> _rows = [_ReceiptRow()];

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final r = await Future.wait([
        api.get('/api/goods-receipts'),
        api.get('/api/locations'),
        api.get('/api/inventory'),
      ]);
      _receipts  = asList(r[0]);
      _locations = (r[1] as List?) ?? [];
      _inventory = (r[2] as List?) ?? [];
      if (_locId.isEmpty && _locations.isNotEmpty) _locId = _locations[0]['id'] as String;
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  Map? _getItem(String id) => _inventory.cast<Map>().where((i) => i['id'] == id).firstOrNull;

  double? _priceDiffPct(_ReceiptRow row) {
    if (row.itemId.isEmpty || row.isNew) return null;
    final item    = _getItem(row.itemId);
    final masterCp = toNum(item?['costPrice']);
    final inputCp  = double.tryParse(row.costPrice);
    if (masterCp == null || inputCp == null || masterCp == 0) return null;
    final ps      = toNum(item!['packSize'])?.toDouble();
    final inputBase = (row.inputUnit == 'pack' && ps != null) ? inputCp / ps : inputCp;
    return ((inputBase - masterCp) / masterCp) * 100;
  }

  Future<void> _submit() async {
    setState(() { _submitting = true; _error = ''; });
    try {
      if (_locId.isEmpty) { setState(() { _error = 'Pilih lokasi'; _submitting = false; }); return; }
      final valid = _rows.where((r) => (r.itemId.isNotEmpty || r.isNew) && (int.tryParse(r.qty) ?? 0) > 0).toList();
      if (valid.isEmpty) { setState(() { _error = 'Tambahkan minimal 1 item'; _submitting = false; }); return; }

      final items = <Map<String, dynamic>>[];
      for (final row in valid) {
        String itemId = row.itemId;
        if (row.isNew) {
          final newItem = await api.post('/api/inventory', data: {
            'name': row.newName.trim(),
            'unit': row.newUnit,
            'packSize': double.tryParse(row.newPackSize),
            'packUnit': row.newPackUnit.isEmpty ? null : row.newPackUnit,
            'isTrackable': true,
            'isActive': true,
          });
          itemId = newItem['id'] as String;
        }
        final ps    = toNum(_getItem(itemId)?['packSize'])?.toDouble();
        final qty   = int.tryParse(row.qty) ?? 0;
        final qtyBase = (row.inputUnit == 'pack' && ps != null) ? (qty * ps).toInt() : qty;
        final cp    = double.tryParse(row.costPrice);
        double? cpBase;
        if (cp != null) cpBase = (row.inputUnit == 'pack' && ps != null) ? cp / ps : cp;
        items.add({'itemId': itemId, 'quantity': qtyBase, 'costPrice': cpBase});
      }

      String finalNotes = _notes;
      for (final row in valid.where((r) => !r.isNew)) {
        final pct = _priceDiffPct(row);
        if (pct != null && pct.abs() >= 5) {
          final sign = pct > 0 ? '+' : '';
          finalNotes += '${finalNotes.isEmpty ? '' : '; '}${_getItem(row.itemId)?['name']} harga $sign${pct.toStringAsFixed(1)}% dari HPP';
        }
      }

      await api.post('/api/goods-receipts', data: {
        'locationId':    _locId,
        'supplier':      _supplier.isEmpty ? null : _supplier,
        'receiptNumber': _receiptNum.isEmpty ? null : _receiptNum,
        'notes':         finalNotes.isEmpty ? null : finalNotes,
        'items':         items,
      });
      setState(() { _showNew = false; _rows = [_ReceiptRow()]; _supplier = ''; _receiptNum = ''; _notes = ''; });
      _load();
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  List<dynamic> get _filtered => _receipts.where((r) => _filterLoc.isEmpty || r['locationId'] == _filterLoc).toList();

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;
    return Scaffold(
      backgroundColor: AppTheme.surface,
      body: _loading ? const LoadingCenter() : RefreshIndicator(
        onRefresh: _load,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Barang Masuk', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w300, color: AppTheme.textPrimary, letterSpacing: -0.5)),
              Text('Catat penerimaan barang dari supplier', style: TextStyle(fontSize: 12, color: AppTheme.textMuted)),
            ])),
            if (!_showNew)
              ElevatedButton.icon(
                onPressed: () => setState(() { _showNew = true; _error = ''; }),
                icon: const Icon(Icons.add_rounded, size: 16),
                label: const Text('Catat Masuk', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary, foregroundColor: Colors.white, shape: const StadiumBorder(), padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10), elevation: 0),
              ),
          ]),

          if (_showNew) ...[
            const SizedBox(height: 14),
            Container(
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppTheme.border)),
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                  const Text('Penerimaan Barang Baru', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                  IconButton(icon: const Icon(Icons.close_rounded, color: AppTheme.textMuted, size: 20), onPressed: () => setState(() => _showNew = false)),
                ]),
                if (_error.isNotEmpty) _errBox(_error),

                _lbl('Lokasi Penerimaan *'),
                DropdownButtonFormField<String>(
                  initialValue: _locId.isEmpty ? null : _locId,
                  onChanged: (v) => setState(() => _locId = v ?? ''),
                  decoration: _fldDec(),
                  items: _locations.cast<Map>().map((l) => DropdownMenuItem<String>(value: l['id'] as String, child: Text(l['name'] as String, style: const TextStyle(fontSize: 13)))).toList(),
                ),
                const SizedBox(height: 12),

                Row(children: [
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    _lbl('Supplier'),
                    TextField(onChanged: (v) => setState(() => _supplier = v), decoration: _fldDec(hint: 'Nama supplier...'), style: const TextStyle(fontSize: 13)),
                  ])),
                  const SizedBox(width: 10),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    _lbl('No. Surat Jalan'),
                    TextField(onChanged: (v) => setState(() => _receiptNum = v), decoration: _fldDec(hint: 'SJ-001'), style: const TextStyle(fontSize: 13)),
                  ])),
                ]),
                const SizedBox(height: 12),

                const Text('Item yang Diterima', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textPrimary)),
                const SizedBox(height: 8),

                ..._rows.asMap().entries.map((e) => _buildRow(e.key, e.value)),

                TextButton.icon(
                  onPressed: () => setState(() => _rows.add(_ReceiptRow())),
                  icon: const Icon(Icons.add_rounded, size: 16, color: AppTheme.primary),
                  label: const Text('Tambah Item', style: TextStyle(color: AppTheme.primary, fontWeight: FontWeight.w600)),
                ),
                const SizedBox(height: 8),

                _lbl('Catatan'),
                TextField(onChanged: (v) => setState(() => _notes = v), decoration: _fldDec(hint: 'Catatan tambahan...'), style: const TextStyle(fontSize: 13)),
                const SizedBox(height: 14),

                Row(children: [
                  Expanded(child: OutlinedButton(onPressed: () => setState(() => _showNew = false), style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)), side: const BorderSide(color: AppTheme.border)), child: const Text('Batal', style: TextStyle(color: AppTheme.textSecondary)))),
                  const SizedBox(width: 10),
                  Expanded(child: ElevatedButton(
                    onPressed: _submitting ? null : _submit,
                    style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(vertical: 14), shape: const StadiumBorder(), elevation: 0),
                    child: _submitting ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('Simpan', style: TextStyle(fontWeight: FontWeight.w600)),
                  )),
                ]),
              ]),
            ),
          ],

          const SizedBox(height: 14),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(children: [
              _filterChip('Semua', '', _filterLoc),
              ..._locations.cast<Map>().map((l) => _filterChip(l['name'] as String, l['id'] as String, _filterLoc)),
            ]),
          ),
          const SizedBox(height: 10),

          if (filtered.isEmpty)
            Container(
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppTheme.border)),
              padding: const EdgeInsets.all(40),
              child: Column(children: [
                Container(width: 56, height: 56, decoration: BoxDecoration(color: const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(16)), child: const Icon(Icons.local_shipping_rounded, size: 28, color: AppTheme.textMuted)),
                const SizedBox(height: 12),
                const Text('Belum ada catatan barang masuk', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppTheme.textSecondary)),
              ]),
            )
          else
            ...filtered.map((rec) {
              final totalItems = (rec['items'] as List?)?.length ?? 0;
              return GestureDetector(
                onTap: () => context.go('/goods-receipt/${rec['id']}'),
                child: Container(
                margin: const EdgeInsets.only(bottom: 10),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppTheme.border)),
                padding: const EdgeInsets.all(14),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Container(width: 40, height: 40, decoration: BoxDecoration(color: const Color(0xFFF0FDF4), borderRadius: BorderRadius.circular(10)), child: const Icon(Icons.local_shipping_rounded, size: 20, color: Color(0xFF22C55E))),
                    const SizedBox(width: 10),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(rec['location']?['name'] ?? '', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.textPrimary)),
                      Text(formatDate(rec['createdAt'] as String, withTime: true), style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                    ])),
                    if (rec['receiptNumber'] != null)
                      Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3), decoration: BoxDecoration(color: const Color(0xFFF8FAFC), borderRadius: BorderRadius.circular(6), border: Border.all(color: AppTheme.border)), child: Text(rec['receiptNumber'] as String, style: const TextStyle(fontSize: 10, fontFamily: 'monospace', color: AppTheme.textSecondary))),
                  ]),
                  if (rec['supplier'] != null) ...[
                    const SizedBox(height: 6),
                    Text('Supplier: ${rec['supplier']}', style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
                  ],
                  const SizedBox(height: 8),
                  Wrap(spacing: 6, runSpacing: 4, children: [
                    Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3), decoration: BoxDecoration(color: const Color(0xFFEFF6FF), borderRadius: BorderRadius.circular(20)), child: Text('$totalItems item', style: const TextStyle(fontSize: 11, color: AppTheme.primary, fontWeight: FontWeight.w600))),
                    ...(rec['items'] as List? ?? []).take(3).map((item) => Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(color: const Color(0xFFF8FAFC), borderRadius: BorderRadius.circular(20)),
                      child: Text('${item['item']['name']} ${item['quantity']}${item['item']['unit']}', style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
                    )),
                    if (totalItems > 3) Text('+${totalItems - 3} lagi', style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                  ]),
                  if (rec['notes'] != null) ...[
                    const SizedBox(height: 6),
                    Text(rec['notes'] as String, style: const TextStyle(fontSize: 11, color: AppTheme.textMuted, fontStyle: FontStyle.italic)),
                  ],
                ]),
              ));
            }),
          const SizedBox(height: 24),
        ]),
      ),
    );
  }

  Widget _buildRow(int i, _ReceiptRow row) {
    final item = row.itemId.isNotEmpty && !row.isNew ? _getItem(row.itemId) : null;
    final hasPack = item != null && item['packSize'] != null && item['packUnit'] != null;
    final pct = _priceDiffPct(row);
    final priceDiff = pct != null && pct.abs() >= 5;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: priceDiff ? const Color(0xFFFFFBEB) : const Color(0xFFF9FAFB), borderRadius: BorderRadius.circular(12), border: Border.all(color: priceDiff ? const Color(0xFFFDE68A) : AppTheme.border)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: DropdownButtonFormField<String>(
            initialValue: row.isNew ? '__new__' : (row.itemId.isEmpty ? null : row.itemId),
            hint: const Text('Pilih item...', style: TextStyle(color: AppTheme.textMuted, fontSize: 13)),
            onChanged: (v) => setState(() { _rows[i].itemId = v == '__new__' ? '' : (v ?? ''); _rows[i].isNew = v == '__new__'; _rows[i].inputUnit = 'base'; }),
            decoration: _fldDec(),
            items: [
              const DropdownMenuItem(value: '__new__', child: Row(children: [Icon(Icons.add_circle_rounded, size: 14, color: AppTheme.primary), SizedBox(width: 6), Text('+ Item baru', style: TextStyle(fontSize: 13, color: AppTheme.primary, fontWeight: FontWeight.w600))])),
              ..._inventory.cast<Map>().where((it) => toBool(it['isActive'], fallback: true)).map((it) => DropdownMenuItem<String>(value: it['id'] as String, child: Text('${it['name']} (${it['unit']})', style: const TextStyle(fontSize: 13)))),
            ],
          )),
          IconButton(icon: const Icon(Icons.close_rounded, size: 18, color: AppTheme.textMuted), onPressed: () => setState(() { if (_rows.length > 1) _rows.removeAt(i); })),
        ]),
        if (row.isNew) ...[
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: const Color(0xFFEFF6FF), borderRadius: BorderRadius.circular(10)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Data Item Baru', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppTheme.primary)),
              const SizedBox(height: 8),
              TextField(onChanged: (v) => setState(() => _rows[i].newName = v), decoration: _fldDec(hint: 'Nama item *'), style: const TextStyle(fontSize: 13)),
              const SizedBox(height: 6),
              Row(children: [
                Expanded(child: DropdownButtonFormField<String>(
                  initialValue: row.newUnit.isEmpty ? null : row.newUnit,
                  hint: const Text('Satuan', style: TextStyle(fontSize: 12, color: AppTheme.textMuted)),
                  onChanged: (v) => setState(() => _rows[i].newUnit = v ?? 'pcs'),
                  decoration: _fldDec(),
                  items: _units.map((u) => DropdownMenuItem(value: u, child: Text(u, style: const TextStyle(fontSize: 12)))).toList(),
                )),
                const SizedBox(width: 6),
                SizedBox(width: 70, child: TextField(onChanged: (v) => setState(() => _rows[i].newPackSize = v), decoration: _fldDec(hint: 'Isi/dos'), keyboardType: TextInputType.number, style: const TextStyle(fontSize: 12))),
                const SizedBox(width: 6),
                Expanded(child: DropdownButtonFormField<String>(
                  initialValue: row.newPackUnit.isEmpty ? null : row.newPackUnit,
                  hint: const Text('Kemasan', style: TextStyle(fontSize: 12, color: AppTheme.textMuted)),
                  onChanged: (v) => setState(() => _rows[i].newPackUnit = v ?? ''),
                  decoration: _fldDec(),
                  items: _packUnits.map((u) => DropdownMenuItem(value: u, child: Text(u, style: const TextStyle(fontSize: 12)))).toList(),
                )),
              ]),
            ]),
          ),
        ],
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: TextField(onChanged: (v) => setState(() => _rows[i].qty = v), keyboardType: TextInputType.number, decoration: _fldDec(hint: 'Jumlah'), style: const TextStyle(fontSize: 13))),
          const SizedBox(width: 6),
          if (!row.isNew && hasPack)
            SizedBox(width: 80, child: DropdownButtonFormField<String>(
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
          const SizedBox(width: 6),
          Expanded(child: TextField(onChanged: (v) => setState(() => _rows[i].costPrice = v), keyboardType: TextInputType.number, style: const TextStyle(fontSize: 13), decoration: _fldDec(hint: 'Harga/sat', prefix: 'Rp '))),
        ]),
        if (priceDiff) ...[
          const SizedBox(height: 6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(color: pct > 0 ? const Color(0xFFFEF2F2) : const Color(0xFFF0FDF4), borderRadius: BorderRadius.circular(8)),
            child: Row(children: [
              Icon(pct > 0 ? Icons.trending_up_rounded : Icons.trending_down_rounded, size: 14, color: pct > 0 ? AppTheme.danger : const Color(0xFF22C55E)),
              const SizedBox(width: 4),
              Expanded(child: Text('${pct > 0 ? '+' : ''}${pct.toStringAsFixed(1)}% dari HPP master — pastikan sudah benar', style: TextStyle(fontSize: 11, color: pct > 0 ? AppTheme.danger : const Color(0xFF15803D)))),
            ]),
          ),
        ],
      ]),
    );
  }

  Widget _filterChip(String label, String val, String current) => GestureDetector(
    onTap: () => setState(() => _filterLoc = val),
    child: Container(
      margin: const EdgeInsets.only(right: 6),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(color: current == val ? const Color(0xFF0F172A) : Colors.white, border: Border.all(color: current == val ? const Color(0xFF0F172A) : AppTheme.border), borderRadius: BorderRadius.circular(20)),
      child: Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: current == val ? Colors.white : AppTheme.textSecondary)),
    ),
  );

  Widget _errBox(String e) => Container(margin: const EdgeInsets.only(bottom: 12), padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: const Color(0xFFFEF2F2), borderRadius: BorderRadius.circular(10), border: Border.all(color: const Color(0xFFFECACA))), child: Text(e, style: const TextStyle(color: AppTheme.danger, fontSize: 13)));
  Widget _lbl(String t) => Padding(padding: const EdgeInsets.only(bottom: 6), child: Text(t, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: AppTheme.textPrimary)));

  InputDecoration _fldDec({String? hint, String? prefix}) => InputDecoration(
    hintText: hint, hintStyle: const TextStyle(color: AppTheme.textMuted, fontSize: 13),
    prefixText: prefix, prefixStyle: const TextStyle(color: AppTheme.textMuted, fontSize: 13),
    filled: true, fillColor: Colors.white,
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.border)),
    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.border)),
    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.primary, width: 2)),
    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
  );
}

class _ReceiptRow {
  String itemId = '', qty = '', costPrice = '', inputUnit = 'base';
  bool isNew = false;
  String newName = '', newUnit = 'pcs', newPackSize = '', newPackUnit = '';
}
