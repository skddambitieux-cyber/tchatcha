import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../api/api_client.dart';
import '../../features/home/home_page.dart';
import 'session_store.dart';

class SessionController extends ChangeNotifier {
  SessionController({
    SessionStore? store,
    ApiTransport? transport,
    http.Client? client,
  }) : store = store ?? SecureSessionStore(),
       transport =
           transport ??
           (client == null
               ? ApiTransport.shared
               : ApiTransport(client: client)),
       _ownsTransport = client != null || transport != null;

  final SessionStore store;
  final ApiTransport transport;
  final bool _ownsTransport;
  SessionTokens? _tokens;
  Future<SessionTokens?>? _refreshInFlight;
  int _epoch = 0;
  bool restoring = true;
  String? error;
  HomeData? home;

  ApiClient get _api =>
      ApiClient(transport: transport, accessToken: _tokens?.accessToken);

  ApiClient get apiClient => _api;

  String? get accessToken => _tokens?.accessToken;
  bool get authenticated => _tokens != null;

  void close() {
    if (_ownsTransport) transport.close();
  }

  Future<void> adoptResponse(ApiResponse response) async {
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final next = SessionTokens(
      accessToken: body['access_token'].toString(),
      refreshToken: body['refresh_token'].toString(),
    );
    _tokens = next;
    await store.write(next);
    await restore();
  }

  Future<void> restore() async {
    restoring = true;
    notifyListeners();
    try {
      _tokens = await store.read();
      if (_tokens != null) {
        final response = await authorizedGet('/me');
        if (response.statusCode >= 400) {
          await clearSession();
        }
        if (_tokens != null) await loadHome(response);
      }
    } catch (_) {
      error = 'Impossible de restaurer la session.';
      await clearSession();
    } finally {
      restoring = false;
      notifyListeners();
    }
  }

  Future<void> refresh() async {
    final result = await (_refreshInFlight ??= _performRefresh());
    _refreshInFlight = null;
    if (result == null) await clearSession();
  }

  Future<SessionTokens?> _performRefresh() async {
    final current = _tokens;
    final epoch = _epoch;
    if (current == null) return null;
    final response = await _post('/auth/refresh', {
      'refresh_token': current.refreshToken,
    });
    if (response.statusCode != 200) return null;
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final next = SessionTokens(
      accessToken: body['access_token'].toString(),
      refreshToken: body['refresh_token'].toString(),
    );
    if (epoch != _epoch || current != _tokens) return null;
    _tokens = next;
    await store.write(next);
    return next;
  }

  Future<void> loadHome(ApiResponse meResponse) async {
    final countries = await authorizedGet('/geo/countries');
    if (countries.statusCode != 200) {
      error = 'Impossible de charger les pays.';
      return;
    }
    final countryItems = (jsonDecode(countries.body)['items'] as List)
        .cast<Map<String, dynamic>>();
    if (!countryItems.any((item) => item['code'] == 'BJ')) {
      error = 'Le pays du pilote est indisponible.';
      return;
    }
    final divisions = await authorizedGet(
      '/geo/countries/BJ/divisions?type=COMMUNE',
    );
    final categories = await authorizedGet('/categories?country_code=BJ');
    if (meResponse.statusCode == 200 &&
        divisions.statusCode == 200 &&
        categories.statusCode == 200) {
      home = homeDataFromResponses(
        meResponse.body,
        divisions.body,
        categories.body,
      );
      error = null;
    } else {
      error = 'Impossible de charger l’accueil.';
    }
  }

  Future<void> clearSession() async {
    _tokens = null;
    home = null;
    await store.clear();
    notifyListeners();
  }

  Future<void> logout() async {
    _epoch++;
    final current = _tokens;
    if (current != null) {
      await _post('/auth/logout', {'refresh_token': current.refreshToken});
    }
    await clearSession();
  }

  Future<ApiResponse> authorizedGet(String path) async {
    final response = await _get(path);
    if (response.statusCode != 401) return response;
    await refresh();
    if (_tokens == null) return response;
    return _get(path);
  }

  Future<ApiResponse> authorizedPost(
    String path,
    Map<String, dynamic> body, {
    Map<String, String> headers = const {},
  }) async {
    final response = await _post(path, body, headers: headers);
    if (response.statusCode != 401) return response;
    await refresh();
    if (_tokens == null) return response;
    return _post(path, body, headers: headers);
  }

  Future<ApiResponse> _get(String path) async {
    return _api.get(path);
  }

  Future<ApiResponse> _post(
    String path,
    Map<String, dynamic> body, {
    Map<String, String> headers = const {},
  }) async {
    return _api.post(path, body, headers: headers);
  }
}
