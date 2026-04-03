import 'dart:convert';
import 'package:http/http.dart' as http;
import '../core/constants.dart';

class ApiResult {
  final bool success;
  final String? message;
  final Map<String, dynamic>? data;

  ApiResult({required this.success, this.message, this.data});
}

class AuthApiService {
  static Uri _uri(String path) => Uri.parse('${AppConstants.apiBaseUrl}/$path');

  static Future<ApiResult> signup({
    required String name,
    required String email,
    required String mobile,
    required String password,
  }) async {
    return _post('signup', {
      'name': name,
      'email': email,
      'mobile': mobile,
      'password': password,
    });
  }

  static Future<ApiResult> login({
    required String identifier,
    required String password,
  }) async {
    return _post('login', {
      'identifier': identifier,
      'password': password,
    });
  }

  static Future<ApiResult> forgotPassword({required String email}) async {
    return _post('forgot-password', {'email': email});
  }

  static Future<ApiResult> verifyOtp({required String email, required String otp}) async {
    return _post('verify-otp', {'email': email, 'otp': otp});
  }

  static Future<ApiResult> resetPassword({
    required String email,
    required String otp,
    required String newPassword,
  }) async {
    return _post('reset-password', {
      'email': email,
      'otp': otp,
      'newPassword': newPassword,
    });
  }

  static Future<ApiResult> _post(String path, Map<String, dynamic> body) async {
    try {
      final response = await http.post(
        _uri(path),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(body),
      );

      final parsed = jsonDecode(response.body) as Map<String, dynamic>;
      final success = parsed['success'] == true;

      if (response.statusCode >= 200 && response.statusCode < 300) {
        return ApiResult(
          success: success,
          message: (parsed['message'] ?? 'Success').toString(),
          data: parsed['data'] is Map<String, dynamic> ? parsed['data'] as Map<String, dynamic> : null,
        );
      }

      return ApiResult(
        success: false,
        message: (parsed['error'] ?? parsed['message'] ?? 'Request failed').toString(),
      );
    } catch (_) {
      return ApiResult(success: false, message: 'Network error. Please try again.');
    }
  }
}
