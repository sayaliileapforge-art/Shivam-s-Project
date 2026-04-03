import 'package:flutter/material.dart';
import '../core/constants.dart';
import '../core/snackbar.dart';
import '../services/auth_api_service.dart';

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _emailController = TextEditingController();
  bool _loading = false;

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final email = _emailController.text.trim();
    if (!AppConstants.emailRegex.hasMatch(email)) {
      showAppSnackBar(context, 'Invalid email format');
      return;
    }

    setState(() => _loading = true);
    final result = await AuthApiService.forgotPassword(email: email);
    setState(() => _loading = false);

    if (!mounted) return;

    if (!result.success) {
      showAppSnackBar(context, result.message ?? 'Unable to send OTP');
      return;
    }

    showAppSnackBar(context, result.message ?? 'OTP sent', isError: false);
    Navigator.pushNamed(context, '/verify-otp', arguments: {'email': email});
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Forgot Password')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            TextField(
              controller: _emailController,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(
                labelText: 'Email',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _loading ? null : _submit,
                child: _loading
                    ? const SizedBox(
                        height: 18,
                        width: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Send OTP'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
