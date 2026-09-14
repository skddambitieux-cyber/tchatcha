import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/api/api_client.dart';
import 'package:mobile/core/session/session_store.dart';
import 'package:mobile/app/app.dart';
import 'package:mobile/features/auth/auth_page.dart';

void main() {
  test(
    'AuthApi réutilise un identifiant appareil sécurisé pour LOGIN et REGISTER',
    () async {
      final calls = <Map<String, dynamic>>[];
      final provider = DeviceIdProvider(
        store: MemorySessionStore(),
        generate: () => 'device-test',
      );
      final api = AuthApi(
        deviceIdProvider: provider,
        postOverride: (path, body) async {
          calls.add(body);
          return const ApiResponse(200, '{}');
        },
      );

      await api.post('/auth/otp/verify', {'phone': '97000000'});
      await api.post('/auth/register', {'phone': '97000000'});

      expect(calls[0]['device'], {'session_id': 'device-test'});
      expect(calls[1]['device'], {'session_id': 'device-test'});
      expect(calls[0]['device'], calls[1]['device']);
    },
  );

  testWidgets('inscription CLIENT complète transmet le même numéro', (
    tester,
  ) async {
    final calls = <({String path, Map<String, dynamic> body})>[];
    final api = AuthApi(
      postOverride: (path, body) async {
        calls.add((path: path, body: body));
        if (path == '/auth/otp/request') {
          return const ApiResponse(202, '{}');
        }
        if (path == '/auth/otp/verify') {
          return const ApiResponse(200, '{"status":"otp_verified"}');
        }
        return const ApiResponse(201, '{"user":{"role":"CLIENT"}}');
      },
    );

    await tester.pumpWidget(TchatchaApp(api: api));
    await tester.tap(find.text('Créer un compte'));
    await tester.enterText(find.byKey(const Key('phone-field')), '97000000');
    await tester.tap(find.byKey(const Key('submit-button')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('otp-field')), '123456');
    await tester.tap(find.byKey(const Key('submit-button')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('full-name-field')),
      'Aïcha Test',
    );
    await tester.tap(find.byKey(const Key('submit-button')));
    await tester.pumpAndSettle();

    expect(calls.map((call) => call.path), [
      '/auth/otp/request',
      '/auth/otp/verify',
      '/auth/register',
    ]);
    expect(calls[1].body['phone'], calls[0].body['phone']);
    expect(calls[2].body['phone'], calls[0].body['phone']);
    expect(calls[2].body['role'], 'CLIENT');
    expect(calls[2].body['consents'], {'cgv': true, 'privacy': true});
    expect(find.text('Inscription réussie.'), findsOneWidget);
    expect(find.textContaining('token'), findsNothing);
    expect(find.textContaining('OTP'), findsNothing);
  });

  testWidgets('connexion LOGIN transmet le même numéro à verify', (
    tester,
  ) async {
    final calls = <({String path, Map<String, dynamic> body})>[];
    final api = AuthApi(
      postOverride: (path, body) async {
        calls.add((path: path, body: body));
        return path.endsWith('request')
            ? const ApiResponse(202, '{}')
            : const ApiResponse(200, '{"user":{"role":"CLIENT"}}');
      },
    );
    await tester.pumpWidget(TchatchaApp(api: api));
    await tester.enterText(find.byKey(const Key('phone-field')), '97000000');
    await tester.tap(find.byKey(const Key('submit-button')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('otp-field')), '123456');
    await tester.tap(find.byKey(const Key('submit-button')));
    await tester.pumpAndSettle();
    expect(calls[0].body['purpose'], 'LOGIN');
    expect(calls[1].path, '/auth/otp/verify');
    expect(calls[1].body['phone'], calls[0].body['phone']);
    expect(find.text('Connexion réussie.'), findsOneWidget);
    expect(find.textContaining('token'), findsNothing);
  });

  testWidgets(
    'phone_not_found est traduit et le numéro est validé localement',
    (tester) async {
      var callCount = 0;
      final api = AuthApi(
        postOverride: (path, body) async {
          callCount++;
          return const ApiResponse(404, '{"code":"phone_not_found"}');
        },
      );
      await tester.pumpWidget(TchatchaApp(api: api));
      await tester.tap(find.byKey(const Key('submit-button')));
      await tester.pump();
      expect(callCount, 0);
      expect(
        find.text('Saisissez un numéro de 8 à 15 chiffres.'),
        findsOneWidget,
      );
      await tester.enterText(find.byKey(const Key('phone-field')), '97000000');
      await tester.tap(find.byKey(const Key('submit-button')));
      await tester.pumpAndSettle();
      expect(
        find.text('Aucun compte n’existe pour ce numéro. Créez un compte.'),
        findsOneWidget,
      );
    },
  );

  testWidgets('409 est traduit et propose le basculement vers LOGIN', (
    tester,
  ) async {
    final api = AuthApi(
      postOverride: (path, body) async => const ApiResponse(
        409,
        '{"code":"phone_already_registered","message":"internal detail"}',
      ),
    );
    await tester.pumpWidget(TchatchaApp(api: api));
    await tester.tap(find.text('Créer un compte'));
    await tester.enterText(find.byKey(const Key('phone-field')), '97000000');
    await tester.tap(find.byKey(const Key('submit-button')));
    await tester.pumpAndSettle();
    expect(
      find.text('Un compte existe déjà pour ce numéro. Connectez-vous.'),
      findsOneWidget,
    );
    final loginSwitchButton = find.byKey(
      const Key('switch-to-login-after-conflict'),
    );
    expect(loginSwitchButton, findsOneWidget);
    await tester.tap(loginSwitchButton);
    await tester.pumpAndSettle();
    expect(find.text('Demander un OTP'), findsOneWidget);
  });

  testWidgets('500 est assaini sans détail technique', (tester) async {
    final api = AuthApi(
      postOverride: (path, body) async =>
          const ApiResponse(500, '{"message":"stack SecretToken internal"}'),
    );
    await tester.pumpWidget(TchatchaApp(api: api));
    await tester.enterText(find.byKey(const Key('phone-field')), '97000000');
    await tester.tap(find.byKey(const Key('submit-button')));
    await tester.pumpAndSettle();
    expect(
      find.text('Une erreur interne est survenue. Réessayez plus tard.'),
      findsOneWidget,
    );
    expect(find.textContaining('SecretToken'), findsNothing);
    expect(find.textContaining('stack'), findsNothing);
  });

  testWidgets('erreur réseau et timeout restent génériques', (tester) async {
    for (final error in [
      const SocketException('http://remote.invalid/secret'),
      TimeoutException('timeout with secret URL'),
    ]) {
      final api = AuthApi(postOverride: (path, body) async => throw error);
      await tester.pumpWidget(TchatchaApp(api: api));
      await tester.enterText(find.byKey(const Key('phone-field')), '97000000');
      await tester.tap(find.byKey(const Key('submit-button')));
      await tester.pumpAndSettle();
      expect(find.textContaining('http'), findsNothing);
      expect(find.textContaining('secret'), findsNothing);
      expect(find.textContaining('SocketException'), findsNothing);
      expect(find.textContaining('TimeoutException'), findsNothing);
    }
  });

  testWidgets('téléphone et bouton sont verrouillés pendant OTP', (
    tester,
  ) async {
    final completer = Completer<ApiResponse>();
    final api = AuthApi(postOverride: (path, body) => completer.future);
    await tester.pumpWidget(TchatchaApp(api: api));
    await tester.enterText(find.byKey(const Key('phone-field')), '97000000');
    await tester.tap(find.byKey(const Key('submit-button')));
    await tester.pump();
    expect(
      tester.widget<TextField>(find.byKey(const Key('phone-field'))).enabled,
      isFalse,
    );
    expect(
      tester
          .widget<FilledButton>(find.byKey(const Key('submit-button')))
          .onPressed,
      isNull,
    );
    completer.complete(const ApiResponse(202, '{}'));
    await tester.pumpAndSettle();
  });

  testWidgets('REGISTER ne propose pas PROFESSIONAL ni identifiants UUID', (
    tester,
  ) async {
    await tester.pumpWidget(TchatchaApp(api: const AuthApi()));
    await tester.tap(find.text('Créer un compte'));
    await tester.pumpAndSettle();
    expect(find.text('Professionnel'), findsNothing);
    expect(find.textContaining('catégorie'), findsNothing);
    expect(find.textContaining('localité'), findsNothing);
    expect(find.byKey(const Key('category-field')), findsNothing);
    expect(find.byKey(const Key('locality-field')), findsNothing);
  });
}
