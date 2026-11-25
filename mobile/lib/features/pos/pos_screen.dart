import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:dio/dio.dart';
import 'package:share_plus/share_plus.dart';
import 'dart:convert';
import '../../core/api/api_client.dart';
import '../../core/db/local_db.dart';
import '../../core/theme/app_theme.dart';
import '../../features/auth/auth_provider.dart';
import '../../shared/models/models.dart';
import '../../shared/widgets/widgets.dart';

String _msg(dynamic e) {
  if (e is DioException) return e.error?.toString() ?? e.message ?? 'Terjadi kesalahan';
  return e.toString();
}

// ── Main POS Screen ─────────────────────────────────────────────────────────

class PosScreen extends ConsumerStatefulWidget {
  const PosScreen({super.key});
  @override
  ConsumerState<PosScreen> createState() => _PosScreenState();
}

class _PosScreenState extends ConsumerState<PosScreen> {
  List<MenuItem> _menu = [];
  List<CartItem> _cart = [];
  POSShift? _shift;
  bool _online = true, _loading = true;
  int _pendingCount = 0;
  String _search = '', _category = '';
  final _searchCtrl = TextEditingController();

  List<Map<String, dynamic>> _heldOrders = [];
  String? _heldOrderId;

  @override
  void initState() {
    super.initState();
    _init();
    Connectivity().onConnectivityChanged.listen((r) {
      final online = r.any((x) => x != ConnectivityResult.none);
      if (online && !_online) _syncPending();
      setState(() => _online = online);
    });
  }

  @override
  void dispose() { _searchCtrl.dispose(); super.dispose(); }

