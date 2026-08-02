import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../core/api/api_client.dart';
import '../core/theme/app_theme.dart';
import '../features/auth/auth_provider.dart';
import '../shared/models/models.dart';

// Nav groups — sama persis dengan web layout.tsx
List<_NavGroup> _buildNavGroups(AuthUser user, int alertCount) {
  final isOwner      = user.isOwner;
  final isAdminGudang = user.isAdminGudang;
  final isSupervisor = user.isSupervisor;
  final isKasir      = user.isKasir;
  final isKasirPlan  = user.isKasirPlan;

  if (isKasir) {
    return [
      _NavGroup('Kasir', [
        _NavItem('Kasir POS',       Icons.point_of_sale_rounded,  '/pos'),
        _NavItem('Manajemen Shift', Icons.access_time_rounded,    '/pos-shifts'),
        _NavItem('Riwayat Pesanan', Icons.receipt_long_rounded,   '/pos-orders'),
      ]),
      _NavGroup('Akun', [
        _NavItem('Pengaturan', Icons.settings_rounded, '/settings'),
      ]),
    ];
  }

  const String dashboardPath = '/dashboard';

  return [
    _NavGroup('Ringkasan', [
      _NavItem('Dashboard', Icons.space_dashboard_rounded, dashboardPath),
    ]),
    _NavGroup('Operasional', [
      if (isOwner || isAdminGudang)
        _NavItem('Master Inventori', Icons.inventory_2_rounded,    '/inventory'),
      if (isOwner)
        _NavItem('Master Menu',      Icons.restaurant_menu_rounded, '/menu'),
      if (!isKasirPlan && (isOwner || isAdminGudang || isSupervisor))
        _NavItem('Stok per Lokasi',  Icons.warehouse_rounded,       '/stock'),
      if (!isKasirPlan && (isOwner || isAdminGudang))
        _NavItem('Transfer Barang',  Icons.swap_horiz_rounded,      '/transfer'),
      if (!isKasirPlan && (isOwner || isSupervisor))
        _NavItem('Opname Fisik',     Icons.fact_check_rounded,      '/opname'),
      if (!isKasirPlan && (isOwner || isAdminGudang))
        _NavItem('Barang Masuk',     Icons.local_shipping_rounded,  '/goods-receipt'),
    ]),
    _NavGroup('Laporan', [
      if (!isKasirPlan)
        _NavItem('Peringatan',        Icons.warning_rounded,      '/alerts', badge: alertCount > 0 ? '$alertCount' : null),
      if (isOwner || isAdminGudang || isSupervisor)
        _NavItem('Riwayat Aktivitas', Icons.history_rounded,      '/audit'),
    ]),
    _NavGroup('Tim & Akun', [
      if (isOwner || isAdminGudang)
        _NavItem('Manajemen Tim', Icons.people_rounded,  '/team'),
      _NavItem('Pengaturan',    Icons.settings_rounded, '/settings'),
    ]),
  ].where((g) => g.items.isNotEmpty).toList();
}

class MainShell extends ConsumerStatefulWidget {
  final Widget child;
  const MainShell({super.key, required this.child});
  @override
  ConsumerState<MainShell> createState() => _MainShellState();
}

class _MainShellState extends ConsumerState<MainShell> {
  int _alertCount = 0;

  @override
  void initState() {
    super.initState();
    _loadAlerts();
  }

  Future<void> _loadAlerts() async {
    try {
      final data = await api.get('/api/alerts?resolved=false') as List;
      if (mounted) setState(() => _alertCount = data.length);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    if (user == null) return widget.child;

    final location   = GoRouterState.of(context).matchedLocation;
    final navGroups  = _buildNavGroups(user, _alertCount);
    final allItems   = navGroups.expand((g) => g.items).toList();
    final pageTitle  = allItems.where((i) => location == i.path || location.startsWith('${i.path}/')).firstOrNull?.label ?? 'Pantau';
    final avatar     = user.name.substring(0, user.name.length >= 2 ? 2 : 1).toUpperCase();
    final roleLabel  = {'OWNER': 'Owner', 'ADMIN_GUDANG': 'Admin Gudang', 'SUPERVISOR': 'Supervisor', 'KASIR': 'Kasir'}[user.role] ?? user.role;

    return Scaffold(
      backgroundColor: AppTheme.surface,

      // ── Top header — sama dengan web h-14 ──
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        titleSpacing: 0,
        leading: Builder(builder: (ctx) => IconButton(
          icon: const Icon(Icons.menu_rounded, color: AppTheme.textPrimary, size: 22),
          onPressed: () => Scaffold.of(ctx).openDrawer(),
        )),
        title: Text(pageTitle, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: AppTheme.textPrimary)),
        bottom: const PreferredSize(preferredSize: Size.fromHeight(1), child: Divider(height: 1, color: AppTheme.border)),
        actions: [
          // Alert badge — hanya untuk plan Operasional (PRO)
          if (!user.isKasirPlan && _alertCount > 0)
            Stack(alignment: Alignment.topRight, children: [
              IconButton(icon: const Icon(Icons.notifications_outlined, color: AppTheme.textSecondary, size: 22), onPressed: () => context.go('/alerts')),
              Positioned(top: 8, right: 8, child: Container(
                padding: const EdgeInsets.all(3),
                decoration: const BoxDecoration(color: AppTheme.danger, shape: BoxShape.circle),
                child: Text('$_alertCount', style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w700)),
              )),
            ]),
          const SizedBox(width: 8),
        ],
      ),

