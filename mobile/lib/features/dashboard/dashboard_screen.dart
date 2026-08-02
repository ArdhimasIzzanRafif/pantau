import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../features/auth/auth_provider.dart';
import '../../shared/widgets/widgets.dart';

class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});
  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  Map<String, dynamic>? _stats;
  Map<String, dynamic>? _charts;
  List<dynamic> _alerts = [];
  bool _loading = true;
  bool _loadingCharts = true;
  final int _chartDays = 14;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        api.get('/api/dashboard/stats'),
        api.get('/api/alerts?resolved=false'),
      ]);
      _stats = results[0] as Map<String, dynamic>?;
      _alerts = ((results[1] as List?) ?? []).take(4).toList();
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
    _loadCharts();
  }

  Future<void> _loadCharts() async {
    setState(() => _loadingCharts = true);
    try {
      final data = await api.get('/api/dashboard/charts?days=$_chartDays');
      _charts = data as Map<String, dynamic>?;
    } catch (_) {}
    if (mounted) setState(() => _loadingCharts = false);
  }

  String _today() {
    final d = DateTime.now();
    const days = [
      'Senin',
      'Selasa',
      'Rabu',
      'Kamis',
      'Jumat',
      'Sabtu',
      'Minggu',
    ];
    const months = [
      'Januari',
      'Februari',
      'Maret',
      'April',
      'Mei',
      'Juni',
      'Juli',
      'Agustus',
      'September',
      'Oktober',
      'November',
      'Desember',
    ];
    return '${days[d.weekday - 1]}, ${d.day} ${months[d.month - 1]} ${d.year}';
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    final businessName = user?.businessName ?? 'Bisnis Anda';
    final totalRevenue = toNum(_charts?['totalRevenue'])?.toDouble() ?? 0;
    final totalOrders = _charts?['totalOrders'] ?? 0;
    final avgOrder = toNum(_charts?['avgOrder'])?.toDouble() ?? 0;

    return Scaffold(
      backgroundColor: AppTheme.surface,
      body: _loading
          ? const LoadingCenter()
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: EdgeInsets.zero,
                children: [
                  // ── Hero banner — dark gradient persis seperti web ──
                  Container(
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        colors: [
                          Color(0xFF0F172A),
                          Color(0xFF1E293B),
                          Color(0xFF0C1A3A),
                        ],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                    ),
                    child: SafeArea(
                      bottom: false,
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Container(
                                          width: 6,
                                          height: 6,
                                          decoration: const BoxDecoration(
                                            color: Color(0xFF60A5FA),
                                            shape: BoxShape.circle,
                                          ),
                                        ),
                                        const SizedBox(width: 6),
                                        const Text(
                                          'OWNER DASHBOARD',
                                          style: TextStyle(
                                            color: Color(0xFF60A5FA),
                                            fontSize: 10,
                                            fontWeight: FontWeight.w600,
                                            letterSpacing: 1.5,
                                          ),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 8),
                                    Text(
                                      businessName,
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 26,
                                        fontWeight: FontWeight.w300,
                                        letterSpacing: -0.5,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      _today(),
                                      style: const TextStyle(
                                        color: Color(0xFF94A3B8),
                                        fontSize: 12,
                                      ),
                                    ),
                                  ],
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 14,
                                    vertical: 10,
                                  ),
                                  decoration: BoxDecoration(
                                    color: Colors.white.withValues(alpha: 0.06),
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(
                                      color: Colors.white.withValues(
                                        alpha: 0.10,
                                      ),
                                    ),
                                  ),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.end,
                                    children: [
                                      Text(
                                        'Omzet ${_chartDays}h',
                                        style: const TextStyle(
                                          color: Color(0xFF60A5FA),
                                          fontSize: 9,
                                          fontWeight: FontWeight.w600,
                                          letterSpacing: 1,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      _loadingCharts
                                          ? const Text(
                                              '···',
                                              style: TextStyle(
                                                color: Color(0xFF475569),
                                                fontSize: 22,
                                              ),
                                            )
                                          : Text(
                                              formatRpShort(totalRevenue),
                                              style: const TextStyle(
                                                color: Colors.white,
                                                fontSize: 22,
                                                fontWeight: FontWeight.w200,
                                              ),
                                            ),
                                      const SizedBox(height: 4),
                                      Text(
                                        '$totalOrders transaksi',
                                        style: const TextStyle(
                                          color: Color(0xFF94A3B8),
                                          fontSize: 10,
                                        ),
                                      ),
                                      if (avgOrder > 0)
                                        Text(
                                          'Avg ${formatRpShort(avgOrder)}',
                                          style: const TextStyle(
                                            color: Color(0xFF6EE7B7),
                                            fontSize: 10,
                                            fontWeight: FontWeight.w500,
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // ── 2×2 stat cards ──
                        Column(
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: _MiniStat(
                                    label: 'Outlet',
                                    value: '${_stats?['activeLocations'] ?? 0}',
                                    icon: Icons.store_rounded,
                                    bg: const Color(0xFFEFF6FF),
                                    iconBg: const Color(0xFF2563EB),
                                    textColor: const Color(0xFF1D4ED8),
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: _MiniStat(
                                    label: 'Peringatan',
                                    value: '${_stats?['openAlertsCount'] ?? 0}',
                                    icon: Icons.warning_rounded,
                                    bg: const Color(0xFFFFF7ED),
                                    iconBg: const Color(0xFFF97316),
                                    textColor: const Color(0xFFC2410C),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                Expanded(
                                  child: _MiniStat(
                                    label: 'Opname',
                                    value: '${_stats?['opnamesCount'] ?? 0}',
                                    icon: Icons.fact_check_rounded,
                                    bg: const Color(0xFFF0FDF4),
                                    iconBg: const Color(0xFF22C55E),
                                    textColor: const Color(0xFF15803D),
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: _MiniStat(
                                    label: 'Est. Rugi',
                                    value:
                                        (toNum(_stats?['estimatedLoss']) ?? 0) >
                                            0
                                        ? formatRpShort(
                                            toNum(
                                              _stats!['estimatedLoss'],
                                            )!.toDouble(),
                                          )
                                        : '—',
                                    icon: Icons.trending_down_rounded,
                                    bg: const Color(0xFFFEF2F2),
                                    iconBg: const Color(0xFFEF4444),
                                    textColor: const Color(0xFFB91C1C),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),

                        // ── Peringatan aktif ──
                        Container(
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: AppTheme.border),
                          ),
                          child: Column(
                            children: [
                              Padding(
                                padding: const EdgeInsets.fromLTRB(
                                  16,
                                  12,
                                  12,
                                  12,
                                ),
                                child: Row(
                                  children: [
                                    const Icon(
                                      Icons.notifications_rounded,
                                      size: 15,
                                      color: AppTheme.textMuted,
                                    ),
                                    const SizedBox(width: 6),
                                    const Text(
                                      'Peringatan Aktif',
                                      style: TextStyle(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w600,
                                        color: AppTheme.textPrimary,
                                      ),
                                    ),
                                    if (_alerts.isNotEmpty) ...[
                                      const SizedBox(width: 6),
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 5,
                                          vertical: 1,
                                        ),
                                        decoration: BoxDecoration(
                                          color: AppTheme.danger,
                                          borderRadius: BorderRadius.circular(
                                            10,
                                          ),
                                        ),
                                        child: Text(
                                          '${_alerts.length}',
                                          style: const TextStyle(
                                            color: Colors.white,
                                            fontSize: 10,
                                            fontWeight: FontWeight.w700,
                                          ),
                                        ),
                                      ),
                                    ],
                                    const Spacer(),
                                    GestureDetector(
                                      onTap: () => context.go('/alerts'),
                                      child: const Row(
                                        children: [
                                          Text(
                                            'Semua',
                                            style: TextStyle(
                                              fontSize: 12,
                                              color: AppTheme.primary,
                                              fontWeight: FontWeight.w500,
                                            ),
                                          ),
                                          Icon(
                                            Icons.chevron_right_rounded,
                                            size: 14,
                                            color: AppTheme.primary,
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const Divider(height: 1, color: AppTheme.border),
                              if (_alerts.isEmpty)
                                const Padding(
                                  padding: EdgeInsets.all(20),
                                  child: Center(
                                    child: Text(
                                      'Semua kondisi aman ✓',
                                      style: TextStyle(
                                        fontSize: 13,
                                        color: AppTheme.textMuted,
                                      ),
                                    ),
                                  ),
                                )
                              else
                                ..._alerts.map((a) {
                                  final crit = a['severity'] == 'CRITICAL';
                                  return Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 16,
                                      vertical: 10,
                                    ),
                                    decoration: const BoxDecoration(
                                      border: Border(
                                        bottom: BorderSide(
                                          color: AppTheme.border,
                                        ),
                                      ),
                                    ),
                                    child: Row(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Container(
                                          margin: const EdgeInsets.only(top: 5),
                                          width: 6,
                                          height: 6,
                                          decoration: BoxDecoration(
                                            color: crit
                                                ? AppTheme.danger
                                                : AppTheme.warning,
                                            shape: BoxShape.circle,
                                          ),
                                        ),
                                        const SizedBox(width: 10),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                a['title'] ?? '',
                                                style: const TextStyle(
                                                  fontSize: 12,
                                                  fontWeight: FontWeight.w500,
                                                  color: AppTheme.textPrimary,
                                                ),
                                              ),
                                              Text(
                                                a['message'] ?? '',
                                                style: const TextStyle(
                                                  fontSize: 11,
                                                  color: AppTheme.textSecondary,
                                                ),
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                            ],
                                          ),
                                        ),
                                        Container(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 6,
                                            vertical: 2,
                                          ),
                                          decoration: BoxDecoration(
                                            color: crit
                                                ? const Color(0xFFFEE2E2)
                                                : const Color(0xFFFEF3C7),
                                            borderRadius: BorderRadius.circular(
                                              8,
                                            ),
                                          ),
                                          child: Text(
                                            crit ? 'Kritis' : 'Warn',
                                            style: TextStyle(
                                              fontSize: 10,
                                              fontWeight: FontWeight.w600,
                                              color: crit
                                                  ? const Color(0xFFB91C1C)
                                                  : const Color(0xFF92400E),
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  );
                                }),
                            ],
                          ),
                        ),
                        const SizedBox(height: 16),

                        // ── Produk Terlaris ──
                        const _ProdukTerlaris(),
                        const SizedBox(height: 16),

                        // ── Tren Penjualan ──
                        const _TrenPenjualan(),
                        const SizedBox(height: 16),

                        // ── Jam Tersibuk ──
                        const _JamTersibuk(),
                        const SizedBox(height: 24),
                      ],
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  final String label, value;
  final IconData icon;
  final Color bg, iconBg, textColor;
  const _MiniStat({
    required this.label,
    required this.value,
    required this.icon,
    required this.bg,
    required this.iconBg,
    required this.textColor,
  });

  @override
  Widget build(BuildContext context) => Container(
    height: 92,
    decoration: BoxDecoration(
      color: bg,
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: AppTheme.border),
    ),
    padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Container(
          width: 26,
          height: 26,
          decoration: BoxDecoration(
            color: iconBg,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(icon, color: Colors.white, size: 13),
        ),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              value,
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color: textColor,
                letterSpacing: -0.5,
              ),
            ),
            Text(
              label,
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w500,
                color: AppTheme.textSecondary,
              ),
            ),
          ],
        ),
      ],
    ),
  );
}

String formatRpShort(double n) {
  if (n >= 1000000) return 'Rp ${(n / 1000000).toStringAsFixed(1)}jt';
  if (n >= 1000) return 'Rp ${(n / 1000).toStringAsFixed(0)}rb';
  return 'Rp ${n.toStringAsFixed(0)}';
}

class _DaysFilter extends StatelessWidget {
  final int selected;
  final ValueChanged<int> onChanged;
  const _DaysFilter({required this.selected, required this.onChanged});

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [7, 14, 30]
        .map(
          (d) => GestureDetector(
            onTap: () => onChanged(d),
            child: Container(
              margin: const EdgeInsets.only(left: 5),
              padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 4),
              decoration: BoxDecoration(
                color: selected == d
                    ? AppTheme.primary
                    : const Color(0xFFF1F5F9),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                '${d}h',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: selected == d ? Colors.white : AppTheme.textSecondary,
                ),
              ),
            ),
          ),
        )
        .toList(),
  );
}

// ── Produk Terlaris — independent ──
class _ProdukTerlaris extends StatefulWidget {
  const _ProdukTerlaris();
  @override
  State<_ProdukTerlaris> createState() => _ProdukTerlarisState();
}

class _ProdukTerlarisState extends State<_ProdukTerlaris> {
  int _days = 14;
  bool _loading = true;
  List _products = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data =
          await api.get('/api/dashboard/charts?days=$_days')
              as Map<String, dynamic>;
      _products = (data['topProducts'] as List?) ?? [];
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    final maxRev = _products.fold<double>(1, (m, p) {
      final r = toNum(p['revenue'])?.toDouble() ?? 0;
      return m > r ? m : r;
    });
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.border),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Produk Terlaris',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                ],
              ),
              _DaysFilter(
                selected: _days,
                onChanged: (d) {
                  setState(() => _days = d);
                  _load();
                },
              ),
            ],
          ),
          const SizedBox(height: 14),
          if (_loading)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: CircularProgressIndicator(
                  color: AppTheme.primary,
                  strokeWidth: 2,
                ),
              ),
            )
          else if (_products.isEmpty)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  'Belum ada data penjualan',
                  style: TextStyle(color: AppTheme.textMuted, fontSize: 13),
                ),
              ),
            )
          else
            ..._products.take(5).toList().asMap().entries.map((e) {
              final i = e.key;
              final p = e.value as Map;
              final rev = toNum(p['revenue'])?.toDouble() ?? 0.0;
              return Padding(
                padding: const EdgeInsets.only(bottom: 14),
                child: Row(
                  children: [
                    Container(
                      width: 24,
                      height: 24,
                      decoration: BoxDecoration(
                        color: i == 0
                            ? AppTheme.primary
                            : i == 1
                            ? const Color(0xFF374151)
                            : const Color(0xFFF1F5F9),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Center(
                        child: Text(
                          '${i + 1}',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: i < 2
                                ? Colors.white
                                : AppTheme.textSecondary,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Expanded(
                                child: Text(
                                  p['name'] ?? '',
                                  style: const TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w500,
                                    color: AppTheme.textPrimary,
                                  ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              Text(
                                formatRpShort(rev),
                                style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: AppTheme.textPrimary,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 5),
                          ClipRRect(
                            borderRadius: BorderRadius.circular(4),
                            child: LinearProgressIndicator(
                              value: rev / maxRev,
                              minHeight: 5,
                              backgroundColor: const Color(0xFFF1F5F9),
                              color: i == 0
                                  ? AppTheme.primary
                                  : i == 1
                                  ? const Color(0xFF60A5FA)
                                  : const Color(0xFFCBD5E1),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }
}

// ── Tren Penjualan — independent ──
class _TrenPenjualan extends StatefulWidget {
  const _TrenPenjualan();
  @override
  State<_TrenPenjualan> createState() => _TrenPenjualanState();
}

class _TrenPenjualanState extends State<_TrenPenjualan> {
  int _days = 14;
  bool _loading = true;
  List _daily = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data =
          await api.get('/api/dashboard/charts?days=$_days')
              as Map<String, dynamic>;
      _daily = (data['dailySales'] as List?) ?? [];
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    final hasData = _daily.any((d) => (toNum(d['total']) ?? 0) > 0);
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.border),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Tren Penjualan',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                  Text(
                    'Revenue harian',
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppTheme.textMuted,
                    ),
                  ),
                ],
              ),
              _DaysFilter(
                selected: _days,
                onChanged: (d) {
                  setState(() => _days = d);
                  _load();
                },
              ),
            ],
          ),
          const SizedBox(height: 16),
          if (_loading)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: CircularProgressIndicator(
                  color: AppTheme.primary,
                  strokeWidth: 2,
                ),
              ),
            )
          else if (!hasData)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  'Belum ada data penjualan',
                  style: TextStyle(color: AppTheme.textMuted, fontSize: 13),
                ),
              ),
            )
          else
            _buildChart(_daily),
        ],
      ),
    );
  }

  Widget _buildChart(List daily) {
    final values = daily
        .map((d) => (toNum(d['total']) ?? 0).toDouble())
        .toList();
    final maxVal = values.fold(0.0, (m, v) => v > m ? v : m);
    final step = daily.length > 10 ? (daily.length ~/ 5) : 2;
    final labelEntries = daily
        .asMap()
        .entries
        .where((e) => e.key % step == 0)
        .toList();

    const chartH = 110.0;

    return Column(
      children: [
        SizedBox(
          height: chartH,
          child: LayoutBuilder(
            builder: (ctx, box) => CustomPaint(
              size: Size(box.maxWidth, chartH),
              painter: _LinePainter(values: values, maxVal: maxVal),
            ),
          ),
        ),
        const SizedBox(height: 6),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: labelEntries
              .map(
                (e) => Text(
                  e.value['label'] as String? ?? '',
                  style: const TextStyle(
                    fontSize: 9,
                    color: AppTheme.textMuted,
                  ),
                ),
              )
              .toList(),
        ),
      ],
    );
  }
}

