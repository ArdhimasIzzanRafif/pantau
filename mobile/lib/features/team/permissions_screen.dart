import 'package:flutter/material.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';

// Sama persis dengan web lib/permissions.ts
const _features = [
  ('MASTER_INVENTORY', 'Master Inventori',  'Kelola daftar bahan baku & produk'),
  ('MASTER_MENU',      'Master Menu',        'Kelola menu & resep'),
  ('STOCK_LOCATION',   'Stok per Lokasi',    'Lihat saldo stok di tiap lokasi'),
  ('TRANSFER',         'Transfer Barang',    'Pindah stok antar gudang & outlet'),
  ('GOODS_RECEIPT',    'Barang Masuk',       'Catat penerimaan barang dari supplier'),
  ('OPNAME',           'Opname Fisik',       'Hitung & sesuaikan stok fisik'),
  ('ALERTS',           'Peringatan',         'Stok menipis/habis & notifikasi transfer barang'),
];

const _defaults = {
  'ADMIN_GUDANG': {
    'GOODS_RECEIPT':    'EDIT',
    'TRANSFER':         'EDIT',
    'STOCK_LOCATION':   'VIEW',
    'MASTER_INVENTORY': 'VIEW',
    'ALERTS':           'VIEW',
  },
  'SUPERVISOR': {
    'MASTER_MENU':      'VIEW',
    'MASTER_INVENTORY': 'VIEW',
    'STOCK_LOCATION':   'VIEW',
    'OPNAME':           'EDIT',
    'ALERTS':           'VIEW',
  },
};

const _roles = [
  ('ADMIN_GUDANG', 'Admin Gudang'),
  ('SUPERVISOR',   'Supervisor'),
];

class PermissionsScreen extends StatefulWidget {
  const PermissionsScreen({super.key});
  @override
  State<PermissionsScreen> createState() => _PermissionsScreenState();
}