      // ── Drawer — sama dengan web sidebar slate-950 ──
      drawer: Drawer(
        width: 240,
        backgroundColor: const Color(0xFF020617),
        child: Column(children: [
          // Logo — h-16 border-b
          SafeArea(bottom: false, child: Container(
            height: 64,
            decoration: BoxDecoration(border: Border(bottom: BorderSide(color: Colors.white.withValues(alpha: 0.08)))),
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(children: [
              Container(
                width: 32, height: 32,
                decoration: BoxDecoration(color: AppTheme.primary, borderRadius: BorderRadius.circular(8)),
                child: const Icon(Icons.bar_chart_rounded, color: Colors.white, size: 18),
              ),
              const SizedBox(width: 10),
              const Text('Pantau', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Colors.white, letterSpacing: -0.3)),
            ]),
          )),

          // Business badge
          Container(
            margin: const EdgeInsets.fromLTRB(12, 12, 12, 0),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.06), borderRadius: BorderRadius.circular(12)),
            child: Row(children: [
              Container(
                width: 24, height: 24,
                decoration: BoxDecoration(color: AppTheme.primary, borderRadius: BorderRadius.circular(6)),
                child: Center(child: Text(user.businessName.isNotEmpty ? user.businessName[0].toUpperCase() : 'B', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Colors.white))),
              ),
              const SizedBox(width: 10),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Bisnis aktif', style: TextStyle(fontSize: 10, color: Color(0xFF94A3B8))),
                Text(user.businessName, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.white), overflow: TextOverflow.ellipsis),
              ])),
            ]),
          ),

          // Nav groups
          Expanded(child: ListView(padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12), children: [
            for (final group in navGroups) ...[
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
                child: Text(group.label.toUpperCase(), style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: Color(0xFF4B5563), letterSpacing: 1.2)),
              ),
              for (final item in group.items) _NavTile(item: item, location: location),
              const SizedBox(height: 4),
            ],
          ])),

          // User section — bottom border-t
          Container(
            decoration: BoxDecoration(border: Border(top: BorderSide(color: Colors.white.withValues(alpha: 0.08)))),
            child: Column(children: [
              ListTile(
                leading: CircleAvatar(radius: 16, backgroundColor: AppTheme.primary, child: Text(avatar, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700))),
                title: Text(user.name, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: Colors.white)),
                subtitle: Text(roleLabel, style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
                trailing: Container(width: 6, height: 6, decoration: const BoxDecoration(color: Color(0xFF4ADE80), shape: BoxShape.circle)),
                dense: true,
              ),
              ListTile(
                leading: const Icon(Icons.logout_rounded, color: Color(0xFFF87171), size: 18),
                title: const Text('Keluar', style: TextStyle(fontSize: 13, color: Color(0xFFF87171))),
                onTap: () async {
                  Navigator.of(context).pop();
                  await ref.read(authProvider.notifier).logout();
                },
                dense: true,
              ),
              const SizedBox(height: 8),
            ]),
          ),
        ]),
      ),

      body: widget.child,
    );
  }
}

class _NavTile extends StatelessWidget {
  final _NavItem item;
  final String location;
  const _NavTile({required this.item, required this.location});

  @override
  Widget build(BuildContext context) {
    final active = location == item.path || location.startsWith('${item.path}/');
    return GestureDetector(
      onTap: () {
        Navigator.of(context).pop(); // close drawer
        context.go(item.path);
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 2),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: active ? AppTheme.primary : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(children: [
          Icon(item.icon, size: 16, color: active ? Colors.white : const Color(0xFF9CA3AF)),
          const SizedBox(width: 10),
          Expanded(child: Text(item.label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: active ? Colors.white : const Color(0xFF9CA3AF)))),
          if (item.badge != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(color: AppTheme.danger, borderRadius: BorderRadius.circular(10)),
              child: Text(item.badge!, style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700)),
            )
          else if (active)
            const Icon(Icons.chevron_right_rounded, size: 14, color: Colors.white60),
        ]),
      ),
    );
  }
}

class _NavGroup {
  final String label;
  final List<_NavItem> items;
  _NavGroup(this.label, this.items);
}

class _NavItem {
  final String label, path;
  final IconData icon;
  final String? badge;
  _NavItem(this.label, this.icon, this.path, {this.badge});
}