  Future<void> _init() async {
    try {
      final r = await Connectivity().checkConnectivity();
      _online = r.any((x) => x != ConnectivityResult.none);
      // Load shift dan products secara parallel — sama seperti web
      await Future.wait([_loadShift(), _loadMenu(), _loadDiscountRules()]);
      _pendingCount = await LocalDB.pendingCount();
      await _fetchHeldOrders();
    } catch (_) {
      _online = false;
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _fetchHeldOrders() async {
    if (!_online || _shift == null) return;
    try {
      final res = await api.get('/api/pos/orders', params: {
        'status': 'HELD', 'locationId': _shift!.locationId,
      });
      if (mounted) {
        setState(() => _heldOrders = (res as List)
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList());
      }
    } catch (_) {}
  }

  Future<void> _holdCurrentOrder({String? tableNumber, String? customerName}) async {
    if (!_online || _shift == null || _cart.isEmpty) return;
    try {
      await api.post('/api/pos/orders', data: {
        'locationId': _shift!.locationId, 'shiftId': _shift!.id,
        'orderType': 'DINE_IN',
        'tableNumber': tableNumber, 'customerName': customerName,
        'items': _cart.map((c) => {
          'menuItemId': c.menuItem.id, 'name': c.menuItem.name,
          'price': c.menuItem.price, 'qty': c.quantity,
          'discount': c.itemDiscount, 'notes': c.notes.isNotEmpty ? c.notes : null,
          'modifiers': c.modifiers.map((m) => m.toJson()).toList(),
        }).toList(),
        'discountType': null, 'discountValue': 0, 'taxPercent': 0,
        'hold': true,
      });
      setState(() { _cart = []; _heldOrderId = null; });
      await _fetchHeldOrders();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: const Text('Order ditahan ✓'),
          backgroundColor: AppTheme.success,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          margin: const EdgeInsets.fromLTRB(12, 0, 12, 8),
        ));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(_msg(e)), backgroundColor: AppTheme.danger,
        ));
      }
    }
  }

  void _showHeldOrdersSheet() {
    showModalBottomSheet(
      context: context, isScrollControlled: true, backgroundColor: Colors.transparent,
      builder: (_) => _HeldOrdersSheet(
        heldOrders: _heldOrders,
        onResume: (held) {
          final items = (held['items'] as List).map((i) {
            final m = Map<String, dynamic>.from(i as Map);
            return CartItem(
              menuItem: MenuItem(
                id: m['menuItemId'] as String? ?? m['id'] as String,
                name: m['name'] as String,
                price: (num.tryParse(m['price'].toString()) ?? 0).toDouble(),
                category: null, description: null, imageUrl: null,
                isAvailable: true, hasRecipe: true,
              ),
              quantity: m['qty'] as int,
              notes: m['notes'] as String? ?? '',
            );
          }).toList();
          setState(() {
            _cart = items;
            _heldOrderId = held['id'] as String;
          });
          Navigator.pop(context);
        },
        onCancel: (id) async {
          try {
            await api.delete('/api/pos/orders/$id/pay');
            await _fetchHeldOrders();
          } catch (_) {}
        },
      ),
    );
  }

  Future<void> _loadShift() async {
    if (!_online) return;
    try {
      final res = await api.get('/api/pos/shifts', params: {'mine': 'true', 'status': 'OPEN'});
      final items = res is Map ? (res['items'] as List? ?? []) : (res as List);
      if (items.isNotEmpty) {
        _shift = POSShift.fromJson(Map<String, dynamic>.from(items.first as Map));
      }
    } catch (_) {}
  }

  Future<void> _loadMenu() async {
    if (_online) {
      try {
        // Pakai locationId dari shift atau dari user auth — load di background, sama seperti web
        final user = ref.read(authProvider).user;
        final locationId = _shift?.locationId ?? user?.locationIds.firstOrNull ?? '';
        final params = locationId.isNotEmpty ? {'locationId': locationId} : <String, String>{};
        final data = await api.get('/api/pos/products', params: params) as List;
        final items = data.map((j) => MenuItem.fromJson(Map<String, dynamic>.from(j as Map))).toList();
        if (mounted) setState(() => _menu = items.where((i) => i.isAvailable).toList());
        try { await LocalDB.cacheMenuItems(items.map((i) => i.toJson()).toList()); } catch (_) {}
        return;
      } catch (_) {}
    }
    final cached = await LocalDB.getCachedMenu();
    if (mounted) setState(() => _menu = cached.map((j) => MenuItem.fromJson(j)).toList());
  }

  Future<void> _openShift(double balance) async {
    final user = ref.read(authProvider).user!;
    final locationId = user.locationIds.firstOrNull ?? '';
    if (locationId.isEmpty) throw Exception('Tidak ada outlet yang ditetapkan');
    try {
      final data = await api.post('/api/pos/shifts', data: {
        'locationId': locationId,
        'openingBalance': balance,
      });
      _shift = POSShift.fromJson(Map<String, dynamic>.from(data as Map));
    } on DioException catch (e) {
      final msg = _msg(e).toLowerCase();
      if (msg.contains('sudah punya shift') || msg.contains('already')) {
        // Shift exists — just reload it
        await _loadShift();
        if (_shift == null) rethrow;
      } else {
        rethrow;
      }
    }
    await _loadMenu();
    if (mounted) setState(() {});
  }

  Future<void> _syncPending() async {
    final pending = await LocalDB.getPendingOrders();
    int synced = 0;
    for (final o in pending) {
      try {
        await api.post('/api/pos/orders', data: {
          'shiftId': o['shift_id'], 'locationId': o['location_id'],
          'items': jsonDecode(o['items_json'] as String),
          'payment': {'method': o['payment_method'], 'amount': o['payment_amount'], 'reference': null},
        });
        await LocalDB.markSynced(o['id'] as String);
        synced++;
      } catch (_) { break; }
    }
    if (synced > 0 && mounted) {
      _pendingCount = await LocalDB.pendingCount();
      if (!mounted) return;
      setState(() {});
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('$synced order offline berhasil disinkronkan ✓'),
        backgroundColor: AppTheme.success,
      ));
    }
  }

  List<MenuItem> get _filtered => _menu.where((m) {
    final matchCat    = _category.isEmpty || m.category == _category;
    final matchSearch = _search.isEmpty || m.name.toLowerCase().contains(_search.toLowerCase());
    return matchCat && matchSearch;
  }).toList();

  List<String> get _categories =>
      _menu.map((m) => m.category ?? '').where((c) => c.isNotEmpty).toSet().toList()..sort();

  void _addToCart(MenuItem item, {List<SelectedModifier> modifiers = const []}) {
    // If item has modifiers and none selected yet → show modifier sheet
    if (item.modifierGroups.isNotEmpty && modifiers.isEmpty) {
      showModalBottomSheet(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (_) => _ModifierSheet(
          item: item,
          onConfirm: (chosen) {
            Navigator.pop(context);
            _addToCart(item, modifiers: chosen);
          },
        ),
      );
      return;
    }

    final key = '${item.id}::${modifiers.map((m) => m.optionId).join("|")}';
    setState(() {
      final idx = _cart.indexWhere((c) => c.cartKey == key);
      if (idx >= 0) { _cart[idx].quantity++; }
      else { _cart.add(CartItem(menuItem: item, modifiers: modifiers, cartKey: key)); }
    });
    // Warning non-blocking saat item belum punya resep — stok tidak akan ter-deduct
    if (!item.hasRecipe) {
      ScaffoldMessenger.of(context).clearSnackBars();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Row(children: [
          const Icon(Icons.warning_amber_rounded, color: Color(0xFFFBBF24), size: 16),
          const SizedBox(width: 8),
          Expanded(child: Text('${item.name} belum ada resep — stok tidak akan ter-deduct.', style: const TextStyle(fontSize: 12))),
        ]),
        backgroundColor: const Color(0xFF1E293B),
        behavior: SnackBarBehavior.floating,
        margin: const EdgeInsets.fromLTRB(12, 0, 12, 8),
        duration: const Duration(seconds: 4),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ));
    }
  }

  void _updateQty(String cartKey, int delta) {
    setState(() {
      final idx = _cart.indexWhere((c) => c.cartKey == cartKey);
      if (idx < 0) return;
      _cart[idx].quantity += delta;
      if (_cart[idx].quantity <= 0) _cart.removeAt(idx);
    });
  }

  void _updateNote(String cartKey, String note) {
    final idx = _cart.indexWhere((c) => c.cartKey == cartKey);
    if (idx >= 0) _cart[idx].notes = note;
  }

  void _updateItemDiscount(String cartKey, String type, double value) {
    final idx = _cart.indexWhere((c) => c.cartKey == cartKey);
    if (idx >= 0) {
      setState(() {
        _cart[idx].itemDiscountType = type;
        _cart[idx].itemDiscountValue = value;
      });
    }
  }

  List<DiscountRule> _discountRules = [];
  Future<void> _loadDiscountRules() async {
    try {
      final res = await api.get('/api/discount-rules') as List;
      if (mounted) setState(() => _discountRules = res.map((e) => DiscountRule.fromJson(Map<String, dynamic>.from(e as Map))).where((r) => r.isActive).toList());
    } catch (_) {}
  }

  int get _itemCount => _cart.fold(0, (s, c) => s + c.quantity);
  double get _total  => _cart.fold(0.0, (s, c) => s + c.subtotal);

  void _openCart() {
    showModalBottomSheet(
      context: context, isScrollControlled: true, backgroundColor: Colors.transparent,
      builder: (_) => _CartSheet(
        cart: _cart, total: _total,
        isResumingHeld: _heldOrderId != null,
        onQty: (id, d) { _updateQty(id, d); setState(() {}); },
        onNote: _updateNote,
        onDiscount: _updateItemDiscount,
        onCheckout: () { Navigator.pop(context); _openPayment(); },
        onHold: _shift != null && _heldOrderId == null ? () async {
          Navigator.pop(context);
          await _holdCurrentOrder();
        } : null,
      ),
    );
  }

  void _openPayment() {
    final cartSnapshot = List<CartItem>.from(_cart);
    final user = ref.read(authProvider).user!;
    showModalBottomSheet(
      context: context, isScrollControlled: true, backgroundColor: Colors.transparent,
      builder: (_) => _PaymentSheet(
        cart: _cart, total: _total, shift: _shift, isOnline: _online,
        discountRules: _discountRules,
        onConfirm: _submitOrder,
        onSuccess: (order, payMethod, finalTotal, change, tableNum, custName) {
          showModalBottomSheet(
            context: context, isScrollControlled: true, backgroundColor: Colors.transparent,
            isDismissible: false,
            builder: (_) => _ReceiptSheet(
              businessName: user.businessName,
              locationName: _shift?.locationName ?? '',
              locationAddress: (order?['location'] as Map?)?['address'] as String?,
              cashierName: user.name,
              orderNumber: order?['orderNumber'] as String?,
              paidAt: order?['paidAt'] as String?,
              tableNumber: tableNum,
              customerName: custName,
              cartItems: cartSnapshot,
              discountAmount: order != null
                ? (num.tryParse(order['discountAmount']?.toString() ?? '0') ?? 0).toDouble()
                : 0,
              taxAmount: order != null
                ? (num.tryParse(order['taxAmount']?.toString() ?? '0') ?? 0).toDouble()
                : 0,
              total: finalTotal,
              isOffline: order == null,
            ),
          );
        },
      ),
    );
  }

  Future<Map<String, dynamic>?> _submitOrder({
    required String paymentMethod, required double paymentAmount,
    required String orderType, String? tableNumber, String? customerName,
    String? discountType, double discountValue = 0, String? discountLabel,
    String? platformOrderNumber,
  }) async {
    final user = ref.read(authProvider).user!;
    final locationId = _shift?.locationId ?? user.locationIds.firstOrNull ?? '';
    final items = _cart.map((c) => {
      'menuItemId': c.menuItem.id, 'name': c.menuItem.name,
      'price': c.menuItem.price, 'qty': c.quantity,
      'discount': c.itemDiscount, 'notes': c.notes.isNotEmpty ? c.notes : null,
      'modifiers': c.modifiers.map((m) => m.toJson()).toList(),
    }).toList();

    final isDeliveryPlatform = ['GOFOOD', 'GRABFOOD', 'SHOPEEFOOD'].contains(paymentMethod);

    Map<String, dynamic>? order;
    if (_online && _shift != null) {
      if (_heldOrderId != null) {
        // Pay a previously held order
        final res = await api.post('/api/pos/orders/$_heldOrderId/pay', data: {
          'payment': {'method': paymentMethod, 'amount': paymentAmount, 'reference': isDeliveryPlatform ? platformOrderNumber : null},
        });
        order = (res as Map?)?.cast<String, dynamic>();
        _heldOrderId = null;
        await _fetchHeldOrders();
      } else {
        final res = await api.post('/api/pos/orders', data: {
          'locationId': locationId, 'shiftId': _shift!.id,
          'orderType': orderType,
          'tableNumber': orderType == 'DINE_IN' ? tableNumber : null,
          'customerName': (customerName?.isNotEmpty == true) ? customerName : null,
          'items': items,
          'discountType': discountType?.isNotEmpty == true ? discountType : null,
          'discountValue': discountValue,
          'discountLabel': (discountLabel?.isNotEmpty == true) ? discountLabel : null,
          if (isDeliveryPlatform && platformOrderNumber != null && platformOrderNumber.isNotEmpty)
            'platformOrderNumber': platformOrderNumber,
          'taxPercent': 0, 'notes': null,
          'payment': {'method': paymentMethod, 'amount': paymentAmount, 'reference': isDeliveryPlatform ? platformOrderNumber : null},
        });
        order = (res as Map?)?.cast<String, dynamic>();
      }
    } else {
      await LocalDB.savePendingOrder(
        id: 'local-${DateTime.now().millisecondsSinceEpoch}',
        shiftId: _shift?.id ?? 'offline', locationId: locationId,
        items: items, totalAmount: _total,
        paymentMethod: paymentMethod, paymentAmount: paymentAmount,
      );
      _pendingCount = await LocalDB.pendingCount();
    }
    setState(() => _cart = []);
    return order;
  }

  void _showOpenShiftSheet() => showModalBottomSheet(
    context: context, isScrollControlled: true, backgroundColor: Colors.transparent,
    builder: (_) => _OpenShiftSheet(onOpen: (bal) async {
      Navigator.pop(context);
      try { await _openShift(bal); } catch (e) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(_msg(e)), backgroundColor: AppTheme.danger));
      }
    }),
  );

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F172A),
        foregroundColor: Colors.white, elevation: 0,
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Kasir POS', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Colors.white)),
          Row(children: [
            Container(width: 6, height: 6, decoration: BoxDecoration(
              color: _shift != null ? const Color(0xFF4ADE80) : const Color(0xFFFBBF24),
              shape: BoxShape.circle,
            )),
            const SizedBox(width: 5),
            Text(
              _shift != null ? _shift!.locationName : (_online ? 'Belum ada shift' : 'Mode Offline'),
              style: TextStyle(fontSize: 11, color: _shift != null ? const Color(0xFF94A3B8) : const Color(0xFFFBBF24)),
            ),
          ]),
        ]),
        actions: [
          if (_heldOrders.isNotEmpty)
            GestureDetector(
              onTap: _showHeldOrdersSheet,
              child: Container(
                margin: const EdgeInsets.only(right: 6),
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(color: const Color(0xFFD97706), borderRadius: BorderRadius.circular(10)),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.pause_rounded, size: 13, color: Colors.white),
                  const SizedBox(width: 3),
                  Text('${_heldOrders.length}', style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700)),
                ]),
              ),
            ),
          if (_pendingCount > 0)
            GestureDetector(
              onTap: _syncPending,
              child: Container(
                margin: const EdgeInsets.only(right: 8),
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(color: AppTheme.warning, borderRadius: BorderRadius.circular(10)),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.sync_rounded, size: 13, color: Colors.white),
                  const SizedBox(width: 3),
                  Text('$_pendingCount', style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700)),
                ]),
              ),
            ),
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: Icon(_online ? Icons.wifi_rounded : Icons.wifi_off_rounded,
              size: 18, color: _online ? const Color(0xFF4ADE80) : const Color(0xFFF87171)),
          ),
        ],
      ),
      body: _loading ? const LoadingCenter() : Column(children: [
        // Resumed held order banner
        if (_heldOrderId != null)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            color: const Color(0xFFEFF6FF),
            child: Row(children: [
              const Icon(Icons.play_arrow_rounded, size: 16, color: Color(0xFF1D4ED8)),
              const SizedBox(width: 8),
              const Expanded(child: Text('Melanjutkan order ditahan', style: TextStyle(fontSize: 13, color: Color(0xFF1D4ED8), fontWeight: FontWeight.w500))),
              GestureDetector(
                onTap: () => setState(() { _cart = []; _heldOrderId = null; }),
                child: const Text('Batal', style: TextStyle(fontSize: 12, color: Color(0xFF1D4ED8), fontWeight: FontWeight.w600)),
              ),
            ]),
          ),

        // Shift banner
        if (_shift == null && _online)
          GestureDetector(
            onTap: _showOpenShiftSheet,
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              color: const Color(0xFFFEF3C7),
              child: const Row(children: [
                Icon(Icons.warning_amber_rounded, size: 16, color: Color(0xFF92400E)),
                SizedBox(width: 8),
                Expanded(child: Text('Shift belum dibuka — tap untuk buka shift', style: TextStyle(fontSize: 13, color: Color(0xFF92400E), fontWeight: FontWeight.w500))),
                Icon(Icons.chevron_right_rounded, size: 18, color: Color(0xFF92400E)),
              ]),
            ),
          ),

        // Search
        Container(
          color: Colors.white,
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
          child: TextField(
            controller: _searchCtrl,
            onChanged: (v) => setState(() => _search = v),
            decoration: InputDecoration(
              hintText: 'Cari menu...', hintStyle: const TextStyle(color: AppTheme.textMuted, fontSize: 14),
              prefixIcon: const Icon(Icons.search_rounded, size: 18, color: AppTheme.textMuted),
              suffixIcon: _search.isNotEmpty
                ? GestureDetector(onTap: () { _searchCtrl.clear(); setState(() => _search = ''); }, child: const Icon(Icons.close_rounded, size: 16, color: AppTheme.textMuted))
                : null,
              filled: true, fillColor: const Color(0xFFF8FAFC),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppTheme.border)),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppTheme.border)),
              focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppTheme.primary, width: 1.5)),
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            ),
          ),
        ),

        // Category chips
        if (_categories.isNotEmpty)
          Container(
            color: Colors.white,
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
              child: Row(children: [
                _chip('Semua', _category.isEmpty, () => setState(() => _category = '')),
                ..._categories.map((c) => _chip(c, _category == c, () => setState(() => _category = _category == c ? '' : c))),
              ]),
            ),
          ),

        const Divider(height: 1, color: AppTheme.border),

        // Product grid — hanya tampil setelah shift dibuka (sama seperti web)
        Expanded(
          child: _shift == null && _online
            ? Center(
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.access_time_rounded, size: 56, color: Color(0xFFCBD5E1)),
                    const SizedBox(height: 16),
                    const Text('Buka Shift Dulu', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: Color(0xFF334155))),
                    const SizedBox(height: 8),
                    const Text('Kasir perlu membuka shift\nsebelum menerima pesanan', textAlign: TextAlign.center, style: TextStyle(fontSize: 14, color: Color(0xFF94A3B8))),
                    const SizedBox(height: 20),
                    ElevatedButton(
                      onPressed: _showOpenShiftSheet,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.primary,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      child: const Text('Buka Shift', style: TextStyle(fontWeight: FontWeight.w600)),
                    ),
                  ]),
                ),
              )
            : filtered.isEmpty
              ? EmptyState(
                  icon: Icons.restaurant_menu_rounded,
                  title: _menu.isEmpty ? 'Menu belum tersimpan' : 'Tidak ditemukan',
                  subtitle: _menu.isEmpty ? 'Buka saat online untuk muat menu' : 'Coba kata kunci lain',
                )
              : GridView.builder(
                  padding: const EdgeInsets.all(12),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2, crossAxisSpacing: 10, mainAxisSpacing: 10, childAspectRatio: 0.72),
                  itemCount: filtered.length,
                  itemBuilder: (_, i) {
                    final item = filtered[i];
                    final totalQty = _cart.where((c) => c.menuItem.id == item.id).fold(0, (s, c) => s + c.quantity);
                    final fakeCartItem = totalQty > 0 ? CartItem(menuItem: item, quantity: totalQty) : null;
                    return _ProductCard(item: item, cartItem: fakeCartItem, onTap: () => _addToCart(item));
                  },
                ),
        ),
      ]),

      // Bottom cart bar
      bottomNavigationBar: _cart.isEmpty ? null : SafeArea(
        child: GestureDetector(
          onTap: _openCart,
          child: Container(
            decoration: const BoxDecoration(
              color: Color(0xFF0F172A),
              boxShadow: [BoxShadow(color: Colors.black26, blurRadius: 12, offset: Offset(0, -2))],
            ),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            child: Row(children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(color: AppTheme.primary, borderRadius: BorderRadius.circular(10)),
                child: Text('$_itemCount', style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w800)),
              ),
              const SizedBox(width: 10),
              Expanded(child: Text(formatRp(_total), style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700))),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
                decoration: BoxDecoration(color: AppTheme.primary, borderRadius: BorderRadius.circular(12)),
                child: const Row(mainAxisSize: MainAxisSize.min, children: [
                  Text('Pesanan', style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w700)),
                  SizedBox(width: 4),
                  Icon(Icons.arrow_forward_rounded, color: Colors.white, size: 16),
                ]),
              ),
            ]),
          ),
        ),
      ),
    );
  }

  Widget _chip(String label, bool active, VoidCallback onTap) => GestureDetector(
    onTap: onTap,
    child: Container(
      margin: const EdgeInsets.only(right: 6),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      decoration: BoxDecoration(
        color: active ? const Color(0xFF0F172A) : const Color(0xFFF1F5F9),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: active ? Colors.white : AppTheme.textSecondary)),
    ),
  );
}

