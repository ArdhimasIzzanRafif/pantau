import 'package:flutter/material.dart';
import '../../shared/widgets/widgets.dart';

class AdminScreen extends StatefulWidget {
  const AdminScreen({super.key});
  @override
  State<AdminScreen> createState() => _AdminScreenState();
}

class _AdminScreenState extends State<AdminScreen> {
  final bool _loading = false;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Admin')),
    body: _loading ? const LoadingCenter() : const EmptyState(
      icon: Icons.admin_panel_settings_rounded,
      title: 'Memuat...',
      subtitle: 'Fitur lengkap segera hadir',
    ),
  );
}