class _LinePainter extends CustomPainter {
  final List<double> values;
  final double maxVal;
  const _LinePainter({required this.values, required this.maxVal});

  @override
  void paint(Canvas canvas, Size size) {
    if (values.isEmpty || maxVal == 0) return;

    // Grid lines
    final gridPaint = Paint()
      ..color = const Color(0xFFF1F5F9)
      ..strokeWidth = 1;
    for (int i = 0; i <= 3; i++) {
      final y = size.height * i / 3;
      canvas.drawLine(Offset(0, y), Offset(size.width, y), gridPaint);
    }

    // Gradient fill
    final fillPath = Path();
    final pts = <Offset>[];
    for (int i = 0; i < values.length; i++) {
      final x = size.width * i / (values.length - 1);
      final y = size.height - (values[i] / maxVal) * size.height * 0.9;
      pts.add(Offset(x, y));
    }
    fillPath.moveTo(pts.first.dx, size.height);
    for (final p in pts) {
      fillPath.lineTo(p.dx, p.dy);
    }
    fillPath.lineTo(pts.last.dx, size.height);
    fillPath.close();
    canvas.drawPath(
      fillPath,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            const Color(0xFF2563EB).withValues(alpha: 0.15),
            const Color(0xFF2563EB).withValues(alpha: 0.01),
          ],
        ).createShader(Rect.fromLTWH(0, 0, size.width, size.height)),
    );

    // Line
    final linePaint = Paint()
      ..color = const Color(0xFF2563EB)
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;
    final linePath = Path()..moveTo(pts.first.dx, pts.first.dy);
    for (int i = 1; i < pts.length; i++) {
      final cp1 = Offset((pts[i - 1].dx + pts[i].dx) / 2, pts[i - 1].dy);
      final cp2 = Offset((pts[i - 1].dx + pts[i].dx) / 2, pts[i].dy);
      linePath.cubicTo(cp1.dx, cp1.dy, cp2.dx, cp2.dy, pts[i].dx, pts[i].dy);
    }
    canvas.drawPath(linePath, linePaint);
  }

  @override
  bool shouldRepaint(_LinePainter old) =>
      old.values != values || old.maxVal != maxVal;
}