// ── Product Card ─────────────────────────────────────────────────────────────

class _ProductCard extends StatelessWidget {
  final MenuItem item;
  final CartItem? cartItem;
  final VoidCallback onTap;
  const _ProductCard({required this.item, this.cartItem, required this.onTap});

  // Category badge color — sama seperti web
  Color get _badgeColor {
    switch ((item.category ?? '').toLowerCase()) {
      case 'minuman': return const Color(0xFFDBEAFE);
      case 'paket':   return const Color(0xFFFEF3C7);
      case 'dessert': return const Color(0xFFF3E8FF);
      case 'snack':   return const Color(0xFFFEF9C3);
      default:        return const Color(0xFFF1F5F9);
    }
  }

  Color get _badgeTextColor {
    switch ((item.category ?? '').toLowerCase()) {
      case 'minuman': return const Color(0xFF1D4ED8);
      case 'paket':   return const Color(0xFF92400E);
      case 'dessert': return const Color(0xFF7C3AED);
      case 'snack':   return const Color(0xFF713F12);
      default:        return const Color(0xFF475569);
    }
  }

  bool get _isEmoji {
    final url = item.imageUrl ?? '';
    return url.isNotEmpty && !url.startsWith('http') && !url.startsWith('/');
  }

  bool get _isUrl {
    final url = item.imageUrl ?? '';
    return url.startsWith('http') || url.startsWith('/');
  }

  @override
  Widget build(BuildContext context) {
    final inCart = cartItem != null;
    final cat = item.category ?? '';

    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: inCart ? const Color(0xFFEFF6FF) : Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: inCart ? AppTheme.primary : AppTheme.border, width: inCart ? 2 : 1),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 6, offset: const Offset(0, 2))],
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          // ── Image area (sama seperti web)
          Stack(children: [
            ClipRRect(
              borderRadius: const BorderRadius.vertical(top: Radius.circular(13)),
              child: Container(
                width: double.infinity,
                height: 110,
                color: const Color(0xFFF8FAFC),
                child: _isUrl
                  ? Image.network(resolveApiUrl(item.imageUrl!), fit: BoxFit.cover, errorBuilder: (_, e, s) => _placeholder)
                  : _isEmoji
                    ? Center(child: Text(item.imageUrl!, style: const TextStyle(fontSize: 44)))
                    : _placeholder,
              ),
            ),
            if (inCart)
              Positioned(
                top: 8, right: 8,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(color: AppTheme.primary, borderRadius: BorderRadius.circular(10)),
                  child: Text('×${cartItem!.quantity}', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800)),
                ),
              ),
            // Badge peringatan — menu belum punya resep
            if (!item.hasRecipe)
              Positioned(
                top: 8, left: 8,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                  decoration: BoxDecoration(color: const Color(0xFFFEF3C7), borderRadius: BorderRadius.circular(6), border: Border.all(color: const Color(0xFFFCD34D))),
                  child: const Row(mainAxisSize: MainAxisSize.min, children: [
                    Icon(Icons.warning_amber_rounded, size: 10, color: Color(0xFF92400E)),
                    SizedBox(width: 3),
                    Text('No Resep', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: Color(0xFF92400E))),
                  ]),
                ),
              ),
          ]),

          // ── Info area
          Expanded(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(item.name, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF0F172A)), maxLines: 1, overflow: TextOverflow.ellipsis),
                  if (item.description != null && item.description!.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(item.description!, style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8)), maxLines: 1, overflow: TextOverflow.ellipsis),
                  ],
                ]),
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  if (cat.isNotEmpty)
                    Container(
                      margin: const EdgeInsets.only(bottom: 4),
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(color: _badgeColor, borderRadius: BorderRadius.circular(6)),
                      child: Text(cat, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: _badgeTextColor)),
                    ),
                  Text(formatRp(item.price), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFF2563EB))),
                ]),
              ]),
            ),
          ),
        ]),
      ),
    );
  }

  Widget get _placeholder => Center(
    child: Icon(Icons.restaurant_rounded, size: 36, color: Colors.grey.shade300),
  );
}

// ── Cart Sheet ───────────────────────────────────────────────────────────────

class _CartSheet extends StatefulWidget {
  final List<CartItem> cart;
  final double total;
  final bool isResumingHeld;
  final void Function(String, int) onQty;
  final void Function(String, String) onNote;
  final void Function(String, String, double) onDiscount;
  final VoidCallback onCheckout;
  final Future<void> Function()? onHold;
  const _CartSheet({required this.cart, required this.total, this.isResumingHeld = false, required this.onQty, required this.onNote, required this.onDiscount, required this.onCheckout, this.onHold});
  @override State<_CartSheet> createState() => _CartSheetState();
}

class _CartSheetState extends State<_CartSheet> {
  final Set<String> _noteOpen = {};
  final Set<String> _discountOpen = {};
  final Map<String, TextEditingController> _discCtrl = {};

