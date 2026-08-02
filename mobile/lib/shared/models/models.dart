num _n(dynamic v) => v is num ? v : num.parse(v.toString());
double _d(dynamic v) => _n(v).toDouble();
bool _b(dynamic v, {bool fallback = false}) {
  if (v == null) return fallback;
  if (v is bool) return v;
  return v.toString().toLowerCase() == 'true';
}

class AuthUser {
  final String id, name, email, role, organizationId, businessName, orgStatus, plan;
  final List<String> locationIds;

  AuthUser({
    required this.id, required this.name, required this.email,
    required this.role, required this.organizationId, required this.businessName,
    required this.orgStatus, required this.locationIds, required this.plan,
  });

  factory AuthUser.fromJson(Map<String, dynamic> j) => AuthUser(
    id: j['id'] ?? '', name: j['name'] ?? '', email: j['email'] ?? '',
    role: j['role'] ?? '', organizationId: j['organizationId'] ?? '',
    businessName: j['businessName'] ?? '', orgStatus: j['orgStatus'] ?? '',
    locationIds: List<String>.from(j['locationIds'] ?? []),
    plan: j['orgPlan'] ?? '',
  );

  bool get isOwner => role == 'OWNER';
  bool get isKasir => role == 'KASIR';
  bool get isAdminGudang => role == 'ADMIN_GUDANG';
  bool get isSupervisor => role == 'SUPERVISOR';
  bool get isKasirPlan => plan == 'STARTER' || plan == 'FREE' || plan.isEmpty;
}

class ModifierOption {
  final String id, name;
  final double price;
  ModifierOption({required this.id, required this.name, required this.price});
  factory ModifierOption.fromJson(Map<String, dynamic> j) =>
    ModifierOption(id: j['id'], name: j['name'], price: _d(j['price'] ?? 0));
}

class ModifierGroup {
  final String id, name;
  final bool isRequired;
  final int maxSelect;
  final List<ModifierOption> options;
  ModifierGroup({required this.id, required this.name, required this.isRequired, required this.maxSelect, required this.options});
  factory ModifierGroup.fromJson(Map<String, dynamic> j) => ModifierGroup(
    id: j['id'], name: j['name'],
    isRequired: _b(j['isRequired']),
    maxSelect: (j['maxSelect'] as num?)?.toInt() ?? 1,
    options: (j['options'] as List? ?? []).map((o) => ModifierOption.fromJson(Map<String, dynamic>.from(o as Map))).toList(),
  );
}

class SelectedModifier {
  final String groupId, groupName, optionId, optionName;
  final double price;
  SelectedModifier({required this.groupId, required this.groupName, required this.optionId, required this.optionName, required this.price});
  Map<String, dynamic> toJson() => {'groupName': groupName, 'optionName': optionName, 'price': price};
}

class MenuItem {
  final String id, name;
  final double price;
  final String? category, imageUrl, description;
  final bool isAvailable, hasRecipe;
  final List<ModifierGroup> modifierGroups;

  MenuItem({required this.id, required this.name, required this.price, this.category, this.imageUrl, this.description, required this.isAvailable, required this.hasRecipe, this.modifierGroups = const []});

  factory MenuItem.fromJson(Map<String, dynamic> j) => MenuItem(
    id: j['id'], name: j['name'],
    price: _d(j['sellPrice'] ?? j['price'] ?? 0),
    category: j['category'], imageUrl: j['imageUrl'],
    description: j['description'],
    isAvailable: _b(j['isActive'] ?? j['isAvailable'], fallback: true),
    hasRecipe: ((j['recipeItems'] as List?)?.isNotEmpty ?? false),
    modifierGroups: (j['modifierGroups'] as List? ?? []).map((pmg) {
      final g = (pmg as Map)['group'] as Map?;
      if (g == null) return null;
      return ModifierGroup.fromJson(Map<String, dynamic>.from(g));
    }).whereType<ModifierGroup>().toList(),
  );

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'sellPrice': price, 'price': price, 'category': category, 'imageUrl': imageUrl, 'description': description, 'isActive': isAvailable, 'isAvailable': isAvailable};
}

