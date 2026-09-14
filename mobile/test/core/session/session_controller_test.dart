import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/core/session/session_controller.dart';
import 'package:mobile/core/session/session_store.dart';
import 'package:mobile/app/app.dart';

class _FakeClient extends http.BaseClient {
  _FakeClient(this.handler);
  final Future<http.Response> Function(String path, http.BaseRequest request)
  handler;
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final response = await handler(request.url.path, request);
    return http.StreamedResponse(
      Stream.value(response.bodyBytes),
      response.statusCode,
      request: request,
    );
  }
}

class _RequestTrace {
  final events = <String>[];

  void record(http.BaseRequest request) {
    events.add(
      '${request.method} ${request.url.path} '
      'auth=${request.headers.containsKey('Authorization')}',
    );
  }
}

http.Response? _bootstrapResponse(String path) {
  if (path == '/api/v1/me') {
    return http.Response('{"full_name":"A","roles":["CLIENT"]}', 200);
  }
  if (path == '/api/v1/geo/countries') {
    return http.Response('{"items":[{"code":"BJ"}]}', 200);
  }
  if (path == '/api/v1/geo/countries/BJ/divisions') {
    return http.Response('{"items":[]}', 200);
  }
  if (path == '/api/v1/categories') {
    return http.Response('{"items":[]}', 200);
  }
  return null;
}

Never _unexpectedRoute(http.BaseRequest request) {
  throw StateError(
    'Route inattendue dans le fake: ${request.method} ${request.url.path}',
  );
}

