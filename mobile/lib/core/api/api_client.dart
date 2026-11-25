import 'package:dio/dio.dart';
import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path_provider/path_provider.dart';
import 'dart:convert';

const String kApiBase = String.fromEnvironment(
  'API_BASE',
  defaultValue: 'http://10.0.2.2:3000',
);

String resolveApiUrl(String url) {
  final uri = Uri.tryParse(url);
  if (uri != null && uri.hasScheme) return url;
  return Uri.parse('${kApiBase.replaceFirst(RegExp(r'/$'), '')}/')
      .resolve(url)
      .toString();
}

const _storage = FlutterSecureStorage();
const _sessionKey = 'pantau_session';

class ApiClient {
  static final ApiClient _instance = ApiClient._internal();
  factory ApiClient() => _instance;

  late final Dio _dio;
  late PersistCookieJar _cookieJar;
  bool _ready = false;

  ApiClient._internal() {
    _dio = Dio(BaseOptions(
      baseUrl: kApiBase,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 15),
      headers: {'Content-Type': 'application/json'},
    ));
    _dio.interceptors.add(_AuthInterceptor());
  }

  Future<void> init() async {
    if (_ready) return;
    final dir = await getApplicationDocumentsDirectory();
    _cookieJar = PersistCookieJar(storage: FileStorage('${dir.path}/.cookies/'));
    _dio.interceptors.insert(0, CookieManager(_cookieJar));
    _ready = true;
  }

  Future<dynamic> get(String path, {Map<String, dynamic>? params}) async {
    final res = await _dio.get(path, queryParameters: params);
    return res.data;
  }

  Future<dynamic> post(String path, {dynamic data}) async {
    final res = await _dio.post(path, data: data);
    return res.data;
  }

  Future<dynamic> postMultipart(String path, {required FormData data}) async {
    final res = await _dio.post(
      path,
      data: data,
      options: Options(contentType: 'multipart/form-data'),
    );
    return res.data;
  }

  Future<dynamic> put(String path, {dynamic data}) async {
    final res = await _dio.put(path, data: data);
    return res.data;
  }

  Future<dynamic> delete(String path) async {
    final res = await _dio.delete(path);
    return res.data;
  }

  Future<dynamic> deleteWithBody(String path, {dynamic data}) async {
    final res = await _dio.delete(path, data: data);
    return res.data;
  }

  Future<dynamic> patch(String path, {dynamic data}) async {
    final res = await _dio.patch(path, data: data);
    return res.data;
  }

  Future<Map<String, dynamic>> login(String email, String password) async {
    final csrfRes = await _dio.get('/api/auth/csrf');
    final csrf = csrfRes.data['csrfToken'] as String;

    await _dio.post(
      '/api/auth/callback/credentials',
      data: 'email=${Uri.encodeComponent(email)}&password=${Uri.encodeComponent(password)}&csrfToken=$csrf&redirect=false',
      options: Options(
        contentType: 'application/x-www-form-urlencoded',
        followRedirects: false,
        validateStatus: (s) => s != null && s < 500,
      ),
    );

    final sessionRes = await _dio.get('/api/auth/session');
    final session = sessionRes.data as Map<String, dynamic>;
    if (session['user'] == null) throw Exception('Login gagal. Cek email & password.');

    await _storage.write(key: _sessionKey, value: jsonEncode(session));
    return session;
  }

  Future<void> logout() async {
    try { await _dio.get('/api/auth/signout'); } catch (_) {}
    await _storage.delete(key: _sessionKey);
    await _cookieJar.deleteAll();
  }

  Future<Map<String, dynamic>?> getStoredSession() async {
    final raw = await _storage.read(key: _sessionKey);
    if (raw == null) return null;
    try { return jsonDecode(raw) as Map<String, dynamic>; } catch (_) { return null; }
  }
}

/// Beberapa endpoint daftar sudah dipaginasi dan mengembalikan
/// `{ items, total, page, pages }`, sebagian lain masih array polos.
/// Helper ini menerima keduanya.
List asList(dynamic data) {
  if (data is List) return data;
  if (data is Map && data['items'] is List) return data['items'] as List;
  return const [];
}

// Dipanggil ketika API return 401 — auth_provider.dart mendaftarkan handler-nya
typedef VoidCallback = void Function();
VoidCallback? onUnauthorized;

class _AuthInterceptor extends Interceptor {
  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    if (err.response?.statusCode == 401) {
      onUnauthorized?.call();
    }
    final msg = _extractError(err);
    handler.reject(DioException(
      requestOptions: err.requestOptions, error: msg,
      response: err.response, type: err.type,
    ));
  }

  String _extractError(DioException err) {
    try {
      if (err.response?.data is Map) return err.response!.data['error'] ?? 'Terjadi kesalahan';
    } catch (_) {}
    if (err.type == DioExceptionType.connectionTimeout || err.type == DioExceptionType.receiveTimeout) {
      return 'Koneksi timeout. Periksa jaringan kamu.';
    }
    if (err.type == DioExceptionType.connectionError) return 'Tidak dapat terhubung ke server.';
    return 'HTTP ${err.response?.statusCode ?? "?"}';
  }
}

final api = ApiClient();
