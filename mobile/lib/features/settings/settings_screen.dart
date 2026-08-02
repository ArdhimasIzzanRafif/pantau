import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/widgets.dart';
import '../auth/auth_provider.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});
  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  Map? _org;
  bool _loading = true, _saving = false;
  String _bizName = '', _name = '', _error = '', _success = '';
  final _bizCtrl  = TextEditingController();
  final _nameCtrl = TextEditingController();

  @override
  void initState() { super.initState(); _load(); }

  @override
  void dispose() { _bizCtrl.dispose(); _nameCtrl.dispose(); super.dispose(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final org = await api.get('/api/organization');
      _org = org;
      _bizName = org['businessName'] ?? '';
      _name    = org['userName'] ?? '';
      _bizCtrl.text  = _bizName;
      _nameCtrl.text = _name;
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _save() async {
    setState(() { _saving = true; _error = ''; _success = ''; });
    try {
      final user = ref.read(authProvider).user;
      final body = <String, dynamic>{'name': _nameCtrl.text.trim()};
      if (user?.isOwner == true) body['businessName'] = _bizCtrl.text.trim();
      await api.patch('/api/organization', data: body);
      setState(() => _success = 'Perubahan berhasil disimpan');
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    final isOwner = user?.isOwner ?? false;
    final avatar  = (user?.name ?? 'U').substring(0, (user?.name ?? 'U').length >= 2 ? 2 : 1).toUpperCase();
    final roleLabel = {'OWNER': 'Owner', 'ADMIN_GUDANG': 'Admin Gudang', 'SUPERVISOR': 'Supervisor', 'KASIR': 'Kasir'}[user?.role] ?? '';

    return Scaffold(
      backgroundColor: AppTheme.surface,
      body: _loading ? const LoadingCenter() : RefreshIndicator(
        onRefresh: _load,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Pengaturan', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w300, color: AppTheme.textPrimary, letterSpacing: -0.5)),
            const Text('Profil dan akun', style: TextStyle(fontSize: 12, color: AppTheme.textMuted)),
          ]),
          const SizedBox(height: 16),

          // Profile avatar card
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [Color(0xFF0F172A), Color(0xFF1E293B)], begin: Alignment.topLeft, end: Alignment.bottomRight),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(children: [
              CircleAvatar(radius: 28, backgroundColor: AppTheme.primary, child: Text(avatar, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: Colors.white))),
              const SizedBox(width: 14),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(user?.name ?? '', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Colors.white)),
                Text(user?.email ?? '', style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8))),
                const SizedBox(height: 6),
                Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3), decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(8)), child: Text(roleLabel, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Colors.white))),
              ])),
              Container(width: 8, height: 8, decoration: const BoxDecoration(color: Color(0xFF4ADE80), shape: BoxShape.circle)),
            ]),
          ),
          const SizedBox(height: 16),

          // Edit form
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppTheme.border)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Informasi Profil', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppTheme.textPrimary)),
              const SizedBox(height: 14),

              if (_error.isNotEmpty)
                Container(margin: const EdgeInsets.only(bottom: 10), padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: const Color(0xFFFEF2F2), borderRadius: BorderRadius.circular(10), border: Border.all(color: const Color(0xFFFECACA))), child: Text(_error, style: const TextStyle(color: AppTheme.danger, fontSize: 13))),
              if (_success.isNotEmpty)
                Container(margin: const EdgeInsets.only(bottom: 10), padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: const Color(0xFFF0FDF4), borderRadius: BorderRadius.circular(10), border: Border.all(color: const Color(0xFFBBF7D0))), child: Row(children: [const Icon(Icons.check_circle_rounded, size: 16, color: Color(0xFF15803D)), const SizedBox(width: 8), Text(_success, style: const TextStyle(color: Color(0xFF15803D), fontSize: 13))])),

              if (isOwner) ...[
                _lbl('Nama Bisnis'),
                TextField(
                  controller: _bizCtrl,
                  style: const TextStyle(fontSize: 14, color: AppTheme.textPrimary),
                  decoration: _fldDec(hint: 'Nama bisnis Anda'),
                ),
                const SizedBox(height: 12),
              ],

              _lbl('Nama Lengkap'),
              TextField(
                controller: _nameCtrl,
                style: const TextStyle(fontSize: 14, color: AppTheme.textPrimary),
                decoration: _fldDec(hint: 'Nama lengkap Anda'),
              ),
              const SizedBox(height: 12),

              _lbl('Email'),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
                decoration: BoxDecoration(color: const Color(0xFFF8FAFC), borderRadius: BorderRadius.circular(10), border: Border.all(color: AppTheme.border)),
                child: Row(children: [
                  Expanded(child: Text(user?.email ?? '', style: const TextStyle(fontSize: 14, color: AppTheme.textMuted))),
                  const Icon(Icons.lock_outline_rounded, size: 14, color: AppTheme.textMuted),
                ]),
              ),
              const SizedBox(height: 4),
              const Text('Email tidak bisa diubah', style: TextStyle(fontSize: 11, color: AppTheme.textMuted)),
              const SizedBox(height: 16),

              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _saving ? null : _save,
                  style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(vertical: 14), shape: const StadiumBorder(), elevation: 0),
                  child: _saving ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('Simpan Perubahan', style: TextStyle(fontWeight: FontWeight.w600)),
                ),
              ),
            ]),
          ),

          if (isOwner) ...[
            const SizedBox(height: 16),
            _QrisCard(org: _org, onDeleted: _load),
          ],

          const SizedBox(height: 16),
          Container(
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppTheme.border)),
            child: Column(children: [
              ListTile(
                leading: Container(width: 36, height: 36, decoration: BoxDecoration(color: const Color(0xFFFEF2F2), borderRadius: BorderRadius.circular(8)), child: const Icon(Icons.logout_rounded, color: AppTheme.danger, size: 18)),
                title: const Text('Keluar dari akun', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: AppTheme.danger)),
                subtitle: const Text('Anda perlu login lagi untuk mengakses Pantau', style: TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                onTap: () async {
                  final ok = await showDialog<bool>(context: context, builder: (_) => AlertDialog(
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    title: const Text('Keluar', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                    content: const Text('Yakin ingin keluar dari akun?', style: TextStyle(fontSize: 13)),
                    actions: [
                      TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Batal')),
                      ElevatedButton(onPressed: () => Navigator.pop(context, true), style: ElevatedButton.styleFrom(backgroundColor: AppTheme.danger, foregroundColor: Colors.white), child: const Text('Keluar')),
                    ],
                  ));
                  if (ok == true && mounted) await ref.read(authProvider.notifier).logout();
                },
              ),
            ]),
          ),
          const SizedBox(height: 24),
        ]),
      ),
    );
  }

  Widget _lbl(String t) => Padding(padding: const EdgeInsets.only(bottom: 6), child: Text(t, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: AppTheme.textPrimary)));

  InputDecoration _fldDec({String? hint}) => InputDecoration(
    hintText: hint, hintStyle: const TextStyle(color: AppTheme.textMuted, fontSize: 14),
    filled: true, fillColor: const Color(0xFFF9FAFB),
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.border)),
    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.border)),
    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.primary, width: 2)),
    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
  );
}

