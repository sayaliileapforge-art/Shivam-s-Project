# Flutter Auth App

This folder contains a Flutter authentication UI wired to backend auth APIs.

## Screens
- Login (`email/mobile + password`)
- Signup (`name, email, mobile, password`)
- Forgot Password (`email`)
- OTP Verification (`email + otp`)
- Reset Password (`email + otp + new password`)

## Validation behavior
- Mobile regex: `^[6-9]\d{9}$`
- Invalid mobile message: `Invalid mobile number`
- Prevents API calls when mobile is invalid
- Uses `SnackBar` for errors/success
- Shows loading indicator on each API request

## Configure backend URL
Edit `lib/core/constants.dart`:

```dart
static const String apiBaseUrl = 'http://localhost:5000/api/auth';
```

## Run
```bash
flutter pub get
flutter run
```