class DiscountRule {
  final String id, name, type;
  final double value, minPurchase;
  final bool isActive;
  DiscountRule({required this.id, required this.name, required this.type, required this.value, required this.minPurchase, required this.isActive});
  factory DiscountRule.fromJson(Map<String, dynamic> j) => DiscountRule(
    id: j['id'], name: j['name'], type: j['type'],
    value: _d(j['value'] ?? 0), minPurchase: _d(j['minPurchase'] ?? 0),
    isActive: _b(j['isActive'], fallback: true),
  );
}

class CartItem {
  final MenuItem menuItem;
  final List<SelectedModifier> modifiers;
  final String cartKey;
  int quantity;
  String notes;
  String itemDiscountType;
  double itemDiscountValue;

  CartItem({required this.menuItem, this.modifiers = const [], this.quantity = 1, this.notes = '', String? cartKey, this.itemDiscountType = 'PERCENT', this.itemDiscountValue = 0})
    : cartKey = cartKey ?? '${menuItem.id}::${modifiers.map((m) => m.optionId).join("|")}';

  double get modifierPrice => modifiers.fold(0, (s, m) => s + m.price);
  double get effectivePrice => menuItem.price + modifierPrice;
  double get itemDiscount => itemDiscountType == 'PERCENT'
      ? (effectivePrice * quantity * itemDiscountValue / 100).roundToDouble()
      : itemDiscountValue;
  double get subtotal => effectivePrice * quantity - itemDiscount;
}

class POSShift {
  final String id, status, openedAt, shiftNumber, cashierName;
  final String? closedAt, notes;
  final String locationId, locationName;
  final double openingBalance, totalSales;
  final int totalOrders;
  final double? closingBalance, expectedCash;

  POSShift({
    required this.id, required this.status, required this.openedAt,
    required this.shiftNumber, required this.cashierName,
    this.closedAt, this.notes,
    required this.locationId, required this.locationName,
    required this.openingBalance, required this.totalSales,
    required this.totalOrders, this.closingBalance, this.expectedCash,
  });

  factory POSShift.fromJson(Map<String, dynamic> j) {
    final cashier = j['cashier'] as Map?;
    return POSShift(
      id: j['id'], status: j['status'],
      openedAt: j['openedAt'], closedAt: j['closedAt'],
      locationId: j['location']['id'], locationName: j['location']['name'],
      openingBalance: _d(j['openingBalance'] ?? 0),
      shiftNumber: j['shiftNumber'] ?? '',
      cashierName: cashier?['name'] ?? cashier?['email'] ?? '',
      totalSales: _d(j['totalSales'] ?? 0),
      totalOrders: j['totalOrders'] is int ? j['totalOrders'] as int : int.tryParse(j['totalOrders']?.toString() ?? '') ?? 0,
      closingBalance: j['closingBalance'] != null ? _d(j['closingBalance']) : null,
      expectedCash: j['expectedCash'] != null ? _d(j['expectedCash']) : null,
      notes: j['notes'],
    );
  }
}

class POSOrder {
  final String id, orderNumber, orderType, status, createdAt;
  final String? tableNumber, customerName, cashierName;
  final double subtotal, discountAmount, total;
  final List<Map<String, dynamic>> items, payments;

  POSOrder({
    required this.id, required this.orderNumber, required this.orderType,
    required this.status, required this.createdAt,
    this.tableNumber, this.customerName, this.cashierName,
    required this.subtotal, required this.discountAmount, required this.total,
    required this.items, required this.payments,
  });

  factory POSOrder.fromJson(Map<String, dynamic> j) => POSOrder(
    id: j['id'], orderNumber: j['orderNumber'] ?? '',
    orderType: j['orderType'] ?? 'DINE_IN', status: j['status'] ?? '',
    createdAt: j['createdAt'] ?? '',
    tableNumber: j['tableNumber'], customerName: j['customerName'],
    cashierName: (j['cashier'] as Map?)?['name'],
    subtotal: _d(j['subtotal'] ?? 0),
    discountAmount: _d(j['discountAmount'] ?? 0),
    total: _d(j['total'] ?? 0),
    items: List<Map<String, dynamic>>.from(j['items'] ?? []),
    payments: List<Map<String, dynamic>>.from(j['payments'] ?? []),
  );
}

