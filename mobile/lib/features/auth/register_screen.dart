import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import 'auth_provider.dart';

const _businessTypes = [
  ('fnb',    'F&B — Restoran / Kafe / Burger'),
  ('retail', 'Retail — Toko / Minimarket'),
  ('bakery', 'Bakery / Roti'),
  ('mixed',  'Campuran F&B + Retail'),
];

const _outletCounts = [
  ('1',    '1 outlet'),
  ('2-5',  '2–5 outlet'),
  ('6-10', '6–10 outlet'),
  ('10+',  'Lebih dari 10 outlet'),
];

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});
  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  int _step = 0;

  // Step 0
  final _nameCtrl     = TextEditingController();
  final _emailCtrl    = TextEditingController();
  final _phoneCtrl    = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _obscure = true;

  // Step 1
  final _bizNameCtrl = TextEditingController();
  String _bizType = '', _outletCount = '';

  bool _loading = false;
  String _error = '';

  @override
  void dispose() {
    _nameCtrl.dispose(); _emailCtrl.dispose(); _phoneCtrl.dispose();
    _passwordCtrl.dispose(); _bizNameCtrl.dispose();
    super.dispose();
  }

  void _nextStep() {
    setState(() => _error = '');
    if (_nameCtrl.text.trim().isEmpty ||
        _emailCtrl.text.trim().isEmpty ||
        _phoneCtrl.text.trim().isEmpty ||
        _passwordCtrl.text.isEmpty) {
      setState(() => _error = 'Semua field wajib diisi');
      return;
    }
    if (_passwordCtrl.text.length < 8) {
      setState(() => _error = 'Password minimal 8 karakter');
      return;
    }
    setState(() => _step = 1);
  }

  Future<void> _submit() async {
    setState(() => _error = '');
    if (_bizNameCtrl.text.trim().isEmpty || _bizType.isEmpty || _outletCount.isEmpty) {
      setState(() => _error = 'Semua field wajib diisi');
      return;
    }
    setState(() { _loading = true; });
    try {
      await api.post('/api/register', data: {
        'name':         _nameCtrl.text.trim(),
        'email':        _emailCtrl.text.trim(),
        'phone':        _phoneCtrl.text.trim(),
        'password':     _passwordCtrl.text,
        'businessName': _bizNameCtrl.text.trim(),
        'businessType': _bizType,
      });
      // Auto-login
      await ref.read(authProvider.notifier).login(
        _emailCtrl.text.trim(), _passwordCtrl.text,
      );
      // Router redirect akan handle ke /pending
    } catch (e) {
      if (mounted) setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 28),
          child: ConstrainedBox(
            constraints: BoxConstraints(
              minHeight: MediaQuery.of(context).size.height
                  - MediaQuery.of(context).padding.top
                  - MediaQuery.of(context).padding.bottom,
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
              const SizedBox(height: 16),

              // Logo
              Row(children: [
                Container(
                  width: 40, height: 40,
                  decoration: BoxDecoration(color: AppTheme.primary, borderRadius: BorderRadius.circular(10)),
                  child: const Icon(Icons.bar_chart_rounded, color: Colors.white, size: 22),
                ),
                const SizedBox(width: 10),
                const Text('Pantau', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppTheme.textPrimary)),
              ]),

              const SizedBox(height: 32),

              // Step indicator
              _StepIndicator(step: _step),

              const SizedBox(height: 28),

              // Error
              if (_error.isNotEmpty) ...[
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFEF2F2),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: const Color(0xFFFECACA)),
                  ),
                  child: Row(children: [
                    const Icon(Icons.error_outline_rounded, color: Color(0xFFEF4444), size: 16),
                    const SizedBox(width: 8),
                    Expanded(child: Text(_error, style: const TextStyle(fontSize: 13, color: Color(0xFFB91C1C)))),
                  ]),
                ),
              ],

              // ── Step 0: Akun ──
              if (_step == 0) ...[
                const Text('Buat akun Anda', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w300, color: AppTheme.textPrimary, letterSpacing: -0.5)),
                const SizedBox(height: 6),
                const Text('Gratis 14 hari, tidak perlu kartu kredit', style: TextStyle(fontSize: 13, color: AppTheme.textSecondary)),
                const SizedBox(height: 28),

                _lbl('Nama Lengkap'),
                _tf(_nameCtrl, 'Budi Santoso', TextInputType.name),
                const SizedBox(height: 16),

                _lbl('Email'),
                _tf(_emailCtrl, 'budi@toko.com', TextInputType.emailAddress),
                const SizedBox(height: 16),

                _lbl('Nomor WhatsApp'),
                _tf(_phoneCtrl, '08xxxxxxxxxx', TextInputType.phone),
                const SizedBox(height: 16),

                _lbl('Password'),
                TextField(
                  controller: _passwordCtrl,
                  obscureText: _obscure,
                  style: const TextStyle(fontSize: 14, color: AppTheme.textPrimary),
                  decoration: _dec('Minimal 8 karakter', suffix: GestureDetector(
                    onTap: () => setState(() => _obscure = !_obscure),
                    child: Icon(_obscure ? Icons.remove_red_eye_outlined : Icons.visibility_off_outlined, size: 20, color: AppTheme.textMuted),
                  )),
                ),
                const SizedBox(height: 28),

                SizedBox(
                  width: double.infinity, height: 52,
                  child: ElevatedButton(
                    onPressed: _nextStep,
                    style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary, foregroundColor: Colors.white, shape: const StadiumBorder(), elevation: 0),
                    child: const Text('Lanjut', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                  ),
                ),
              ],

              // ── Step 1: Info Bisnis ──
              if (_step == 1) ...[
                const Text('Info bisnis Anda', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w300, color: AppTheme.textPrimary, letterSpacing: -0.5)),
                const SizedBox(height: 6),
                const Text('Kami sesuaikan sistem untuk kebutuhan Anda', style: TextStyle(fontSize: 13, color: AppTheme.textSecondary)),
                const SizedBox(height: 28),

                _lbl('Nama Bisnis'),
                _tf(_bizNameCtrl, 'Burger Bali / Toko Sumber Rejeki', TextInputType.text),
                const SizedBox(height: 16),

                _lbl('Jenis Usaha'),
                _dropdown(
                  value: _bizType.isEmpty ? null : _bizType,
                  hint: 'Pilih jenis usaha',
                  items: _businessTypes.map((t) => DropdownMenuItem(value: t.$1, child: Text(t.$2, style: const TextStyle(fontSize: 13)))).toList(),
                  onChanged: (v) => setState(() => _bizType = v ?? ''),
                ),
                const SizedBox(height: 16),

                _lbl('Jumlah Outlet'),
                _dropdown(
                  value: _outletCount.isEmpty ? null : _outletCount,
                  hint: 'Pilih jumlah outlet',
                  items: _outletCounts.map((t) => DropdownMenuItem(value: t.$1, child: Text(t.$2, style: const TextStyle(fontSize: 13)))).toList(),
                  onChanged: (v) => setState(() => _outletCount = v ?? ''),
                ),
                const SizedBox(height: 28),

                Row(children: [
                  Expanded(child: OutlinedButton(
                    onPressed: () => setState(() { _step = 0; _error = ''; }),
                    style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 15), shape: const StadiumBorder(), side: const BorderSide(color: AppTheme.border)),
                    child: const Text('Kembali', style: TextStyle(color: AppTheme.textSecondary, fontWeight: FontWeight.w600)),
                  )),
                  const SizedBox(width: 12),
                  Expanded(child: ElevatedButton(
                    onPressed: _loading ? null : _submit,
                    style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(vertical: 15), shape: const StadiumBorder(), elevation: 0),
                    child: _loading
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                      : const Text('Buat Akun', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                  )),
                ]),
              ],

              const SizedBox(height: 32),

              // Login link
              Center(child: GestureDetector(
                onTap: () => context.go('/login'),
                child: RichText(text: const TextSpan(
                  text: 'Sudah punya akun? ',
                  style: TextStyle(fontSize: 13, color: AppTheme.textSecondary),
                  children: [TextSpan(text: 'Masuk', style: TextStyle(color: AppTheme.primary, fontWeight: FontWeight.w700))],
                )),
              )),
              const SizedBox(height: 24),
            ]),
          ),
        ),
      ),
    );
  }

  Widget _lbl(String t) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Text(t, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textPrimary)),
  );

  InputDecoration _dec(String hint, {Widget? suffix}) => InputDecoration(
    hintText: hint, hintStyle: const TextStyle(color: AppTheme.textMuted, fontSize: 14),
    filled: true, fillColor: const Color(0xFFF9FAFB),
    suffixIcon: suffix != null ? Padding(padding: const EdgeInsets.only(right: 14), child: suffix) : null,
    suffixIconConstraints: const BoxConstraints(),
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFFE5E7EB))),
    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFFE5E7EB))),
    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppTheme.primary, width: 1.5)),
    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
  );

  Widget _tf(TextEditingController c, String hint, TextInputType type) => TextField(
    controller: c, keyboardType: type, autocorrect: false,
    textCapitalization: type == TextInputType.name ? TextCapitalization.words : TextCapitalization.none,
    style: const TextStyle(fontSize: 14, color: AppTheme.textPrimary),
    decoration: _dec(hint),
  );

  Widget _dropdown<T>({required T? value, required String hint, required List<DropdownMenuItem<T>> items, required ValueChanged<T?> onChanged}) =>
    DropdownButtonFormField<T>(
      initialValue: value,
      hint: Text(hint, style: const TextStyle(color: AppTheme.textMuted, fontSize: 14)),
      onChanged: onChanged,
      style: const TextStyle(fontSize: 13, color: AppTheme.textPrimary),
      decoration: _dec(''),
      items: items,
    );
}

