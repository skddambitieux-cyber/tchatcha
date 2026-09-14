import 'package:flutter/material.dart';

import '../core/session/session_controller.dart';
import '../core/session/session_store.dart';
import '../features/auth/auth_page.dart';
import '../features/home/home_page.dart';
import '../features/requests/request_repository.dart';

class TchatchaApp extends StatelessWidget {
  const TchatchaApp({
    super.key,
    this.api = const AuthApi(),
    this.enableSession = false,
  });
  final AuthApi api;
  final bool enableSession;

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'TCHATCHA',
    theme: ThemeData(
      colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0B6E69)),
      useMaterial3: true,
    ),
    home: enableSession ? const SessionGate() : AuthPage(api: api),
  );
}

class SessionGate extends StatefulWidget {
  const SessionGate({super.key, this.controller});
  final SessionController? controller;
  @override
  State<SessionGate> createState() => _SessionGateState();
}

class _SessionGateState extends State<SessionGate> {
  late final SessionController controller =
      widget.controller ?? SessionController();

  @override
  void initState() {
    super.initState();
    controller.addListener(_changed);
    controller.restore();
  }

  void _changed() => setState(() {});

  @override
  void dispose() {
    controller.removeListener(_changed);
    controller.close();
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (controller.restoring) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (!controller.authenticated) {
      return AuthPage(
        api: AuthApi(
          deviceIdProvider: DeviceIdProvider(store: controller.store),
        ),
        onAuthenticated: controller.adoptResponse,
      );
    }
    if (controller.home == null) {
      return Scaffold(
        body: Center(
          child: FilledButton(
            onPressed: controller.restore,
            child: const Text('Réessayer'),
          ),
        ),
      );
    }
    return HomePage(
      load: () async => controller.home!,
      onLogout: controller.logout,
      api: controller.apiClient,
      requestRepository: RequestRepository(
        client: controller.apiClient,
        authorizedGet: controller.authorizedGet,
        authorizedPost: controller.authorizedPost,
      ),
    );
  }
}
