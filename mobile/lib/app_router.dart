import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'features/auth/auth_provider.dart';
import 'features/auth/login_screen.dart';
import 'features/auth/pending_screen.dart';
import 'features/auth/register_screen.dart';
import 'features/dashboard/dashboard_screen.dart';
import 'features/pos/pos_screen.dart';
import 'features/pos/shift_screen.dart';
import 'features/pos/shift_management_screen.dart';
import 'features/pos/orders_screen.dart';
import 'features/inventory/inventory_screen.dart';
import 'features/menu/menu_screen.dart';
import 'features/stock/stock_screen.dart';
import 'features/transfer/transfer_screen.dart';
import 'features/transfer/transfer_detail_screen.dart';
import 'features/goods_receipt/goods_receipt_screen.dart';
import 'features/goods_receipt/goods_receipt_detail_screen.dart';
import 'features/opname/opname_screen.dart';
import 'features/opname/opname_detail_screen.dart';
import 'features/alerts/alerts_screen.dart';
import 'features/team/team_screen.dart';
import 'features/team/permissions_screen.dart';
import 'features/audit/audit_screen.dart';
import 'features/audit/audit_shift_detail_screen.dart';
import 'features/settings/settings_screen.dart';
import 'features/splash/splash_screen.dart';
import 'shell/main_shell.dart';

// RouterNotifier: listens to auth changes without recreating the whole GoRouter
class _RouterNotifier extends ChangeNotifier {
  final Ref _ref;
  _RouterNotifier(this._ref) {
    _ref.listen<AuthState>(authProvider, (_, _) => notifyListeners());
  }

  String? redirect(BuildContext context, GoRouterState state) {
    final auth = _ref.read(authProvider);
    final loc  = state.matchedLocation;

    if (auth.loading) return loc == '/splash' ? null : '/splash';

    final loggedIn   = auth.user != null;
    final onLogin    = loc == '/login';
    final onRegister = loc == '/register';
    final onPending  = loc == '/pending';
    final onSplash   = loc == '/splash';

    if (!loggedIn) return (onLogin || onRegister) ? null : '/login';
    if (auth.user?.orgStatus == 'PENDING') return onPending ? null : '/pending';
    if (onLogin || onPending || onSplash) {
      return auth.user?.isKasir == true ? '/pos' : '/dashboard';
    }
    return null;
  }
}

final _routerNotifierProvider = Provider<_RouterNotifier>((ref) => _RouterNotifier(ref));

final routerProvider = Provider<GoRouter>((ref) {
  final notifier = ref.watch(_routerNotifierProvider);
  return GoRouter(
    initialLocation: '/splash',
    refreshListenable: notifier,
    redirect: notifier.redirect,
    routes: [
      GoRoute(path: '/splash',   builder: (_, _) => const SplashScreen()),
      GoRoute(path: '/login',    builder: (_, _) => const LoginScreen()),
      GoRoute(path: '/register', builder: (_, _) => const RegisterScreen()),
      GoRoute(path: '/pending',  builder: (_, _) => const PendingScreen()),
      ShellRoute(
        builder: (context, state, child) => MainShell(child: child),
        routes: [
          GoRoute(path: '/dashboard',    builder: (_, _) => const DashboardScreen()),
          GoRoute(path: '/pos',          builder: (_, _) => const PosScreen()),
          GoRoute(path: '/shift',        builder: (_, _) => const ShiftScreen()),
          GoRoute(path: '/pos-shifts',   builder: (_, _) => const ShiftManagementScreen()),
          GoRoute(path: '/pos-orders',   builder: (_, _) => const OrdersScreen()),
          GoRoute(path: '/inventory',    builder: (_, _) => const InventoryScreen()),
          GoRoute(path: '/menu',         builder: (_, _) => const MenuScreen()),
          GoRoute(path: '/stock',        builder: (_, _) => const StockScreen()),
          GoRoute(path: '/transfer',     builder: (_, _) => const TransferScreen()),
          GoRoute(path: '/transfer/:id', builder: (_, s) => TransferDetailScreen(id: s.pathParameters['id']!)),
          GoRoute(path: '/goods-receipt',     builder: (_, _) => const GoodsReceiptScreen()),
          GoRoute(path: '/goods-receipt/:id', builder: (_, s) => GoodsReceiptDetailScreen(id: s.pathParameters['id']!)),
          GoRoute(path: '/opname',       builder: (_, _) => const OpnameScreen()),
          GoRoute(path: '/opname/:id',   builder: (_, s) => OpnameDetailScreen(id: s.pathParameters['id']!)),
          GoRoute(path: '/alerts',       builder: (_, _) => const AlertsScreen()),
          GoRoute(path: '/team',         builder: (_, _) => const TeamScreen()),
          GoRoute(path: '/permissions',  builder: (_, _) => const PermissionsScreen()),
          GoRoute(path: '/audit',        builder: (_, _) => const AuditScreen()),
          GoRoute(path: '/audit/shift/:id', builder: (_, s) => AuditShiftDetailScreen(id: s.pathParameters['id']!)),
          GoRoute(path: '/settings',     builder: (_, _) => const SettingsScreen()),
        ],
      ),
    ],
  );
});