class _StepIndicator extends StatelessWidget {
  final int step;
  const _StepIndicator({required this.step});

  @override
  Widget build(BuildContext context) {
    final lineColor = step >= 1 ? AppTheme.primary : const Color(0xFFE5E7EB);
    return Center(
      child: SizedBox(
        width: 220, height: 54,
        child: Stack(clipBehavior: Clip.none, children: [
          // Garis — mulai & berakhir di tepi lingkaran
          Positioned(top: 14, left: 30, right: 30,
            child: Container(height: 2, color: lineColor)),
          // Lingkaran kiri
          Positioned(top: 0, left: 0, child: _circle(0)),
          // Lingkaran kanan
          Positioned(top: 0, right: 0, child: _circle(1)),
          // Label kiri — 70px lebar, center tepat di tengah lingkaran kiri
          Positioned(top: 36, left: -20, width: 70,
            child: Text('Akun Anda', textAlign: TextAlign.center, maxLines: 1,
              style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600,
                color: step == 0 ? AppTheme.primary : AppTheme.textMuted))),
          // Label kanan — 70px lebar, center tepat di tengah lingkaran kanan
          Positioned(top: 36, right: -20, width: 70,
            child: Text('Info Bisnis', textAlign: TextAlign.center, maxLines: 1,
              style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600,
                color: step == 1 ? AppTheme.primary : AppTheme.textMuted))),
        ]),
      ),
    );
  }

  Widget _circle(int index) {
    final done   = step > index;
    final active = step == index;
    return Container(
      width: 30, height: 30,
      decoration: BoxDecoration(
        color: done || active ? AppTheme.primary : const Color(0xFFF1F5F9),
        shape: BoxShape.circle,
        border: active ? Border.all(color: AppTheme.primary.withValues(alpha: 0.25), width: 4) : null,
      ),
      child: Center(child: done
        ? const Icon(Icons.check_rounded, color: Colors.white, size: 14)
        : Text('${index + 1}', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: active ? Colors.white : AppTheme.textMuted)),
      ),
    );
  }
}
