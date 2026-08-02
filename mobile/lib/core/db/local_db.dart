import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';
import 'dart:convert';

class LocalDB {
  static Database? _db;

  static Future<Database> get db async {
    _db ??= await _open();
    return _db!;
  }

  static Future<Database> _open() async {
    final path = join(await getDatabasesPath(), 'pantau.db');
    return openDatabase(path, version: 1, onCreate: (db, _) async {
      await db.execute('''
        CREATE TABLE menu_items (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, price REAL NOT NULL,
          category TEXT, image_url TEXT, is_available INTEGER DEFAULT 1,
          synced_at TEXT
        )
      ''');
      await db.execute('''
        CREATE TABLE pending_orders (
          id TEXT PRIMARY KEY, shift_id TEXT NOT NULL, location_id TEXT NOT NULL,
          items_json TEXT NOT NULL, total_amount REAL NOT NULL,
          payment_method TEXT NOT NULL, payment_amount REAL NOT NULL,
          notes TEXT, created_at TEXT NOT NULL, synced INTEGER DEFAULT 0
        )
      ''');
    });
  }

  // ── Menu cache ──
  static Future<void> cacheMenuItems(List<Map<String, dynamic>> items) async {
    final d = await db;
    final batch = d.batch();
    final now = DateTime.now().toIso8601String();
    for (final item in items) {
      final price = item['sellPrice'] ?? item['price'] ?? 0;
      batch.insert('menu_items', {
        'id': item['id'], 'name': item['name'], 'price': price,
        'category': item['category'], 'image_url': item['imageUrl'],
        'is_available': (item['isAvailable'] == true || item['isActive'] == true) ? 1 : 0, 'synced_at': now,
      }, conflictAlgorithm: ConflictAlgorithm.replace);
    }
    await batch.commit(noResult: true);
  }

  static Future<List<Map<String, dynamic>>> getCachedMenu() async {
    final d = await db;
    final rows = await d.query('menu_items', where: 'is_available = 1', orderBy: 'category, name');
    return rows.map((r) => {
      'id': r['id'], 'name': r['name'], 'price': r['price'],
      'category': r['category'], 'imageUrl': r['image_url'], 'isAvailable': r['is_available'] == 1,
    }).toList();
  }

  // ── Offline order queue ──
  static Future<void> savePendingOrder({
    required String id, required String shiftId, required String locationId,
    required List<Map<String, dynamic>> items, required double totalAmount,
    required String paymentMethod, required double paymentAmount, String? notes,
  }) async {
    final d = await db;
    await d.insert('pending_orders', {
      'id': id, 'shift_id': shiftId, 'location_id': locationId,
      'items_json': jsonEncode(items), 'total_amount': totalAmount,
      'payment_method': paymentMethod, 'payment_amount': paymentAmount,
      'notes': notes, 'created_at': DateTime.now().toIso8601String(), 'synced': 0,
    });
  }

  static Future<List<Map<String, dynamic>>> getPendingOrders() async {
    final d = await db;
    return d.query('pending_orders', where: 'synced = 0', orderBy: 'created_at');
  }

  static Future<void> markSynced(String id) async {
    final d = await db;
    await d.update('pending_orders', {'synced': 1}, where: 'id = ?', whereArgs: [id]);
  }

  static Future<int> pendingCount() async {
    final d = await db;
    final r = await d.rawQuery('SELECT COUNT(*) as c FROM pending_orders WHERE synced = 0');
    return Sqflite.firstIntValue(r) ?? 0;
  }
}