void main() {
  testWidgets('absence de session affiche LOGIN après restauration', (
    tester,
  ) async {
    final controller = SessionController(store: MemorySessionStore());
    await tester.pumpWidget(
      MaterialApp(home: SessionGate(controller: controller)),
    );
    await tester.pumpAndSettle();
    expect(find.text('Demander un OTP'), findsOneWidget);
  });

  test(
    'restaure /me puis charge countries avant divisions et catégories',
    () async {
      final paths = <String>[];
      final store = MemorySessionStore()
        ..tokens = const SessionTokens(accessToken: 'a', refreshToken: 'r');
      final client = _FakeClient((path, request) async {
        paths.add(path);
        if (path == '/api/v1/me') {
          return http.Response('{"full_name":"A","roles":["CLIENT"]}', 200);
        }
        if (path == '/api/v1/geo/countries') {
          return http.Response('{"items":[{"code":"BJ"}]}', 200);
        }
        if (path == '/api/v1/geo/countries/BJ/divisions') {
          return http.Response(
            '{"items":[{"name":"Cotonou"},{"name":"Abomey-Calavi"},{"name":"Porto-Novo"}]}',
            200,
          );
        }
        if (path == '/api/v1/categories') {
          return http.Response('{"items":[{"name":"Plomberie"}]}', 200);
        }
        throw StateError('Route inattendue dans le fake: $path');
      });
      final controller = SessionController(store: store, client: client);
      await controller.restore();
      expect(paths, [
        '/api/v1/me',
        '/api/v1/geo/countries',
        '/api/v1/geo/countries/BJ/divisions',
        '/api/v1/categories',
      ]);
      expect(controller.home?.communes, ['Cotonou', 'Abomey-Calavi']);
      expect(controller.home?.categories, ['Plomberie']);
      client.close();
    },
  );

  test(
    'trois 401 simultanés partagent un refresh et rejouent une fois',
    () async {
      var refreshCalls = 0;
      var protectedCalls = 0;
      final gate = Completer<void>();
      final refreshStarted = Completer<void>();
      final store = MemorySessionStore()
        ..tokens = const SessionTokens(
          accessToken: 'old',
          refreshToken: 'old-r',
        );
      final client = _FakeClient((path, request) async {
        if (path == '/api/v1/me') {
          return http.Response('{"full_name":"A","roles":["CLIENT"]}', 200);
        }
        if (path == '/api/v1/geo/countries') {
          return http.Response('{"items":[{"code":"BJ"}]}', 200);
        }
        if (path == '/api/v1/geo/countries/BJ/divisions') {
          return http.Response('{"items":[]}', 200);
        }
        if (path == '/api/v1/categories') {
          return http.Response('{"items":[]}', 200);
        }
        if (path == '/api/v1/protected') {
          protectedCalls++;
          return http.Response(
            protectedCalls <= 3 ? '{}' : '{"ok":true}',
            protectedCalls <= 3 ? 401 : 200,
          );
        }
        if (path == '/api/v1/auth/refresh') {
          refreshCalls++;
          if (!refreshStarted.isCompleted) refreshStarted.complete();
          await gate.future;
          return http.Response(
            '{"access_token":"new","refresh_token":"new-r"}',
            200,
          );
        }
        throw StateError('Route inattendue dans le fake: $path');
      });
      final controller = SessionController(store: store, client: client);
      await controller.restore();
      final requests = Future.wait([
        controller.authorizedGet('/protected'),
        controller.authorizedGet('/protected'),
        controller.authorizedGet('/protected'),
      ]);
      await refreshStarted.future.timeout(const Duration(seconds: 2));
      gate.complete();
      final responses = await requests;
      expect(refreshCalls, 1);
      expect(protectedCalls, 6);
      expect(responses.every((response) => response.statusCode == 200), isTrue);
      expect((await store.read())?.refreshToken, 'new-r');
      client.close();
    },
  );

  test(
    'rotation complète remplace exactement les deux anciens tokens',
    () async {
      var protectedCalls = 0;
      var refreshCalls = 0;
      final trace = _RequestTrace();
      final store = MemorySessionStore()
        ..tokens = const SessionTokens(
          accessToken: 'access_old',
          refreshToken: 'refresh_old',
        );
      final client = _FakeClient((path, request) async {
        trace.record(request);
        final bootstrap = _bootstrapResponse(path);
        if (bootstrap != null) return bootstrap;
        if (path == '/api/v1/protected') {
          protectedCalls++;
          return protectedCalls == 1
              ? http.Response('{}', 401)
              : http.Response('{"ok":true}', 200);
        }
        if (path == '/api/v1/auth/refresh') {
          refreshCalls++;
          return http.Response(
            '{"access_token":"access_new","refresh_token":"refresh_new"}',
            200,
          );
        }
        return _unexpectedRoute(request);
      });
      final controller = SessionController(store: store, client: client);

      await controller.restore();
      final response = await controller.authorizedGet('/protected');

      expect(response.statusCode, 200);
      expect(protectedCalls, 2);
      expect(refreshCalls, 1);
      final stored = await store.read();
      expect(stored, isNotNull);
      expect(stored!.accessToken, 'access_new');
      expect(stored.refreshToken, 'refresh_new');
      expect(controller.accessToken, 'access_new');
      expect(controller.accessToken, isNot('access_old'));
      expect((await store.read())?.refreshToken, isNot('refresh_old'));
      expect(
        trace.events.where((event) => event.contains('/protected')).length,
        2,
      );
      expect(trace.events, contains('GET /api/v1/protected auth=true'));
      expect(trace.events, contains('POST /api/v1/auth/refresh auth=true'));
      client.close();
    },
  );

  test('échec du refresh efface la session sans boucle', () async {
    var protectedCalls = 0;
    var refreshCalls = 0;
    final trace = _RequestTrace();
    final store = MemorySessionStore()
      ..tokens = const SessionTokens(
        accessToken: 'access_old',
        refreshToken: 'refresh_old',
      );
    final client = _FakeClient((path, request) async {
      trace.record(request);
      final bootstrap = _bootstrapResponse(path);
      if (bootstrap != null) return bootstrap;
      if (path == '/api/v1/protected') {
        protectedCalls++;
        return http.Response('{}', 401);
      }
      if (path == '/api/v1/auth/refresh') {
        refreshCalls++;
        return http.Response('{}', 401);
      }
      return _unexpectedRoute(request);
    });
    final controller = SessionController(store: store, client: client);

    await controller.restore();
    final response = await controller.authorizedGet('/protected');

    expect(response.statusCode, 401);
    expect(protectedCalls, 1);
    expect(refreshCalls, 1);
    expect(await store.read(), isNull);
    expect(controller.authenticated, isFalse);
    expect(controller.accessToken, isNull);
    expect(
      trace.events.where((event) => event.contains('/protected')).length,
      1,
    );
    expect(trace.events, contains('POST /api/v1/auth/refresh auth=true'));
    client.close();
  });

  test('un second 401 après rejeu est propagé sans second refresh', () async {
    var protectedCalls = 0;
    var refreshCalls = 0;
    final trace = _RequestTrace();
    final store = MemorySessionStore()
      ..tokens = const SessionTokens(
        accessToken: 'access_old',
        refreshToken: 'refresh_old',
      );
    final client = _FakeClient((path, request) async {
      trace.record(request);
      final bootstrap = _bootstrapResponse(path);
      if (bootstrap != null) return bootstrap;
      if (path == '/api/v1/protected') {
        protectedCalls++;
        return http.Response('{}', 401);
      }
      if (path == '/api/v1/auth/refresh') {
        refreshCalls++;
        return http.Response(
          '{"access_token":"access_new","refresh_token":"refresh_new"}',
          200,
        );
      }
      return _unexpectedRoute(request);
    });
    final controller = SessionController(store: store, client: client);

    await controller.restore();
    final response = await controller.authorizedGet('/protected');

    expect(response.statusCode, 401);
    expect(refreshCalls, 1);
    expect(protectedCalls, 2);
    final stored = await store.read();
    expect(stored, isNotNull);
    expect(stored!.accessToken, 'access_new');
    expect(stored.refreshToken, 'refresh_new');
    expect(
      trace.events.where((event) => event.contains('/protected')).length,
      2,
    );
    expect(trace.events, contains('POST /api/v1/auth/refresh auth=true'));
    client.close();
  });

  test('logout pendant le refresh empêche toute réauthentification', () async {
    var refreshCalls = 0;
    var logoutCalls = 0;
    final trace = _RequestTrace();
    final refreshStarted = Completer<void>();
    final releaseRefresh = Completer<void>();
    final store = MemorySessionStore()
      ..tokens = const SessionTokens(
        accessToken: 'access_old',
        refreshToken: 'refresh_old',
      );
    final client = _FakeClient((path, request) async {
      trace.record(request);
      final bootstrap = _bootstrapResponse(path);
      if (bootstrap != null) return bootstrap;
      if (path == '/api/v1/protected') return http.Response('{}', 401);
      if (path == '/api/v1/auth/refresh') {
        refreshCalls++;
        if (!refreshStarted.isCompleted) refreshStarted.complete();
        await releaseRefresh.future;
        return http.Response(
          '{"access_token":"access_new","refresh_token":"refresh_new"}',
          200,
        );
      }
      if (path == '/api/v1/auth/logout') {
        logoutCalls++;
        return http.Response('{}', 200);
      }
      return _unexpectedRoute(request);
    });
    final controller = SessionController(store: store, client: client);

    try {
      await controller.restore();
      final protectedRequest = controller.authorizedGet('/protected');
      await refreshStarted.future.timeout(const Duration(seconds: 2));
      await controller.logout();
      expect(await store.read(), isNull);
      expect(controller.authenticated, isFalse);
      releaseRefresh.complete();
      final response = await protectedRequest;

      expect(response.statusCode, 401);
      expect(refreshCalls, 1);
      expect(logoutCalls, 1);
      expect(await store.read(), isNull);
      expect(controller.authenticated, isFalse);
      expect(
        trace.events.where((event) => event.contains('/protected')).length,
        1,
      );
      expect(trace.events, contains('POST /api/v1/auth/refresh auth=true'));
      expect(trace.events, contains('POST /api/v1/auth/logout auth=true'));
    } finally {
      if (!releaseRefresh.isCompleted) releaseRefresh.complete();
      if (!refreshStarted.isCompleted) refreshStarted.complete();
      client.close();
    }
  });
}
