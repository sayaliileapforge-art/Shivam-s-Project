import 'package:flutter/material.dart';
import '../core/constants.dart';
import '../core/snackbar.dart';
import '../services/auth_api_service.dart';

class SignupScreen extends StatefulWidget {
  const SignupScreen({super.key});

  @override
  State<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends State<SignupScreen> {
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _mobileController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _loading = false;

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _mobileController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final name = _nameController.text.trim();
    final email = _emailController.text.trim();
    final mobile = _mobileController.text.trim();
    final password = _passwordController.text;

    if (name.isEmpty || email.isEmpty || mobile.isEmpty || password.isEmpty) {
      showAppSnackBar(context, 'All fields are required');
      return;
    }

    if (!AppConstants.emailRegex.hasMatch(email)) {
      showAppSnackBar(context, 'Invalid email format');
      return;
    }

    if (!AppConstants.mobileRegex.hasMatch(mobile)) {
      showAppSnackBar(context, 'Invalid mobile number');
      return;
    }

    setState(() => _loading = true);
    final result = await AuthApiService.signup(
      name: name,
      email: email,
      mobile: mobile,
      password: password,
    );
    setState(() => _loading = false);

    if (!mounted) return;

    if (!result.success) {
      showAppSnackBar(context, result.message ?? 'Signup failed');
      return;
    }

    showAppSnackBar(context, 'Signup successful', isError: false);
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Signup')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            TextField(
              controller: _nameController,
              decoration: const InputDecoration(labelText: 'Name', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _emailController,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _mobileController,
              keyboardType: TextInputType.phone,
              maxLength: 10,
              decoration: const InputDecoration(labelText: 'Mobile', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _passwordController,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Password', border: OutlineInputBorder()),
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
                    : const Text('Signup'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