class _QrisCard extends StatefulWidget {
  final Map? org;
  final VoidCallback onDeleted;
  const _QrisCard({required this.org, required this.onDeleted});
  @override
  State<_QrisCard> createState() => _QrisCardState();
}

class _QrisCardState extends State<_QrisCard> {
  bool _uploading = false;
  bool _deleting  = false;
  String _error   = '';

  Future<void> _upload() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: ImageSource.gallery, imageQuality: 100);
    if (picked == null || !mounted) return;

    setState(() { _uploading = true; _error = ''; });
    try {
      // Compress to max 480px, JPEG 70% — same as web
      final compressed = await FlutterImageCompress.compressWithFile(
        picked.path,
        minWidth: 1, minHeight: 1,
        quality: 70,
      );
      if (compressed == null) throw Exception('Gagal mengompresi gambar');

      final base64Str = 'data:image/jpeg;base64,${base64Encode(compressed)}';

      await api.patch('/api/organization', data: {
        'qrisImageUrl': base64Str,
        'qrisPayload': null,
      });
      widget.onDeleted(); // reload parent
    } catch (e) {
      if (mounted) setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _delete() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Hapus QRIS', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
        content: const Text('Yakin ingin menghapus gambar QRIS?', style: TextStyle(fontSize: 13)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Batal')),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.danger, foregroundColor: Colors.white),
            child: const Text('Hapus'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _deleting = true);
    try {
      await api.patch('/api/organization', data: {'qrisImageUrl': null, 'qrisPayload': null});
      widget.onDeleted();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _deleting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final qrisUrl     = widget.org?['qrisImageUrl'] as String?;
    final qrisPayload = widget.org?['qrisPayload']  as String?;
    final hasQris     = qrisUrl != null && qrisUrl.isNotEmpty;
    final isDynamic   = qrisPayload != null && qrisPayload.isNotEmpty;

    Widget? imageWidget;
    if (hasQris) {
      if (qrisUrl.startsWith('data:image/')) {
        try {
          final bytes = base64Decode(qrisUrl.split(',').last);
          imageWidget = Image.memory(bytes, width: 110, height: 110, fit: BoxFit.contain);
        } catch (_) {}
      } else if (qrisUrl.startsWith('http')) {
        imageWidget = Image.network(qrisUrl, width: 110, height: 110, fit: BoxFit.contain);
      }
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppTheme.border)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width: 38, height: 38,
            decoration: BoxDecoration(color: const Color(0xFFDCFCE7), borderRadius: BorderRadius.circular(10)),
            child: const Icon(Icons.qr_code_2_rounded, color: Color(0xFF15803D), size: 22),
          ),
          const SizedBox(width: 12),
          const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('QRIS Pembayaran', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppTheme.textPrimary)),
            Text('QR code untuk pembayaran di kasir', style: TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
          ])),
        ]),
        const SizedBox(height: 16),

        if (_error.isNotEmpty) ...[
          Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(color: const Color(0xFFFEF2F2), borderRadius: BorderRadius.circular(10), border: Border.all(color: const Color(0xFFFECACA))),
            child: Row(children: [
              const Icon(Icons.error_outline_rounded, size: 14, color: AppTheme.danger),
              const SizedBox(width: 8),
              Expanded(child: Text(_error, style: const TextStyle(fontSize: 12, color: AppTheme.danger))),
            ]),
          ),
        ],
        if (imageWidget != null) ...[
          Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
            // Kiri — gambar + badge di bawahnya
            Column(crossAxisAlignment: CrossAxisAlignment.center, children: [
              Container(
                width: 110, height: 110,
                decoration: BoxDecoration(border: Border.all(color: AppTheme.border), borderRadius: BorderRadius.circular(12)),
                child: ClipRRect(borderRadius: BorderRadius.circular(11), child: imageWidget),
              ),
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: isDynamic ? const Color(0xFFDCFCE7) : const Color(0xFFFFF7ED),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(isDynamic ? Icons.check_circle_rounded : Icons.info_outline_rounded, size: 13, color: isDynamic ? const Color(0xFF15803D) : const Color(0xFF92400E)),
                  const SizedBox(width: 5),
                  Text(isDynamic ? 'Dinamis ✓' : 'Statis', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: isDynamic ? const Color(0xFF15803D) : const Color(0xFF92400E))),
                ]),
              ),
            ]),
            const SizedBox(width: 14),
            // Kanan — tombol saja
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              // Ganti QRIS
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: _uploading || _deleting ? null : _upload,
                  icon: _uploading
                    ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.upload_rounded, size: 15),
                  label: const Text('Ganti QRIS', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF15803D), foregroundColor: Colors.white, shape: const StadiumBorder(), elevation: 0, padding: const EdgeInsets.symmetric(vertical: 10)),
                ),
              ),
              const SizedBox(height: 8),
              // Hapus
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: _deleting || _uploading ? null : _delete,
                  icon: _deleting
                    ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.danger))
                    : const Icon(Icons.delete_outline_rounded, size: 15, color: AppTheme.danger),
                  label: const Text('Hapus', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.danger)),
                  style: OutlinedButton.styleFrom(shape: const StadiumBorder(), side: const BorderSide(color: AppTheme.danger), padding: const EdgeInsets.symmetric(vertical: 10)),
                ),
              ),
            ])),
          ]),
        ] else ...[
          const Text('Upload screenshot atau foto QRIS dari aplikasi bank Anda untuk ditampilkan di halaman kasir.', style: TextStyle(fontSize: 12, color: AppTheme.textSecondary, height: 1.5)),
          const SizedBox(height: 12),
          ElevatedButton.icon(
            onPressed: _uploading ? null : _upload,
            icon: _uploading
              ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : const Icon(Icons.upload_rounded, size: 18),
            label: const Text('Upload QRIS', style: TextStyle(fontWeight: FontWeight.w600)),
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary, foregroundColor: Colors.white, shape: const StadiumBorder(), elevation: 0),
          ),
          const SizedBox(height: 8),
          const Text('Format PNG, JPG, WEBP · Maks 10MB', style: TextStyle(fontSize: 11, color: AppTheme.textMuted)),
        ],
      ]),
    );
  }
}