  @override
  void dispose() {
    for (final c in _discCtrl.values) {
      c.dispose();
    }
    super.dispose();
  }

  TextEditingController _getDiscCtrl(CartItem c) {
    return _discCtrl.putIfAbsent(c.cartKey, () => TextEditingController(text: c.itemDiscountValue > 0 ? c.itemDiscountValue.toInt().toString() : ''));
  }

  @override
  Widget build(BuildContext context) {
    final total = widget.cart.fold(0.0, (s, c) => s + c.subtotal);
    return Container(
      decoration: const BoxDecoration(color: Colors.white, borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.88),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(margin: const EdgeInsets.symmetric(vertical: 10), width: 36, height: 4, decoration: BoxDecoration(color: AppTheme.border, borderRadius: BorderRadius.circular(2))),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 8, 12),
          child: Row(children: [
            const Text('Pesanan', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
            const Spacer(),
            TextButton(
              onPressed: () { widget.cart.clear(); setState(() {}); Navigator.pop(context); },
              child: const Text('Hapus Semua', style: TextStyle(color: AppTheme.danger, fontSize: 12)),
            ),
            IconButton(icon: const Icon(Icons.close_rounded, color: AppTheme.textMuted), onPressed: () => Navigator.pop(context)),
          ]),
        ),
        const Divider(height: 1, color: AppTheme.border),
        Flexible(
          child: ListView(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            children: widget.cart.map((c) {
              final showNote = _noteOpen.contains(c.cartKey);
              return Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: const Color(0xFFF8FAFC), borderRadius: BorderRadius.circular(12)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Text(c.menuItem.name, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textPrimary))),
                    Text(formatRp(c.subtotal), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.primary)),
                  ]),
                  if (c.modifiers.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(c.modifiers.map((m) => m.optionName).join(', '), style: const TextStyle(fontSize: 11, color: Color(0xFF3B82F6))),
                  ],
                  const SizedBox(height: 8),
                  Row(children: [
                    _QtyBtn(icon: c.quantity == 1 ? Icons.delete_rounded : Icons.remove_rounded, color: c.quantity == 1 ? AppTheme.danger : AppTheme.textSecondary, onTap: () { widget.onQty(c.cartKey, -1); setState(() {}); }),
                    Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: Text('${c.quantity}', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700))),
                    _QtyBtn(icon: Icons.add_rounded, color: AppTheme.primary, onTap: () { widget.onQty(c.cartKey, 1); setState(() {}); }),
                    const Spacer(),
                    // Diskon item button
                    GestureDetector(
                      onTap: () => setState(() {
                        if (_discountOpen.contains(c.cartKey)) { _discountOpen.remove(c.cartKey); } else { _discountOpen.add(c.cartKey); _noteOpen.remove(c.cartKey); }
                      }),
                      child: Container(
                        margin: const EdgeInsets.only(right: 6),
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: _discountOpen.contains(c.cartKey) || c.itemDiscountValue > 0 ? const Color(0xFFF0FDF4) : const Color(0xFFF1F5F9),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(mainAxisSize: MainAxisSize.min, children: [
                          Icon(Icons.discount_rounded, size: 13, color: _discountOpen.contains(c.cartKey) || c.itemDiscountValue > 0 ? AppTheme.success : AppTheme.textMuted),
                          const SizedBox(width: 4),
                          Text('Diskon', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: _discountOpen.contains(c.cartKey) || c.itemDiscountValue > 0 ? AppTheme.success : AppTheme.textMuted)),
                        ]),
                      ),
                    ),
                    // Catatan button
                    GestureDetector(
                      onTap: () => setState(() {
                        if (showNote) { _noteOpen.remove(c.cartKey); } else { _noteOpen.add(c.cartKey); _discountOpen.remove(c.cartKey); }
                      }),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: showNote || c.notes.isNotEmpty ? const Color(0xFFEFF6FF) : const Color(0xFFF1F5F9),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(mainAxisSize: MainAxisSize.min, children: [
                          Icon(Icons.sticky_note_2_rounded, size: 13, color: showNote || c.notes.isNotEmpty ? AppTheme.primary : AppTheme.textMuted),
                          const SizedBox(width: 4),
                          Text('Catatan', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: showNote || c.notes.isNotEmpty ? AppTheme.primary : AppTheme.textMuted)),
                        ]),
                      ),
                    ),
                  ]),
                  // Per-item discount input
                  if (_discountOpen.contains(c.cartKey)) ...[
                    const SizedBox(height: 8),
                    Row(children: [
                      // Type toggle
                      for (final dt in [('PERCENT', '%'), ('AMOUNT', 'Rp')])
                        GestureDetector(
                          onTap: () { widget.onDiscount(c.cartKey, dt.$1, c.itemDiscountValue); setState(() {}); },
                          child: Container(
                            margin: EdgeInsets.only(right: dt.$1 == 'PERCENT' ? 6 : 0),
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                            decoration: BoxDecoration(
                              color: c.itemDiscountType == dt.$1 ? AppTheme.success : const Color(0xFFF1F5F9),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(dt.$2, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: c.itemDiscountType == dt.$1 ? Colors.white : AppTheme.textSecondary)),
                          ),
                        ),
                      const SizedBox(width: 8),
                      Expanded(child: TextField(
                        controller: _getDiscCtrl(c),
                        keyboardType: TextInputType.number,
                        onChanged: (v) { widget.onDiscount(c.cartKey, c.itemDiscountType, double.tryParse(v) ?? 0); setState(() {}); },
                        style: const TextStyle(fontSize: 13),
                        decoration: InputDecoration(
                          hintText: c.itemDiscountType == 'PERCENT' ? 'Contoh: 10' : 'Contoh: 5000',
                          hintStyle: const TextStyle(color: AppTheme.textMuted, fontSize: 12),
                          filled: true, fillColor: Colors.white,
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: AppTheme.border)),
                          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: AppTheme.border)),
                          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: AppTheme.success)),
                          contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                        ),
                      )),
                      if (c.itemDiscountValue > 0) ...[
                        const SizedBox(width: 6),
                        GestureDetector(
                          onTap: () { widget.onDiscount(c.cartKey, 'PERCENT', 0); _getDiscCtrl(c).clear(); setState(() {}); },
                          child: const Icon(Icons.close_rounded, size: 16, color: AppTheme.danger),
                        ),
                      ],
                    ]),
                    if (c.itemDiscount > 0)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text('Diskon item: −${formatRp(c.itemDiscount)}', style: const TextStyle(fontSize: 11, color: AppTheme.success, fontWeight: FontWeight.w600)),
                      ),
                  ],
                  if (showNote) ...[
                    const SizedBox(height: 8),
                    TextField(
                      controller: TextEditingController(text: c.notes),
                      onChanged: (v) => widget.onNote(c.cartKey, v),
                      style: const TextStyle(fontSize: 13),
                      maxLines: 2,
                      decoration: InputDecoration(
                        hintText: 'Contoh: tanpa bawang, pedas...',
                        hintStyle: const TextStyle(color: AppTheme.textMuted, fontSize: 12),
                        filled: true, fillColor: Colors.white,
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: AppTheme.border)),
                        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: AppTheme.border)),
                        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: AppTheme.primary)),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                      ),
                    ),
                  ],
                ]),
              );
            }).toList(),
          ),
        ),
        Container(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          decoration: const BoxDecoration(border: Border(top: BorderSide(color: AppTheme.border))),
          child: Column(children: [
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              const Text('Total', style: TextStyle(fontSize: 14, color: AppTheme.textSecondary)),
              Text(formatRp(total), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppTheme.textPrimary)),
            ]),
            const SizedBox(height: 12),
            Row(children: [
              if (widget.onHold != null && !widget.isResumingHeld) ...[
                _HoldButton(onHold: widget.onHold!),
                const SizedBox(width: 10),
              ],
              Expanded(
                child: SizedBox(
                  height: 52,
                  child: ElevatedButton(
                    onPressed: widget.onCheckout,
                    style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary, foregroundColor: Colors.white, shape: const StadiumBorder(), elevation: 0),
                    child: Text(widget.isResumingHeld ? 'Bayar Order Ini' : 'Lanjut Pembayaran', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                  ),
                ),
              ),
            ]),
          ]),
        ),
        SizedBox(height: MediaQuery.of(context).padding.bottom),
      ]),
    );
  }
}

// ── Payment Sheet ─────────────────────────────────────────────────────────────

class _PaymentSheet extends StatefulWidget {
  final List<CartItem> cart;
  final double total;
  final POSShift? shift;
  final bool isOnline;
  final List<DiscountRule> discountRules;
  final Future<Map<String, dynamic>?> Function({
    required String paymentMethod, required double paymentAmount,
    required String orderType, String? tableNumber, String? customerName,
    String? discountType, double discountValue, String? discountLabel,
    String? platformOrderNumber,
  }) onConfirm;
  final void Function(
    Map<String, dynamic>? order, String payMethod, double finalTotal, double change,
    String? tableNumber, String? customerName,
  )? onSuccess;

  const _PaymentSheet({required this.cart, required this.total, required this.shift, required this.isOnline, this.discountRules = const [], required this.onConfirm, this.onSuccess});
  @override State<_PaymentSheet> createState() => _PaymentSheetState();
}

class _PaymentSheetState extends State<_PaymentSheet> {
  String _orderType = 'DINE_IN', _method = 'CASH';
  final _tableCtrl    = TextEditingController();
  final _customerCtrl = TextEditingController();
  String _cashStr = '';
  bool _loading = false;
  // Discount
  bool _showDiscount = false;
  String _discType = 'PERCENT';
  final _discCtrl             = TextEditingController();
  final _discLabelCtrl        = TextEditingController();
  final _platformOrderCtrl    = TextEditingController();

