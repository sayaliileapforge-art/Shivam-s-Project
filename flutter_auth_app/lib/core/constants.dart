class AppConstants {
  static const String apiBaseUrl = 'http://localhost:5000/api/auth';
  static final RegExp emailRegex = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');
  static final RegExp mobileRegex = RegExp(r'^[6-9]\d{9}$');
}
