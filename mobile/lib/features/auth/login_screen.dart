import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_theme.dart';
import 'auth_provider.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _emailCtrl    = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _loading = false;
  bool _obscure = true;
  String _error = '';

  Future<void> _login() async {
    FocusScope.of(context).unfocus();
    final email = _emailCtrl.text.trim();
    final pass  = _passwordCtrl.text;
    if (email.isEmpty || pass.isEmpty) {
      setState(() => _error = 'Email dan password wajib diisi');
      return;
    }
    setState(() { _loading = true; _error = ''; });
    try {
      await ref.read(authProvider.notifier).login(email, pass);
    } catch (e) {
      if (mounted) setState(() => _error = 'Email atau password salah');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void dispose() { _emailCtrl.dispose(); _passwordCtrl.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 28),
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: MediaQuery.of(context).size.height - MediaQuery.of(context).padding.top - MediaQuery.of(context).padding.bottom),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
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

              const SizedBox(height: 44),

              const Text('Selamat datang\nkembali!', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: AppTheme.textPrimary, height: 1.2, letterSpacing: -0.5)),
              const SizedBox(height: 10),
              const Text('Masukkan email dan password untuk melanjutkan.', style: TextStyle(fontSize: 13, color: AppTheme.textSecondary, height: 1.5)),

              const SizedBox(height: 36),

              if (_error.isNotEmpty) ...[
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  margin: const EdgeInsets.only(bottom: 20),
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

              const _Label('Email', required: true),
              const SizedBox(height: 8),
              _Field(controller: _emailCtrl, hint: 'nama@bisnis.com', keyboardType: TextInputType.emailAddress, onSubmit: _login),
              const SizedBox(height: 20),

              const _Label('Password', required: true),
              const SizedBox(height: 8),
              _Field(
                controller: _passwordCtrl,
                hint: 'Masukkan password',
                obscure: _obscure,
                onSubmit: _login,
                suffix: GestureDetector(
                  onTap: () => setState(() => _obscure = !_obscure),
                  child: Icon(_obscure ? Icons.remove_red_eye_outlined : Icons.visibility_off_outlined, size: 20, color: AppTheme.textMuted),
                ),
              ),

              const SizedBox(height: 32),

              SizedBox(
                width: double.infinity, height: 52,
                child: ElevatedButton(
                  onPressed: _loading ? null : _login,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primary, foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    elevation: 0, disabledBackgroundColor: const Color(0xFF93C5FD),
                  ),
                  child: _loading
                    ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                    : const Text('Login', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                ),
              ),

              const SizedBox(height: 28),
              Center(child: TextButton(
                onPressed: () => context.go('/register'),
                style: TextButton.styleFrom(padding: EdgeInsets.zero),
                child: RichText(text: const TextSpan(
                  text: 'Belum punya akun? ',
                  style: TextStyle(fontSize: 13, color: AppTheme.textSecondary),
                  children: [TextSpan(text: 'Daftar gratis', style: TextStyle(color: AppTheme.primary, fontWeight: FontWeight.w700))],
                )),
              )),
              const SizedBox(height: 20),
              Center(child: Text('Pantau © 2025', style: TextStyle(fontSize: 11, color: Colors.grey.shade400))),
            ]),
          ),
        ),
      ),
    );
  }
}

class _Label extends StatelessWidget {
  final String text;
  final bool required;
  const _Label(this.text, {this.required = false});

  @override
  Widget build(BuildContext context) => Row(children: [
    Text(text, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textPrimary)),
    if (required) ...[
      const SizedBox(width: 3),
      const Text('*', style: TextStyle(color: Color(0xFFEF4444), fontSize: 13, fontWeight: FontWeight.w700)),
    ],
  ]);
}

class _Field extends StatelessWidget {
  final TextEditingController controller;
  final String hint;
  final bool obscure;
  final TextInputType? keyboardType;
  final Widget? suffix;
  final VoidCallback? onSubmit;

  const _Field({required this.controller, required this.hint, this.obscure = false, this.keyboardType, this.suffix, this.onSubmit});

  @override
  Widget build(BuildContext context) => TextField(
    controller: controller, obscureText: obscure, keyboardType: keyboardType,
    autocorrect: false, textCapitalization: TextCapitalization.none,
    style: const TextStyle(fontSize: 14, color: AppTheme.textPrimary),
    onSubmitted: onSubmit != null ? (_) => onSubmit!() : null,
    decoration: InputDecoration(
      hintText: hint, hintStyle: const TextStyle(color: AppTheme.textMuted, fontSize: 14),
      filled: true, fillColor: const Color(0xFFF9FAFB),
      suffixIcon: suffix != null ? Padding(padding: const EdgeInsets.only(right: 14), child: suffix) : null,
      suffixIconConstraints: const BoxConstraints(),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFFE5E7EB))),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFFE5E7EB))),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppTheme.primary, width: 1.5)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
    ),
  );
}