  bool get _isDeliveryPlatform => ['GOFOOD', 'GRABFOOD', 'SHOPEEFOOD'].contains(_method);

  @override
  void dispose() { _tableCtrl.dispose(); _customerCtrl.dispose(); _discCtrl.dispose(); _discLabelCtrl.dispose(); _platformOrderCtrl.dispose(); super.dispose(); }

  double get _discAmount {
    final v = double.tryParse(_discCtrl.text) ?? 0;
    if (_discType == 'PERCENT') return (widget.total * v / 100).roundToDouble();
    return v.clamp(0, widget.total);
  }
  double get _finalTotal => (widget.total - _discAmount).clamp(0, widget.total);
  List<DiscountRule> get _applicableRules => widget.discountRules.where((r) => widget.total >= r.minPurchase && (_discCtrl.text.isEmpty || _discCtrl.text == '0')).toList();
  double get _cash => double.tryParse(_cashStr) ?? 0;
  double get _change => _cash - _finalTotal;

  void _numpad(String k) {
    setState(() {
      if (k == '⌫') { if (_cashStr.isNotEmpty) { _cashStr = _cashStr.substring(0, _cashStr.length - 1); } }
      else if (k == '000') { _cashStr += '000'; }
      else { _cashStr += k; }
      // cap at 999_999_999
      if ((_cashStr.length) > 9) _cashStr = _cashStr.substring(0, 9);
    });
  }

  void _addDenom(int amount) => setState(() {
    final cur = int.tryParse(_cashStr) ?? 0;
    _cashStr = (cur + amount).toString();
  });