// ── Jam Tersibuk — independent ──
class _JamTersibuk extends StatefulWidget {
  const _JamTersibuk();
  @override
  State<_JamTersibuk> createState() => _JamTersibukState();
}

class _JamTersibukState extends State<_JamTersibuk> {
  int _days = 14;
  bool _loading = true;
  Map<int, int> _byHour = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data =
          await api.get('/api/dashboard/charts?days=$_days')
              as Map<String, dynamic>;
      final hourly = (data['hourlySales'] as List?) ?? [];
      final map = <int, int>{};
      for (final h in hourly) {
        map[(toNum(h['hour']) ?? 0).toInt()] = (toNum(h['orders']) ?? 0)
            .toInt();
      }
      _byHour = map;
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  List<String> _yLabels(double maxVal) {
    final max = maxVal > 0 ? maxVal.ceil().toDouble() : 1.0;
    final raw = [max, max * 0.75, max * 0.5, max * 0.25, 0.0];
    final seen = <String>{};
    return raw.map((v) {
      final s = v.round().toString();
      return seen.add(s) ? s : '';
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final hasData = _byHour.values.any((v) => v > 0);
    final maxAvg = hasData
        ? _byHour.values.fold(0, (m, v) => v > m ? v : m).toDouble()
        : 0.0;
    final hours = List.generate(17, (i) => i + 6);

    const chartH = 140.0;
    const yAxisW = 28.0;
    const xAxisH = 18.0;
    const barH = chartH - xAxisH;

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.border),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Jam Tersibuk',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                  Text(
                    'Jumlah order per jam',
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppTheme.textMuted,
                    ),
                  ),
                ],
              ),
              _DaysFilter(
                selected: _days,
                onChanged: (d) {
                  setState(() => _days = d);
                  _load();
                },
              ),
            ],
          ),
          const SizedBox(height: 16),

          if (_loading)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: CircularProgressIndicator(
                  color: AppTheme.primary,
                  strokeWidth: 2,
                ),
              ),
            )
          else if (!hasData)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  'Belum ada data order',
                  style: TextStyle(color: AppTheme.textMuted, fontSize: 13),
                ),
              ),
            )
          else
            SizedBox(
              height: chartH,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Y-axis fixed
                  SizedBox(
                    width: yAxisW,
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        for (final y in _yLabels(maxAvg))
                          Text(
                            y,
                            style: const TextStyle(
                              fontSize: 9,
                              color: AppTheme.textMuted,
                            ),
                          ),
                        SizedBox(height: xAxisH),
                      ],
                    ),
                  ),
                  // Scrollable chart
                  Expanded(
                    child: SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: SizedBox(
                        width: hours.length * 30.0,
                        child: Column(
                          children: [
                            // Bar area
                            SizedBox(
                              height: barH,
                              child: Stack(
                                children: [
                                  // Grid lines
                                  ...List.generate(
                                    3,
                                    (i) => Positioned(
                                      left: 0,
                                      right: 0,
                                      top: (barH / 2) * i,
                                      child: Container(
                                        height: 1,
                                        color: const Color(0xFFF1F5F9),
                                      ),
                                    ),
                                  ),
                                  // Bars aligned to bottom
                                  Positioned.fill(
                                    child: Row(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.end,
                                      children: hours.map((hr) {
                                        final cnt = _byHour[hr] ?? 0.0;
                                        final h = cnt > 0
                                            ? (cnt / maxAvg * barH).clamp(
                                                4.0,
                                                barH,
                                              )
                                            : 0.0;
                                        final isMax =
                                            maxAvg > 0 &&
                                            (cnt - maxAvg).abs() < 0.001;
                                        return SizedBox(
                                          width: 30,
                                          child: Padding(
                                            padding: const EdgeInsets.symmetric(
                                              horizontal: 4,
                                            ),
                                            child: Container(
                                              height: h,
                                              decoration: h > 0
                                                  ? BoxDecoration(
                                                      gradient: LinearGradient(
                                                        begin:
                                                            Alignment.topCenter,
                                                        end: Alignment
                                                            .bottomCenter,
                                                        colors: isMax
                                                            ? [
                                                                const Color(
                                                                  0xFF2563EB,
                                                                ),
                                                                const Color(
                                                                  0xFF1D4ED8,
                                                                ),
                                                              ]
                                                            : [
                                                                const Color(
                                                                  0xFF93C5FD,
                                                                ),
                                                                const Color(
                                                                  0xFF3B82F6,
                                                                ),
                                                              ],
                                                      ),
                                                      borderRadius:
                                                          const BorderRadius.only(
                                                            topLeft:
                                                                Radius.circular(
                                                                  4,
                                                                ),
                                                            topRight:
                                                                Radius.circular(
                                                                  4,
                                                                ),
                                                          ),
                                                    )
                                                  : null,
                                            ),
                                          ),
                                        );
                                      }).toList(),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            // X-axis labels
                            SizedBox(
                              height: xAxisH,
                              child: Row(
                                children: hours
                                    .map(
                                      (hr) => SizedBox(
                                        width: 30,
                                        child: Text(
                                          hr % 3 == 0
                                              ? '${hr.toString().padLeft(2, '0')}:00'
                                              : '',
                                          style: const TextStyle(
                                            fontSize: 9,
                                            color: AppTheme.textMuted,
                                          ),
                                          textAlign: TextAlign.center,
                                        ),
                                      ),
                                    )
                                    .toList(),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