class _PermissionsScreenState extends State<PermissionsScreen> {
  Map<String, Map<String, String>> _perms = {};
  bool _loading = true;
  bool _saving  = false;
  bool _saved   = false;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data = await api.get('/api/permissions');
      final filled = <String, Map<String, String>>{};
      for (final role in _roles) {
        final key     = role.$1;
        final fromApi = (data is Map && data[key] is Map)
          ? (data[key] as Map).cast<String, String>()
          : <String, String>{};
        filled[key] = fromApi.isNotEmpty ? fromApi : Map<String, String>.from(_defaults[key] ?? {});
      }
      setState(() { _perms = filled; _loading = false; });
    } catch (_) {
      final filled = <String, Map<String, String>>{};
      for (final role in _roles) {
        filled[role.$1] = Map<String, String>.from(_defaults[role.$1] ?? {});
      }
      setState(() { _perms = filled; _loading = false; });
    }
  }

  void _toggle(String role, String feature) {
    setState(() {
      final rp = Map<String, String>.from(_perms[role] ?? {});
      if (rp.containsKey(feature)) {
        rp.remove(feature);
      } else {
        rp[feature] = 'EDIT';
      }
      _perms = { ..._perms, role: rp };
    });
  }

  void _setAccess(String role, String feature, String level) {
    setState(() {
      final rp = Map<String, String>.from(_perms[role] ?? {});
      rp[feature] = level;
      _perms = { ..._perms, role: rp };
    });
  }

  void _applyDefault(String role) {
    setState(() {
      _perms = { ..._perms, role: Map<String, String>.from(_defaults[role] ?? {}) };
    });
  }

  bool _isValid() => _roles.every((r) => (_perms[r.$1] ?? {}).isNotEmpty);

  Future<void> _save() async {
    if (!_isValid()) return;
    setState(() { _saving = true; _saved = false; });
    try {
      await api.put('/api/permissions', data: _perms);
      if (!mounted) return;
      setState(() => _saved = true);
      await Future.delayed(const Duration(milliseconds: 2500));
      if (mounted) setState(() => _saved = false);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Gagal menyimpan: ${e.toString().replaceFirst("Exception: ", "")}')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.surface,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        title: const Text('Akses Fitur per Role', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: AppTheme.textPrimary)),
        bottom: const PreferredSize(preferredSize: Size.fromHeight(1), child: Divider(height: 1, color: AppTheme.border)),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded, color: AppTheme.textPrimary, size: 22),
          onPressed: () => Navigator.of(context).pop(),
        ),
        actions: [
          TextButton(
            onPressed: (!_isValid() || _saving) ? null : _save,
            child: _saving
              ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
              : Text(
                  _saved ? 'Tersimpan!' : 'Simpan',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: (!_isValid() || _saving)
                      ? AppTheme.textMuted
                      : (_saved ? const Color(0xFF16A34A) : AppTheme.primary),
                  ),
                ),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: _loading
        ? const Center(child: CircularProgressIndicator())
        : ListView(
            padding: const EdgeInsets.all(16),
            children: [
              for (final role in _roles)
                _buildRoleCard(role.$1, role.$2),
              const SizedBox(height: 4),
              _buildInfoBox(),
              const SizedBox(height: 32),
            ],
          ),
    );
  }

  Widget _buildRoleCard(String roleKey, String roleLabel) {
    final rp       = _perms[roleKey] ?? {};
    final count    = rp.length;
    final hasError = count == 0;

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.border),
      ),
      child: Column(children: [
        // ── Header ──
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
          child: Row(children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: roleKey == 'ADMIN_GUDANG' ? const Color(0xFFEEF2FF) : const Color(0xFFEFF6FF),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: roleKey == 'ADMIN_GUDANG' ? const Color(0xFFC7D2FE) : const Color(0xFFBFDBFE)),
              ),
              child: Text(roleLabel, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: roleKey == 'ADMIN_GUDANG' ? const Color(0xFF4338CA) : const Color(0xFF0369A1))),
            ),
            const SizedBox(width: 8),
            Text('$count fitur aktif', style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
            if (hasError) ...[
              const SizedBox(width: 6),
              const Icon(Icons.info_outline_rounded, size: 13, color: AppTheme.danger),
              const SizedBox(width: 2),
              const Text('Min. 1 fitur', style: TextStyle(fontSize: 11, color: AppTheme.danger, fontWeight: FontWeight.w600)),
            ],
            const Spacer(),
            GestureDetector(
              onTap: () => _applyDefault(roleKey),
              child: const Row(children: [
                Icon(Icons.refresh_rounded, size: 13, color: AppTheme.textMuted),
                SizedBox(width: 3),
                Text('Pakai Saran', style: TextStyle(fontSize: 11, color: AppTheme.textMuted)),
              ]),
            ),
          ]),
        ),
        const Divider(height: 1, color: AppTheme.border),

        // ── Feature rows ──
        ..._features.asMap().entries.map((e) {
          final idx        = e.key;
          final feat       = e.value;
          final featureKey  = feat.$1;
          final featureLabel = feat.$2;
          final featureDesc  = feat.$3;
          final enabled   = rp.containsKey(featureKey);
          final level     = rp[featureKey];
          final isDefault = (_defaults[roleKey] ?? {}).containsKey(featureKey);
          final isLast    = idx == _features.length - 1;

          return Column(children: [
            Container(
              color: enabled ? Colors.white : const Color(0xFFFAFAFB),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Row(children: [
                // Toggle
                GestureDetector(
                  onTap: () => _toggle(roleKey, featureKey),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    width: 44, height: 24,
                    padding: const EdgeInsets.all(2),
                    decoration: BoxDecoration(
                      color: enabled ? AppTheme.primary : const Color(0xFFCBD5E1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: AnimatedAlign(
                      duration: const Duration(milliseconds: 200),
                      alignment: enabled ? Alignment.centerRight : Alignment.centerLeft,
                      child: Container(
                        width: 20, height: 20,
                        decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),

                // Label + desc
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Text(featureLabel, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: enabled ? AppTheme.textPrimary : AppTheme.textMuted)),
                    if (isDefault) ...[
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                        decoration: BoxDecoration(
                          color: const Color(0xFFEFF6FF),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: const Color(0xFFBFDBFE)),
                        ),
                        child: const Text('Saran', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: Color(0xFF3B82F6))),
                      ),
                    ],
                  ]),
                  const SizedBox(height: 1),
                  Text(featureDesc, style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                ])),

                // VIEW / EDIT pill
                if (enabled)
                  Container(
                    decoration: BoxDecoration(color: const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(8)),
                    padding: const EdgeInsets.all(2),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      for (final lvl in ['VIEW', 'EDIT'])
                        GestureDetector(
                          onTap: () => _setAccess(roleKey, featureKey, lvl),
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 150),
                            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                            decoration: BoxDecoration(
                              color: level == lvl ? Colors.white : Colors.transparent,
                              borderRadius: BorderRadius.circular(6),
                              boxShadow: level == lvl
                                ? [BoxShadow(color: Colors.black.withValues(alpha: 0.1), blurRadius: 3, offset: const Offset(0, 1))]
                                : [],
                            ),
                            child: Text(
                              lvl == 'VIEW' ? 'Lihat' : 'Edit',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                                color: level == lvl ? AppTheme.textPrimary : AppTheme.textMuted,
                              ),
                            ),
                          ),
                        ),
                    ]),
                  ),
              ]),
            ),
            if (!isLast) const Divider(height: 1, color: Color(0xFFF1F5F9), indent: 0),
          ]);
        }),
      ]),
    );
  }

  Widget _buildInfoBox() => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: const Color(0xFFEFF6FF),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: const Color(0xFFBFDBFE)),
    ),
    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Icon(Icons.info_outline_rounded, size: 16, color: Color(0xFF3B82F6)),
      const SizedBox(width: 10),
      const Expanded(
        child: Text.rich(TextSpan(
          style: TextStyle(fontSize: 12, color: Color(0xFF1D4ED8), height: 1.5),
          children: [
            TextSpan(text: 'Lihat', style: TextStyle(fontWeight: FontWeight.w700)),
            TextSpan(text: ' — hanya bisa melihat data, tombol simpan/edit dinonaktifkan.\n'),
            TextSpan(text: 'Edit', style: TextStyle(fontWeight: FontWeight.w700)),
            TextSpan(text: ' — bisa melihat dan mengubah data.'),
          ],
        )),
      ),
    ]),
  );
}