  Future<void> _confirm() async {
    if (_method == 'CASH' && _cash < _finalTotal) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Uang kurang ${formatRp(_finalTotal - _cash)}'),
        backgroundColor: AppTheme.danger,
      ));
      return;
    }
    setState(() => _loading = true);
    try {
      final discV = double.tryParse(_discCtrl.text) ?? 0;
      final tableNum = _tableCtrl.text.trim().isNotEmpty ? _tableCtrl.text.trim() : null;
      final custName = _customerCtrl.text.trim().isNotEmpty ? _customerCtrl.text.trim() : null;
      final order = await widget.onConfirm(
        paymentMethod: _method,
        paymentAmount: _isDeliveryPlatform || _method == 'QRIS' ? _finalTotal : _cash,
        orderType: _orderType,
        tableNumber: tableNum,
        customerName: custName,
        discountType: _showDiscount && discV > 0 ? _discType : null,
        discountValue: _showDiscount ? discV : 0,
        discountLabel: _discLabelCtrl.text.trim().isNotEmpty ? _discLabelCtrl.text.trim() : null,
        platformOrderNumber: _isDeliveryPlatform ? _platformOrderCtrl.text.trim() : null,
      );
      if (mounted) {
        Navigator.pop(context);
        widget.onSuccess?.call(order, _method, _finalTotal, _change.clamp(0, double.infinity), tableNum, custName);
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(_msg(e)), backgroundColor: AppTheme.danger));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(color: Colors.white, borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.92),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(margin: const EdgeInsets.symmetric(vertical: 10), width: 36, height: 4, decoration: BoxDecoration(color: AppTheme.border, borderRadius: BorderRadius.circular(2))),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 16, 12),
          child: Row(children: [
            const Text('Pembayaran', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
            const Spacer(),
            IconButton(icon: const Icon(Icons.close_rounded, color: AppTheme.textMuted), onPressed: () => Navigator.pop(context)),
          ]),
        ),
        const Divider(height: 1, color: AppTheme.border),

        Flexible(child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [

            // Order type
            const Text('Tipe Pesanan', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textPrimary)),
            const SizedBox(height: 8),
            Row(children: [
              for (final t in [('DINE_IN', 'Makan di Sini'), ('TAKEAWAY', 'Bawa Pulang'), ('DELIVERY', 'Delivery')])
                Expanded(child: GestureDetector(
                  onTap: () => setState(() => _orderType = t.$1),
                  child: Container(
                    margin: EdgeInsets.only(right: t.$1 != 'DELIVERY' ? 6 : 0),
                    padding: const EdgeInsets.symmetric(vertical: 9),
                    decoration: BoxDecoration(
                      color: _orderType == t.$1 ? const Color(0xFFEFF6FF) : const Color(0xFFF8FAFC),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: _orderType == t.$1 ? AppTheme.primary : AppTheme.border, width: _orderType == t.$1 ? 1.5 : 1),
                    ),
                    child: Text(t.$2, textAlign: TextAlign.center, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: _orderType == t.$1 ? AppTheme.primary : AppTheme.textSecondary)),
                  ),
                )),
            ]),
            if (_orderType == 'DINE_IN') ...[
              const SizedBox(height: 10),
              TextField(
                controller: _tableCtrl,
                decoration: _fldDec('Nomor meja (opsional)'),
                keyboardType: TextInputType.number,
                style: const TextStyle(fontSize: 14),
              ),
            ],
            const SizedBox(height: 10),
            TextField(
              controller: _customerCtrl,
              decoration: _fldDec('Nama pelanggan (opsional)'),
              style: const TextStyle(fontSize: 14),
            ),
            const SizedBox(height: 14),

            // Auto-discount suggestions
            if (_applicableRules.isNotEmpty) ...[
              Wrap(spacing: 6, runSpacing: 6, children: _applicableRules.map((rule) => GestureDetector(
                onTap: () => setState(() {
                  _showDiscount = true;
                  _discType = rule.type;
                  _discCtrl.text = rule.type == 'PERCENT' ? rule.value.toInt().toString() : rule.value.toInt().toString();
                  _discLabelCtrl.text = rule.name;
                }),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(color: const Color(0xFFF0FDF4), borderRadius: BorderRadius.circular(20), border: Border.all(color: const Color(0xFF86EFAC))),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    const Text('✦ ', style: TextStyle(fontSize: 10, color: AppTheme.success)),
                    Text('${rule.name} (${rule.type == 'PERCENT' ? '${rule.value.toInt()}%' : formatRp(rule.value)})', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppTheme.success)),
                  ]),
                ),
              )).toList()),
              const SizedBox(height: 10),
            ],

            // Discount toggle
            GestureDetector(
              onTap: () => setState(() => _showDiscount = !_showDiscount),
              child: Row(children: [
                const Text('Diskon Order', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textPrimary)),
                const Spacer(),
                Icon(_showDiscount ? Icons.keyboard_arrow_up_rounded : Icons.keyboard_arrow_down_rounded, color: AppTheme.textMuted),
              ]),
            ),
            if (_showDiscount) ...[
              const SizedBox(height: 8),
              Row(children: [
                for (final dt in [('PERCENT', '%'), ('AMOUNT', 'Rp')])
                  GestureDetector(
                    onTap: () => setState(() { _discType = dt.$1; _discCtrl.clear(); }),
                    child: Container(
                      margin: EdgeInsets.only(right: dt.$1 == 'PERCENT' ? 6 : 0),
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      decoration: BoxDecoration(
                        color: _discType == dt.$1 ? const Color(0xFF0F172A) : Colors.white,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: _discType == dt.$1 ? const Color(0xFF0F172A) : AppTheme.border),
                      ),
                      child: Text(dt.$2, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: _discType == dt.$1 ? Colors.white : AppTheme.textSecondary)),
                    ),
                  ),
                const SizedBox(width: 8),
                Expanded(child: TextField(
                  controller: _discCtrl,
                  keyboardType: TextInputType.number,
                  onChanged: (_) => setState(() {}),
                  style: const TextStyle(fontSize: 14),
                  decoration: _fldDec(_discType == 'PERCENT' ? 'Contoh: 10' : 'Contoh: 5000'),
                )),
              ]),
              // Percent presets
              if (_discType == 'PERCENT') ...[
                const SizedBox(height: 8),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(children: [
                    for (final pct in [5, 10, 20, 50])
                      GestureDetector(
                        onTap: () => setState(() => _discCtrl.text = pct.toString()),
                        child: Container(
                          margin: const EdgeInsets.only(right: 6),
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                          decoration: BoxDecoration(
                            color: _discCtrl.text == pct.toString() ? AppTheme.primary : const Color(0xFFEFF6FF),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text('$pct%', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: _discCtrl.text == pct.toString() ? Colors.white : AppTheme.primary)),
                        ),
                      ),
                    if (_discCtrl.text.isNotEmpty && _discCtrl.text != '0')
                      GestureDetector(
                        onTap: () => setState(() { _discCtrl.clear(); _discLabelCtrl.clear(); }),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                          decoration: BoxDecoration(color: const Color(0xFFFEF2F2), borderRadius: BorderRadius.circular(20)),
                          child: const Text('Hapus', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppTheme.danger)),
                        ),
                      ),
                  ]),
                ),
              ],
              if (_discAmount > 0) ...[
                const SizedBox(height: 6),
                Text('Diskon: −${formatRp(_discAmount)}', style: const TextStyle(fontSize: 12, color: AppTheme.success, fontWeight: FontWeight.w600)),
                const SizedBox(height: 6),
                TextField(
                  controller: _discLabelCtrl,
                  style: const TextStyle(fontSize: 13),
                  decoration: _fldDec('Alasan diskon (opsional, muncul di struk)'),
                ),
              ],
            ],
            const SizedBox(height: 14),

            // Summary
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: const Color(0xFFF8FAFC), borderRadius: BorderRadius.circular(12)),
              child: Column(children: [
                ...widget.cart.map((c) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 3),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Expanded(child: Text('${c.menuItem.name} ×${c.quantity}', style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary))),
                      Text(formatRp(c.subtotal), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: c.itemDiscount > 0 ? AppTheme.success : AppTheme.textPrimary)),
                    ]),
                    if (c.itemDiscount > 0)
                      Text('  diskon ${c.itemDiscountType == 'PERCENT' ? '${c.itemDiscountValue.toInt()}%' : formatRp(c.itemDiscount)}', style: const TextStyle(fontSize: 10, color: AppTheme.success)),
                  ]),
                )),
                const Divider(height: 12),
                if (_discAmount > 0) ...[
                  Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                    const Text('Subtotal', style: TextStyle(fontSize: 12, color: AppTheme.textMuted)),
                    Text(formatRp(widget.total), style: const TextStyle(fontSize: 12, color: AppTheme.textMuted)),
                  ]),
                  Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                    Text(_discLabelCtrl.text.trim().isNotEmpty ? 'Diskon (${_discLabelCtrl.text.trim()})' : 'Diskon', style: const TextStyle(fontSize: 12, color: AppTheme.success)),
                    Text('−${formatRp(_discAmount)}', style: const TextStyle(fontSize: 12, color: AppTheme.success, fontWeight: FontWeight.w600)),
                  ]),
                  const Divider(height: 8),
                ],
                Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                  const Text('Total', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                  Text(formatRp(_finalTotal), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppTheme.primary)),
                ]),
              ]),
            ),
            const SizedBox(height: 14),

            // Payment method
            const Text('Metode Pembayaran', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textPrimary)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8, runSpacing: 8,
              children: [
                for (final entry in const [
                  {'m': 'CASH',       'label': 'Tunai'},
                  {'m': 'QRIS',       'label': 'QRIS'},
                  {'m': 'GOFOOD',     'label': 'GoFood'},
                  {'m': 'GRABFOOD',   'label': 'GrabFood'},
                  {'m': 'SHOPEEFOOD', 'label': 'ShopeeFood'},
                ])
                  GestureDetector(
                    onTap: () => setState(() { _method = entry['m']!; _cashStr = ''; _platformOrderCtrl.clear(); }),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(
                        color: _method == entry['m'] ? const Color(0xFF0F172A) : Colors.white,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: _method == entry['m'] ? const Color(0xFF0F172A) : AppTheme.border),
                      ),
                      child: Text(entry['label']!, style: TextStyle(
                        fontSize: 13, fontWeight: FontWeight.w700,
                        color: _method == entry['m'] ? Colors.white : AppTheme.textSecondary,
                      )),
                    ),
                  ),
              ],
            ),

            // DELIVERY PLATFORM: order number input
            if (_isDeliveryPlatform) ...[
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: const Color(0xFFF0FDF4),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Container(
                      width: 32, height: 32, decoration: BoxDecoration(
                        color: _method == 'GOFOOD' ? const Color(0xFFEF4444)
                            : _method == 'GRABFOOD' ? const Color(0xFF16A34A)
                            : const Color(0xFFF97316),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Center(child: Text(
                        _method == 'GOFOOD' ? 'GF' : _method == 'GRABFOOD' ? 'GB' : 'SF',
                        style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Colors.white),
                      )),
                    ),
                    const SizedBox(width: 10),
                    Text(formatRp(_finalTotal), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppTheme.textPrimary)),
                  ]),
                  const SizedBox(height: 12),
                  const Text('No. Order Platform (opsional)', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppTheme.textSecondary)),
                  const SizedBox(height: 6),
                  TextField(
                    controller: _platformOrderCtrl,
                    decoration: InputDecoration(
                      hintText: _method == 'GOFOOD' ? 'Contoh: GF-12345678' : _method == 'GRABFOOD' ? 'Contoh: GB-ABCD1234' : 'Contoh: SF-87654321',
                      hintStyle: const TextStyle(color: AppTheme.textMuted, fontSize: 13),
                      filled: true, fillColor: Colors.white,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: AppTheme.border)),
                      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: AppTheme.border)),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Pembayaran di-settle oleh ${_method == 'GOFOOD' ? 'GoFood' : _method == 'GRABFOOD' ? 'GrabFood' : 'ShopeeFood'} ke rekening bisnis Anda',
                    style: const TextStyle(fontSize: 11, color: AppTheme.textMuted),
                  ),
                ]),
              ),
            ],

            // CASH: display + denoms + numpad
            if (_method == 'CASH') ...[
              const SizedBox(height: 14),
              // Cash display
              Container(
                width: double.infinity, padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                decoration: BoxDecoration(color: const Color(0xFFF8FAFC), borderRadius: BorderRadius.circular(12), border: Border.all(color: AppTheme.border)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                  const Text('Uang Diterima', style: TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                  Text(
                    _cashStr.isEmpty ? 'Rp 0' : 'Rp ${_fmt(int.parse(_cashStr))}',
                    style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: AppTheme.textPrimary),
                  ),
                  if (_cash >= _finalTotal && _cashStr.isNotEmpty) Text(
                    'Kembalian: ${formatRp(_change)}',
                    style: const TextStyle(fontSize: 13, color: AppTheme.success, fontWeight: FontWeight.w700),
                  ),
                ]),
              ),
              const SizedBox(height: 10),
              // Denominations
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(children: [
                  for (final d in [2000, 5000, 10000, 20000, 50000, 100000])
                    GestureDetector(
                      onTap: () => _addDenom(d),
                      child: Container(
                        margin: const EdgeInsets.only(right: 6),
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                        decoration: BoxDecoration(color: const Color(0xFFEFF6FF), borderRadius: BorderRadius.circular(8)),
                        child: Text('+${d >= 1000 ? '${d ~/ 1000}rb' : '$d'}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppTheme.primary)),
                      ),
                    ),
                  GestureDetector(
                    onTap: () => setState(() => _cashStr = _finalTotal.toInt().toString()),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                      decoration: BoxDecoration(color: const Color(0xFFF0FDF4), borderRadius: BorderRadius.circular(8)),
                      child: const Text('Pas', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppTheme.success)),
                    ),
                  ),
                ]),
              ),
              const SizedBox(height: 10),
              // Numpad
              GridView.count(
                crossAxisCount: 3, shrinkWrap: true, physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 6, crossAxisSpacing: 6, childAspectRatio: 2.2,
                children: ['1','2','3','4','5','6','7','8','9','000','0','⌫'].map((k) => GestureDetector(
                  onTap: () => _numpad(k),
                  child: Container(
                    decoration: BoxDecoration(
                      color: k == '⌫' ? const Color(0xFFFEF2F2) : const Color(0xFFF8FAFC),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: AppTheme.border),
                    ),
                    child: Center(child: Text(k, style: TextStyle(
                      fontSize: 18, fontWeight: FontWeight.w700,
                      color: k == '⌫' ? AppTheme.danger : AppTheme.textPrimary,
                    ))),
                  ),
                )).toList(),
              ),
            ],

            if (_method == 'QRIS') ...[
              const SizedBox(height: 12),
              Container(
                width: double.infinity, padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(color: const Color(0xFFF0FDF4), borderRadius: BorderRadius.circular(12)),
                child: Column(children: [
                  const Icon(Icons.qr_code_rounded, size: 40, color: AppTheme.success),
                  const SizedBox(height: 8),
                  Text(formatRp(_finalTotal), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppTheme.textPrimary)),
                  const SizedBox(height: 4),
                  const Text('Tunjukkan QR QRIS ke pelanggan', style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
                ]),
              ),
            ],

            if (!widget.isOnline) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: const Color(0xFFFEF3C7), borderRadius: BorderRadius.circular(10)),
                child: const Row(children: [
                  Icon(Icons.wifi_off_rounded, size: 16, color: Color(0xFF92400E)),
                  SizedBox(width: 8),
                  Expanded(child: Text('Offline — tersimpan lokal & sync otomatis saat online', style: TextStyle(fontSize: 12, color: Color(0xFF92400E)))),
                ]),
              ),
            ],

            const SizedBox(height: 16),
          ]),
        )),

        // Confirm button
        Padding(
          padding: EdgeInsets.fromLTRB(16, 8, 16, MediaQuery.of(context).padding.bottom + 16),
          child: SizedBox(
            width: double.infinity, height: 52,
            child: ElevatedButton(
              onPressed: _loading ? null : _confirm,
              style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary, foregroundColor: Colors.white, shape: const StadiumBorder(), elevation: 0, disabledBackgroundColor: const Color(0xFF93C5FD)),
              child: _loading
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                : Text(widget.isOnline ? 'Konfirmasi Pembayaran' : 'Simpan Offline', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            ),
          ),
        ),
      ]),
    );
  }

  InputDecoration _fldDec(String hint) => InputDecoration(
    hintText: hint, hintStyle: const TextStyle(color: AppTheme.textMuted, fontSize: 13),
    filled: true, fillColor: const Color(0xFFF9FAFB),
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.border)),
    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.border)),
    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.primary, width: 1.5)),
    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
  );

  String _fmt(int n) => n.toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => '.');
}

// ── Open Shift Sheet ──────────────────────────────────────────────────────────

class _OpenShiftSheet extends StatefulWidget {
  final Future<void> Function(double) onOpen;
  const _OpenShiftSheet({required this.onOpen});
  @override State<_OpenShiftSheet> createState() => _OpenShiftSheetState();
}

class _OpenShiftSheetState extends State<_OpenShiftSheet> {
  final _balCtrl = TextEditingController();
  bool _loading = false;

