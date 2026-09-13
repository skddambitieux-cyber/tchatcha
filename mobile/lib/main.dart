import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';

const apiUrl = String.fromEnvironment(
  'API_URL',
  defaultValue: 'http://10.0.2.2:3000/api/v1',
);

String get apiBaseUrl => apiUrl.endsWith('/api/v1') ? apiUrl : '$apiUrl/api/v1';

class ApiResponse {
  const ApiResponse(this.statusCode, this.body);

  final int statusCode;
  final String body;
}

typedef ApiPost = Future<ApiResponse> Function(
  String path,
  Map<String, dynamic> body,
);

class AuthApi {
  const AuthApi({this.postOverride});

  final ApiPost? postOverride;

  Future<ApiResponse> post(String path, Map<String, dynamic> body) async {
    if (postOverride != null) return postOverride!(path, body);
    final client = HttpClient();
    client.connectionTimeout = const Duration(seconds: 10);
    try {
      final request = await client.postUrl(Uri.parse('$apiBaseUrl$path'));
      request.headers.contentType = ContentType.json;
      request.write(jsonEncode(body));
      final response = await request.close();
      return ApiResponse(
        response.statusCode,
        await response.transform(utf8.decoder).join(),
      );
    } finally {
      client.close();
    }
  }
}

void main() => runApp(const TchatchaApp());

class TchatchaApp extends StatelessWidget {
  const TchatchaApp({super.key, this.api = const AuthApi()});

  final AuthApi api;

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'TCHATCHA',
    theme: ThemeData(
      colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0B6E69)),
      useMaterial3: true,
    ),
    home: AuthPage(api: api),
  );
}

enum AuthMode { login, register }

class AuthPage extends StatefulWidget {
  const AuthPage({super.key, required this.api});

  final AuthApi api;

  @override
  State<AuthPage> createState() => _AuthPageState();
}

class _AuthPageState extends State<AuthPage> {
  final phone = TextEditingController();
  final code = TextEditingController();
  final fullName = TextEditingController();
  AuthMode mode = AuthMode.login;
  String? requestedPhone;
  bool verified = false;
  bool loading = false;
  String? message;
  String? successRole;
  bool showLoginSwitch = false;

  bool get requested => requestedPhone != null;
  @override
  void dispose() {
    phone.dispose();
    code.dispose();
    fullName.dispose();
    super.dispose();
  }

  void selectMode(AuthMode next) {
    setState(() {
      mode = next;
      requestedPhone = null;
      verified = false;
      message = null;
      showLoginSwitch = false;
      code.clear();
    });
  }

