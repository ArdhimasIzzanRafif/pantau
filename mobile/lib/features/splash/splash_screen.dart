import 'package:flutter/material.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with TickerProviderStateMixin {
  late final AnimationController _logoCtrl;
  late final AnimationController _taglineCtrl;
  late final AnimationController _dotCtrl;

  late final Animation<double> _logoFade;
  late final Animation<Offset> _logoSlide;
  late final Animation<double> _taglineFade;
  late final Animation<double> _dotScale;

  @override
  void initState() {
    super.initState();

    _logoCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 700));
    _taglineCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 500));
    _dotCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200))
      ..repeat(reverse: true);

    _logoFade = CurvedAnimation(parent: _logoCtrl, curve: Curves.easeOut);
    _logoSlide = Tween<Offset>(begin: const Offset(0, 0.18), end: Offset.zero)
        .animate(CurvedAnimation(parent: _logoCtrl, curve: Curves.easeOut));
    _taglineFade = CurvedAnimation(parent: _taglineCtrl, curve: Curves.easeOut);
    _dotScale = Tween<double>(begin: 0.6, end: 1.0)
        .animate(CurvedAnimation(parent: _dotCtrl, curve: Curves.easeInOut));

    _logoCtrl.forward().then((_) {
      Future.delayed(const Duration(milliseconds: 100), () {
        if (mounted) _taglineCtrl.forward();
      });
    });
  }

  @override
  void dispose() {
    _logoCtrl.dispose();
    _taglineCtrl.dispose();
    _dotCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Stack(children: [
        // Background subtle gradient
        Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF0F172A), Color(0xFF1E293B)],
            ),
          ),
        ),

        // Subtle grid dots pattern
        Positioned.fill(
          child: CustomPaint(painter: _GridPainter()),
        ),

        // Center content
        Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            // Logo mark — animated dot + wordmark
            SlideTransition(
              position: _logoSlide,
              child: FadeTransition(
                opacity: _logoFade,
                child: Column(children: [
                  // Icon mark
                  ScaleTransition(
                    scale: _dotScale,
                    child: Container(
                      width: 72, height: 72,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(20),
                        gradient: const LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [Color(0xFF3B82F6), Color(0xFF1D4ED8)],
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: const Color(0xFF3B82F6).withValues(alpha: 0.4),
                            blurRadius: 24,
                            spreadRadius: 2,
                          ),
                        ],
                      ),
                      child: const Center(
                        child: Text('P', style: TextStyle(fontSize: 38, fontWeight: FontWeight.w800, color: Colors.white, height: 1)),
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  // Wordmark
                  const Text(
                    'PANTAU',
                    style: TextStyle(
                      fontSize: 34,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                      letterSpacing: 6,
                    ),
                  ),
                ]),
              ),
            ),

            const SizedBox(height: 12),

            // Tagline
            FadeTransition(
              opacity: _taglineFade,
              child: const Text(
                'Operational Command Center',
                style: TextStyle(fontSize: 13, color: Color(0xFF64748B), letterSpacing: 1.2),
              ),
            ),
          ]),
        ),

        // Loading indicator at bottom
        Positioned(
          bottom: 56,
          left: 0, right: 0,
          child: FadeTransition(
            opacity: _taglineFade,
            child: Column(children: [
              SizedBox(
                width: 24, height: 24,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  valueColor: AlwaysStoppedAnimation<Color>(
                    const Color(0xFF3B82F6).withValues(alpha: 0.6),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              const Text(
                'Memuat...',
                style: TextStyle(fontSize: 11, color: Color(0xFF475569), letterSpacing: 0.5),
              ),
            ]),
          ),
        ),
      ]),
    );
  }
}

class _GridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = const Color(0xFF1E293B).withValues(alpha: 0.6)
      ..strokeWidth = 0.5;
    const spacing = 40.0;
    for (double x = 0; x < size.width; x += spacing) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
    for (double y = 0; y < size.height; y += spacing) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
  }

  @override
  bool shouldRepaint(_GridPainter _) => false;
}
