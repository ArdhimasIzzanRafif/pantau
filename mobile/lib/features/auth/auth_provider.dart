import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../shared/models/models.dart';
import '../../core/api/api_client.dart';

class AuthState {
  final AuthUser? user;
  final bool loading;
  const AuthState({this.user, this.loading = true});
  AuthState copyWith({AuthUser? user, bool? loading}) =>
      AuthState(user: user ?? this.user, loading: loading ?? this.loading);
}

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier() : super(const AuthState()) {
    // Kalau API return 401 → sesi habis → logout otomatis
    onUnauthorized = () {
      if (state.user != null) _forceLogout();
    };
    _restore();
  }

  Future<void> _restore() async {
    final session = await api.getStoredSession();
    if (session?['user'] != null) {
      state = AuthState(user: AuthUser.fromJson(session!['user']), loading: false);
    } else {
      state = const AuthState(loading: false);
    }
  }

  Future<void> _forceLogout() async {
    await api.logout();
    state = const AuthState(loading: false);
  }

  Future<void> login(String email, String password) async {
    final session = await api.login(email, password);
    state = state.copyWith(user: AuthUser.fromJson(session['user']), loading: false);
  }

  Future<void> logout() async {
    await api.logout();
    state = const AuthState(loading: false);
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) => AuthNotifier());