  Future<void> submit() async {
    if (successRole != null) return;
    final currentPhone = requestedPhone ?? phone.text.trim();
    if (!requested && !RegExp(r'^\d{8,15}$').hasMatch(currentPhone)) {
      setState(() => message = 'Saisissez un numéro de 8 à 15 chiffres.');
      return;
    }
    if (requested &&
        !verified &&
        !RegExp(r'^\d{6}$').hasMatch(code.text.trim())) {
      setState(() => message = 'Saisissez un code OTP à 6 chiffres.');
      return;
    }
    if (mode == AuthMode.register && verified) {
      if (fullName.text.trim().length < 2 || fullName.text.trim().length > 80) {
        setState(() => message = 'Saisissez un nom de 2 à 80 caractères.');
        return;
      }
    }

    setState(() {
      loading = true;
      message = null;
    });

    final String path;
    final Map<String, dynamic> body;
    if (!requested) {
      path = '/auth/otp/request';
      body = {
        'country_code': 'BJ',
        'phone': currentPhone,
        'purpose': mode == AuthMode.login ? 'LOGIN' : 'REGISTER',
      };
    } else if (!verified) {
      path = '/auth/otp/verify';
      body = {
        'country_code': 'BJ',
        'phone': requestedPhone,
        'code': code.text.trim(),
        'purpose': mode == AuthMode.login ? 'LOGIN' : 'REGISTER',
        'device': {'session_id': 'flutter-demo'},
      };
    } else {
      path = '/auth/register';
      body = {
        'country_code': 'BJ',
        'phone': requestedPhone,
        'full_name': fullName.text.trim(),
        'role': 'CLIENT',
        'consents': {'cgv': true, 'privacy': true},
        'device': {'session_id': 'flutter-demo'},
      };
    }

    try {
      final response = await widget.api.post(path, body);
      if (!mounted) return;
      final expectedStatus = !requested ? 202 : (verified ? 201 : 200);
      if (response.statusCode != expectedStatus) {
        final isAlreadyRegistered =
            response.statusCode == 409 &&
            decodeMap(response.body)?['code'] == 'phone_already_registered';
        setState(() {
          message = formatApiError(response);
          showLoginSwitch = isAlreadyRegistered;
        });
        return;
      }
      final responseData = decodeMap(response.body);
      setState(() {
        if (!requested) {
          requestedPhone = currentPhone;
          message = 'Code OTP demandé.';
        } else if (!verified) {
          verified = true;
          message = mode == AuthMode.login
              ? 'Connexion réussie.'
              : 'Numéro vérifié. Complétez votre inscription.';
          if (mode == AuthMode.login) {
            successRole =
                responseData?['user']?['role']?.toString() ?? 'inconnu';
          }
        } else {
          successRole = responseData?['user']?['role']?.toString() ?? 'inconnu';
          message = 'Inscription réussie.';
        }
      });
    } on SocketException {
      if (mounted) setState(() => message = 'API inaccessible. Réessayez.');
    } on TimeoutException {
      if (mounted) setState(() => message = 'Délai dépassé. Réessayez.');
    } on HttpException {
      if (mounted) setState(() => message = 'API inaccessible. Réessayez.');
    } catch (_) {
      if (mounted) setState(() => message = 'Une erreur réseau est survenue.');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (successRole != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('TCHATCHA')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(message ?? 'Opération réussie.'),
                const SizedBox(height: 8),
                Text('Rôle : $successRole'),
              ],
            ),
          ),
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(title: const Text('TCHATCHA')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const Text(
            'Trouver un professionnel de confiance',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          Text(
            'Connexion client ou professionnel · Bénin',
            style: TextStyle(color: Colors.grey.shade700),
          ),
          const SizedBox(height: 24),
          SegmentedButton<AuthMode>(
            segments: const [
              ButtonSegment(value: AuthMode.login, label: Text('Se connecter')),
              ButtonSegment(
                value: AuthMode.register,
                label: Text('Créer un compte'),
              ),
            ],
            selected: {mode},
            onSelectionChanged: (value) => selectMode(value.first),
          ),
          const SizedBox(height: 24),
          TextField(
            key: const Key('phone-field'),
            controller: phone,
            enabled: !requested && !loading,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'Téléphone',
              hintText: '97000000',
              border: OutlineInputBorder(),
            ),
          ),
          if (requested && !verified) ...[
            const SizedBox(height: 12),
            TextField(
              key: const Key('otp-field'),
              controller: code,
              enabled: !loading,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Code OTP',
                border: OutlineInputBorder(),
              ),
            ),
          ],
          if (mode == AuthMode.register && verified) ...[
            const SizedBox(height: 12),
            TextField(
              key: const Key('full-name-field'),
              controller: fullName,
              enabled: !loading,
              decoration: const InputDecoration(
                labelText: 'Nom complet',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
          ],
          const SizedBox(height: 16),
          FilledButton(
            key: const Key('submit-button'),
            onPressed: loading ? null : submit,
            child: Text(loading ? 'Envoi…' : buttonLabel),
          ),
          if (message != null) ...[
            const SizedBox(height: 16),
            Text(message!, key: const Key('message')),
            if (showLoginSwitch)
              TextButton(
                key: const Key('switch-to-login-after-conflict'),
                onPressed: loading ? null : () => selectMode(AuthMode.login),
                child: const Text('Se connecter'),
              ),
          ],
        ],
      ),
    );
  }

  String get buttonLabel {
    if (!requested) {
      return mode == AuthMode.login
          ? 'Demander un OTP'
          : 'Commencer l’inscription';
    }
    if (!verified) return 'Valider le code';
    return 'Créer le compte';
  }
}

Map<String, dynamic>? decodeMap(String body) {
  try {
    final value = jsonDecode(body);
    return value is Map<String, dynamic> ? value : null;
  } on FormatException {
    return null;
  }
}

String formatApiError(ApiResponse response) {
  final data = decodeMap(response.body);
  final code = data?['code']?.toString();
  if (code == 'phone_not_found') {
    return 'Aucun compte n’existe pour ce numéro. Créez un compte.';
  }
  if (code == 'phone_already_registered') {
    return 'Un compte existe déjà pour ce numéro. Connectez-vous.';
  }
  if (response.statusCode == 500) {
    return 'Une erreur interne est survenue. Réessayez plus tard.';
  }
  if (code != null) return 'Erreur API ${response.statusCode} : $code';
  return 'Erreur API ${response.statusCode}.';
}