  @override
  void dispose() { _balCtrl.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: const BoxDecoration(color: Colors.white, borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(margin: const EdgeInsets.only(bottom: 20), width: 36, height: 4, alignment: Alignment.center, decoration: BoxDecoration(color: AppTheme.border, borderRadius: BorderRadius.circular(2))),
          const Text('Buka Shift', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          const Text('Masukkan modal awal kas (opsional)', style: TextStyle(fontSize: 13, color: AppTheme.textSecondary)),
          const SizedBox(height: 20),
          const Text('Modal Awal Kas', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textPrimary)),
          const SizedBox(height: 8),
          TextField(
            controller: _balCtrl,
            keyboardType: TextInputType.number,
            style: const TextStyle(fontSize: 16),
            decoration: InputDecoration(
              prefixText: 'Rp ', prefixStyle: const TextStyle(color: AppTheme.textMuted, fontSize: 16),
              hintText: '0',
              filled: true, fillColor: const Color(0xFFF9FAFB),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppTheme.border)),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppTheme.border)),
              focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppTheme.primary, width: 1.5)),
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            ),
          ),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity, height: 52,
            child: ElevatedButton(
              onPressed: _loading ? null : () async {
                setState(() => _loading = true);
                final messenger = ScaffoldMessenger.of(context);
                try {
                  final bal = double.tryParse(_balCtrl.text.replaceAll('.', '')) ?? 0;
                  await widget.onOpen(bal);
                } catch (e) {
                  if (mounted) { messenger.showSnackBar(SnackBar(content: Text(_msg(e)), backgroundColor: AppTheme.danger)); }
                } finally {
                  if (mounted) { setState(() => _loading = false); }
                }
              },
              style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary, foregroundColor: Colors.white, shape: const StadiumBorder(), elevation: 0),
              child: _loading
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                : const Text('Buka Shift Sekarang', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            ),
          ),
          SizedBox(height: MediaQuery.of(context).padding.bottom),
        ]),
      ),
    );
  }
}

// ── Shared Widgets ────────────────────────────────────────────────────────────

// ── Hold Button ───────────────────────────────────────────────────────────────

class _HoldButton extends StatefulWidget {
  final Future<void> Function() onHold;
  const _HoldButton({required this.onHold});
  @override State<_HoldButton> createState() => _HoldButtonState();
}

class _HoldButtonState extends State<_HoldButton> {
  bool _loading = false;
  @override
  Widget build(BuildContext context) => SizedBox(
    height: 52,
    child: OutlinedButton(
      onPressed: _loading ? null : () async {
        setState(() => _loading = true);
        await widget.onHold();
        if (mounted) setState(() => _loading = false);
      },
      style: OutlinedButton.styleFrom(
        side: const BorderSide(color: Color(0xFFD97706)),
        foregroundColor: const Color(0xFFD97706),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(100)),
        padding: const EdgeInsets.symmetric(horizontal: 16),
      ),
      child: _loading
        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFFD97706)))
        : const Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.pause_rounded, size: 18),
            SizedBox(width: 6),
            Text('Tahan', style: TextStyle(fontWeight: FontWeight.w600)),
          ]),
    ),
  );
}

// ── Held Orders Sheet ─────────────────────────────────────────────────────────

class _HeldOrdersSheet extends StatelessWidget {
  final List<Map<String, dynamic>> heldOrders;
  final void Function(Map<String, dynamic>) onResume;
  final Future<void> Function(String) onCancel;
  const _HeldOrdersSheet({required this.heldOrders, required this.onResume, required this.onCancel});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.75),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(margin: const EdgeInsets.symmetric(vertical: 10), width: 36, height: 4,
          decoration: BoxDecoration(color: AppTheme.border, borderRadius: BorderRadius.circular(2))),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 16, 14),
          child: Row(children: [
            const Icon(Icons.pause_rounded, size: 18, color: Color(0xFFD97706)),
            const SizedBox(width: 8),
            const Text('Order Ditahan', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
            const Spacer(),
            Text('${heldOrders.length} order', style: const TextStyle(fontSize: 12, color: AppTheme.textMuted)),
          ]),
        ),
        const Divider(height: 1, color: AppTheme.border),
        Flexible(
          child: heldOrders.isEmpty
            ? const Padding(
                padding: EdgeInsets.all(40),
                child: Center(child: Text('Tidak ada order ditahan', style: TextStyle(color: AppTheme.textMuted))),
              )
            : ListView.separated(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                itemCount: heldOrders.length,
                separatorBuilder: (_, i2) => const SizedBox(height: 10),
                itemBuilder: (ctx, i) {
                  final held = heldOrders[i];
                  final items = held['items'] as List? ?? [];
                  final total = (num.tryParse(held['total']?.toString() ?? '0') ?? 0).toDouble();
                  final label = held['customerName'] as String?
                    ?? (held['tableNumber'] != null ? 'Meja ${held['tableNumber']}' : 'Tanpa Nama');
                  final createdAt = held['createdAt'] as String?;
                  final time = createdAt != null
                    ? () {
                        try {
                          final dt = DateTime.parse(createdAt).toLocal();
                          return '${dt.hour.toString().padLeft(2,'0')}:${dt.minute.toString().padLeft(2,'0')}';
                        } catch (_) { return ''; }
                      }()
                    : '';

                  return Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFFFBEB),
                      border: Border.all(color: const Color(0xFFFDE68A)),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Expanded(child: Text(label, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14))),
                        Text(formatRp(total), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: AppTheme.textPrimary)),
                      ]),
                      const SizedBox(height: 4),
                      Text(
                        'Ditahan pukul $time · ${items.length} item',
                        style: const TextStyle(fontSize: 12, color: AppTheme.textMuted),
                      ),
                      if (items.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          items.take(3).map((i) => '${(i as Map)['qty']}× ${i['name']}').join(', ')
                            + (items.length > 3 ? '...' : ''),
                          style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                          maxLines: 1, overflow: TextOverflow.ellipsis,
                        ),
                      ],
                      const SizedBox(height: 12),
                      Row(children: [
                        OutlinedButton.icon(
                          onPressed: () async {
                            await onCancel(held['id'] as String);
                            if (ctx.mounted) Navigator.pop(ctx);
                          },
                          icon: const Icon(Icons.delete_outline_rounded, size: 15),
                          label: const Text('Batalkan'),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: AppTheme.danger,
                            side: const BorderSide(color: Color(0xFFFCA5A5)),
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                            textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                          ),
                        ),
                        const Spacer(),
                        ElevatedButton.icon(
                          onPressed: () => onResume(held),
                          icon: const Icon(Icons.play_arrow_rounded, size: 16),
                          label: const Text('Lanjutkan'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppTheme.primary,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                            textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                            elevation: 0,
                          ),
                        ),
                      ]),
                    ]),
                  );
                },
              ),
        ),
        SizedBox(height: MediaQuery.of(context).padding.bottom + 12),
      ]),
    );
  }
}

// ── Modifier Sheet ────────────────────────────────────────────────────────────

class _ModifierSheet extends StatefulWidget {
  final MenuItem item;
  final void Function(List<SelectedModifier>) onConfirm;
  const _ModifierSheet({required this.item, required this.onConfirm});

  @override
  State<_ModifierSheet> createState() => _ModifierSheetState();
}

class _ModifierSheetState extends State<_ModifierSheet> {
  final Map<String, List<SelectedModifier>> _selected = {};

  void _toggle(ModifierGroup group, ModifierOption option) {
    setState(() {
      final current = _selected[group.id] ?? [];
      final alreadyIdx = current.indexWhere((s) => s.optionId == option.id);

      if (alreadyIdx >= 0) {
        _selected[group.id] = List.from(current)..removeAt(alreadyIdx);
        return;
      }

      final newSel = SelectedModifier(
        groupId: group.id, groupName: group.name,
        optionId: option.id, optionName: option.name,
        price: option.price,
      );

      if (group.maxSelect == 1) {
        _selected[group.id] = [newSel];
      } else if (current.length >= group.maxSelect) {
        _selected[group.id] = [...current.skip(1), newSel];
      } else {
        _selected[group.id] = [...current, newSel];
      }
    });
  }

  bool get _canConfirm => widget.item.modifierGroups.every(
    (g) => !g.isRequired || (_selected[g.id]?.isNotEmpty ?? false),
  );

  double get _extraPrice => _selected.values.expand((v) => v).fold(0, (s, m) => s + m.price);