class InventoryItem {
  final String id, name, unit;
  final double? minStock;
  final String? category, sku;

  InventoryItem({required this.id, required this.name, required this.unit, this.minStock, this.category, this.sku});

  factory InventoryItem.fromJson(Map<String, dynamic> j) => InventoryItem(
    id: j['id'], name: j['name'], unit: j['unit'],
    minStock: j['minStock'] != null ? _d(j['minStock']) : null,
    category: j['category'], sku: j['sku'],
  );
}

class Transfer {
  final String id, status, createdAt;
  final String fromLocationId, fromLocationName, toLocationId, toLocationName;
  final List<Map<String, dynamic>> items;

  Transfer({required this.id, required this.status, required this.createdAt, required this.fromLocationId, required this.fromLocationName, required this.toLocationId, required this.toLocationName, required this.items});

  factory Transfer.fromJson(Map<String, dynamic> j) => Transfer(
    id: j['id'], status: j['status'], createdAt: j['createdAt'],
    fromLocationId: j['fromLocation']['id'], fromLocationName: j['fromLocation']['name'],
    toLocationId: j['toLocation']['id'], toLocationName: j['toLocation']['name'],
    items: List<Map<String, dynamic>>.from(j['items'] ?? []),
  );
}

class PantauAlert {
  final String id, type, severity, title, message, status, createdAt;
  final String? referenceId;

  PantauAlert({required this.id, required this.type, required this.severity, required this.title, required this.message, required this.status, required this.createdAt, this.referenceId});

  factory PantauAlert.fromJson(Map<String, dynamic> j) => PantauAlert(
    id: j['id'], type: j['type'], severity: j['severity'],
    title: j['title'], message: j['message'], status: j['status'],
    createdAt: j['createdAt'], referenceId: j['referenceId'],
  );
}

class OrgUser {
  final String id, name, email, role;
  final bool isActive;
  final List<Map<String, dynamic>> locations;

  OrgUser({required this.id, required this.name, required this.email, required this.role, required this.isActive, required this.locations});

  factory OrgUser.fromJson(Map<String, dynamic> j) => OrgUser(
    id: j['id'], name: j['name'] ?? '', email: j['email'],
    role: j['role'], isActive: _b(j['isActive'], fallback: true),
    locations: List<Map<String, dynamic>>.from(j['locations'] ?? []),
  );
}

class Location {
  final String id, name;
  final String? address, phone;
  final bool isActive;

  Location({required this.id, required this.name, this.address, this.phone, required this.isActive});

  factory Location.fromJson(Map<String, dynamic> j) => Location(
    id: j['id'], name: j['name'], address: j['address'],
    phone: j['phone'], isActive: _b(j['isActive'], fallback: true),
  );
}

class GoodsReceipt {
  final String id, createdAt;
  final String? supplier, receiptNumber, notes;
  final String locationName;
  final List<Map<String, dynamic>> items;

  GoodsReceipt({required this.id, required this.createdAt, this.supplier, this.receiptNumber, this.notes, required this.locationName, required this.items});

  factory GoodsReceipt.fromJson(Map<String, dynamic> j) => GoodsReceipt(
    id: j['id'], createdAt: j['createdAt'], supplier: j['supplier'],
    receiptNumber: j['receiptNumber'], notes: j['notes'],
    locationName: j['location']?['name'] ?? '',
    items: List<Map<String, dynamic>>.from(j['items'] ?? []),
  );
}

class OpnameSession {
  final String id, status, createdAt;
  final String locationName;
  final int itemCount;

  OpnameSession({required this.id, required this.status, required this.createdAt, required this.locationName, required this.itemCount});

  factory OpnameSession.fromJson(Map<String, dynamic> j) => OpnameSession(
    id: j['id'], status: j['status'], createdAt: j['createdAt'],
    locationName: j['location']?['name'] ?? '',
    itemCount: j['_count']?['items'] ?? 0,
  );
}