  @override
  Widget build(BuildContext context) {
    final base = widget.item.price;
    return Container(
      decoration: const BoxDecoration(color: Colors.white, borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          margin: const EdgeInsets.only(top: 10, bottom: 4),
          width: 36, height: 4,
          decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(2)),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(children: [
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(widget.item.name, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Color(0xFF1E293B))),
              const Text('Pilih variasi', style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8))),
            ])),
            IconButton(
              onPressed: () => Navigator.pop(context),
              icon: const Icon(Icons.close, size: 20, color: Color(0xFF94A3B8)),
              padding: EdgeInsets.zero, constraints: const BoxConstraints(),
            ),
          ]),
        ),
        const Divider(height: 1),
        ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.5),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: widget.item.modifierGroups.map((group) {
                final selections = _selected[group.id] ?? [];
                return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(children: [
                      Text(group.name, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Color(0xFF1E293B))),
                      const SizedBox(width: 6),
                      Text(
                        group.isRequired ? 'Wajib' : 'Opsional',
                        style: TextStyle(fontSize: 11, color: group.isRequired ? Colors.red.shade400 : const Color(0xFF94A3B8)),
                      ),
                    ]),
                  ),
                  ...group.options.map((opt) {
                    final isSelected = selections.any((s) => s.optionId == opt.id);
                    return GestureDetector(
                      onTap: () => _toggle(group, opt),
                      child: Container(
                        margin: const EdgeInsets.only(bottom: 8),
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        decoration: BoxDecoration(
                          color: isSelected ? const Color(0xFFEFF6FF) : Colors.white,
                          border: Border.all(color: isSelected ? const Color(0xFF3B82F6) : const Color(0xFFE2E8F0)),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Row(children: [
                          Container(
                            width: 16, height: 16,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border: Border.all(color: isSelected ? const Color(0xFF3B82F6) : const Color(0xFFCBD5E1), width: 2),
                              color: isSelected ? const Color(0xFF3B82F6) : Colors.transparent,
                            ),
                            child: isSelected ? const Center(child: Icon(Icons.circle, size: 6, color: Colors.white)) : null,
                          ),
                          const SizedBox(width: 10),
                          Expanded(child: Text(opt.name, style: const TextStyle(fontSize: 13, color: Color(0xFF1E293B)))),
                          if (opt.price > 0)
                            Text('+Rp ${opt.price.toStringAsFixed(0).replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+$)'), (m) => '${m[1]}.')}',
                              style: const TextStyle(fontSize: 12, color: Color(0xFF3B82F6), fontWeight: FontWeight.w500)),
                        ]),
                      ),
                    );
                  }),
                  const SizedBox(height: 8),
                ]);
              }).toList(),
            ),
          ),
        ),
        Padding(
          padding: EdgeInsets.fromLTRB(16, 8, 16, MediaQuery.of(context).viewInsets.bottom + 16),
          child: SizedBox(
            width: double.infinity,
            height: 48,
            child: ElevatedButton(
              onPressed: _canConfirm ? () => widget.onConfirm(_selected.values.expand((v) => v).toList()) : null,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF3B82F6),
                disabledBackgroundColor: const Color(0xFFCBD5E1),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                elevation: 0,
              ),
              child: Text(
                'Tambah — Rp ${(base + _extraPrice).toStringAsFixed(0).replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+$)'), (m) => "${m[1]}.")}',
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15),
              ),
            ),
          ),
        ),
      ]),
    );
  }
}

// ── Qty Button ────────────────────────────────────────────────────────────────

class _QtyBtn extends StatelessWidget {
  final IconData icon;
  final Color color;
  final VoidCallback onTap;
  const _QtyBtn({required this.icon, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      width: 30, height: 30,
      decoration: BoxDecoration(color: const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(8)),
      child: Icon(icon, size: 15, color: color),
    ),
  );
}

// ── Receipt Sheet ────────────────────────────────────────────────────────────

class _ReceiptSheet extends StatelessWidget {
  final String businessName;
  final String locationName;
  final String? locationAddress;
  final String cashierName;
  final String? orderNumber;
  final String? paidAt;
  final String? tableNumber;
  final String? customerName;
  final List<CartItem> cartItems;
  final double discountAmount;
  final double taxAmount;
  final double total;
  final bool isOffline;

  const _ReceiptSheet({
    required this.businessName,
    required this.locationName,
    this.locationAddress,
    required this.cashierName,
    this.orderNumber,
    this.paidAt,
    this.tableNumber,
    this.customerName,
    required this.cartItems,
    required this.discountAmount,
    required this.taxAmount,
    required this.total,
    required this.isOffline,
  });

  String _fmtRp(double v) => formatRp(v);

  String _fmtDate(String? iso) {
    if (iso == null) return '';
    try {
      final dt = DateTime.parse(iso).toLocal();
      final d = '${dt.day.toString().padLeft(2, '0')}/'
                '${dt.month.toString().padLeft(2, '0')}/'
                '${dt.year}';
      final t = '${dt.hour.toString().padLeft(2, '0')}:'
                '${dt.minute.toString().padLeft(2, '0')}';
      return '$d $t';
    } catch (_) { return iso; }
  }

  String _shareText() {
    final subtotal = cartItems.fold(0.0, (s, i) => s + i.subtotal);
    final lines = [
      '*${businessName.toUpperCase()}*',
      locationName,
      ?locationAddress,
      '',
      if (orderNumber != null) 'No. Struk: $orderNumber',
      _fmtDate(paidAt),
      'Kasir: $cashierName',
      if (tableNumber != null) 'Meja: $tableNumber',
      if (customerName != null) 'Pelanggan: $customerName',
      '--------------------------------',
      ...cartItems.map((i) => '${i.quantity}x ${i.menuItem.name}  ${_fmtRp(i.subtotal)}'),
      '--------------------------------',
      if (discountAmount > 0 || taxAmount > 0) 'Subtotal         ${_fmtRp(subtotal)}',
      if (discountAmount > 0) 'Diskon          -${_fmtRp(discountAmount)}',
      if (taxAmount > 0) 'Pajak            ${_fmtRp(taxAmount)}',
      '*TOTAL           ${_fmtRp(total)}*',
      '--------------------------------',
      'Terima kasih!',
      if (isOffline) '(Offline — belum tersinkron)',
    ];
    return lines.join('\n');
  }

  @override
  Widget build(BuildContext context) {
    final subtotal = cartItems.fold(0.0, (s, i) => s + i.subtotal);

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.88),
      child: Column(mainAxisSize: MainAxisSize.min, children: [

        // Handle
        Container(margin: const EdgeInsets.symmetric(vertical: 10), width: 36, height: 4,
          decoration: BoxDecoration(color: AppTheme.border, borderRadius: BorderRadius.circular(2))),

        // Struk area
        Flexible(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 0, 24, 16),
            child: Column(children: [

              // Header
              Text(businessName.toUpperCase(),
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, letterSpacing: 1.2, fontFamily: 'monospace')),
              const SizedBox(height: 2),
              Text(locationName,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
              if (locationAddress != null) ...[
                const SizedBox(height: 2),
                Text(locationAddress!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
              ],
              if (isOffline) ...[
                const SizedBox(height: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: const Color(0xFFFEF3C7), borderRadius: BorderRadius.circular(6)),
                  child: const Text('Tersimpan Offline', style: TextStyle(fontSize: 11, color: Color(0xFF92400E), fontWeight: FontWeight.w600)),
                ),
              ],

              const _Divider(),

              // Meta
              if (orderNumber != null)
                Text(orderNumber!, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, fontFamily: 'monospace')),
              const SizedBox(height: 2),
              Text(_fmtDate(paidAt), style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary, fontFamily: 'monospace')),
              const SizedBox(height: 2),
              Text('Kasir: $cashierName', style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
              if (tableNumber != null) Text('Meja: $tableNumber', style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
              if (customerName != null) Text('Pelanggan: $customerName', style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary)),

              const _Divider(),

              // Items
              ...cartItems.map((item) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Text(item.menuItem.name,
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600))),
                    Text(_fmtRp(item.subtotal),
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                  ]),
                  Text('${item.quantity} × ${_fmtRp(item.menuItem.price)}',
                    style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                ]),
              )),

              const _Divider(),

              // Totals
              if (discountAmount > 0 || taxAmount > 0) ...[
                _TotalRow(label: 'Subtotal', value: _fmtRp(subtotal), bold: false),
              ],
              if (discountAmount > 0)
                _TotalRow(label: 'Diskon', value: '-${_fmtRp(discountAmount)}', bold: false, color: const Color(0xFF059669)),
              if (taxAmount > 0)
                _TotalRow(label: 'Pajak', value: _fmtRp(taxAmount), bold: false),
              const SizedBox(height: 2),
              _TotalRow(label: 'TOTAL', value: _fmtRp(total), bold: true, large: true),

              const _Divider(),

              // Footer
              const Text('Terima kasih!',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textSecondary)),
              const SizedBox(height: 4),
            ]),
          ),
        ),

        // Buttons
        Padding(
          padding: EdgeInsets.fromLTRB(16, 0, 16, MediaQuery.of(context).padding.bottom + 12),
          child: Column(children: [
            const Divider(height: 1),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => Share.share(_shareText()),
                  icon: const Icon(Icons.share_rounded, size: 16),
                  label: const Text('Bagikan'),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    side: const BorderSide(color: AppTheme.border),
                    foregroundColor: AppTheme.textPrimary,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
            ]),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () => Navigator.of(context).pop(),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.textPrimary,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  elevation: 0,
                ),
                child: const Text('Pesanan Baru', style: TextStyle(fontWeight: FontWeight.w600)),
              ),
            ),
          ]),
        ),
      ]),
    );
  }
}

class _Divider extends StatelessWidget {
  const _Divider();
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 10),
    child: Row(children: List.generate(32, (i) => Expanded(
      child: Container(height: 1, color: i % 2 == 0 ? AppTheme.border : Colors.transparent),
    ))),
  );
}

class _TotalRow extends StatelessWidget {
  final String label, value;
  final bool bold, large;
  final Color? color;
  const _TotalRow({required this.label, required this.value, required this.bold, this.large = false, this.color});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 1),
    child: Row(children: [
      Expanded(child: Text(label, style: TextStyle(
        fontSize: large ? 14 : 12,
        fontWeight: bold ? FontWeight.w800 : FontWeight.w400,
        color: color ?? (bold ? AppTheme.textPrimary : AppTheme.textSecondary),
        fontFamily: 'monospace',
      ))),
      Text(value, style: TextStyle(
        fontSize: large ? 14 : 12,
        fontWeight: bold ? FontWeight.w800 : FontWeight.w500,
        color: color ?? (bold ? AppTheme.textPrimary : AppTheme.textSecondary),
        fontFamily: 'monospace',
      )),
    ]),
  );
}
