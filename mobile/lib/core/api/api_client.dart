import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

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

class ApiTransport {
  ApiTransport({http.Client? client}) : _client = client ?? http.Client();

  static final shared = ApiTransport();
  static const _timeout = Duration(seconds: 10);
  final http.Client _client;

  Future<ApiResponse> send(
    String method,
    String path, {
    Map<String, String> headers = const {},
    String? body,
  }) async {
    try {
      final request = http.Request(method, Uri.parse('$apiBaseUrl$path'))
        ..headers.addAll(headers)
        ..body = body ?? '';
      final response = await _client.send(request).timeout(_timeout);
      final streamed = await http.Response.fromStream(response);
      return ApiResponse(streamed.statusCode, streamed.body);
    } on SocketException catch (error) {
      throw ApiNetworkException(error);
    } on TimeoutException catch (error) {
      throw ApiNetworkException(error);
    } on http.ClientException catch (error) {
      throw ApiNetworkException(error);
    }
  }

  void close() => _client.close();
}

class ApiClient {
  ApiClient({ApiTransport? transport, http.Client? client, this.accessToken})
    : _transport =
          transport ??
          (client == null ? ApiTransport.shared : ApiTransport(client: client));

  final ApiTransport _transport;
  final String? accessToken;

  Future<ApiResponse> get(String path) async {
    return _transport.send('GET', path, headers: _headers);
  }

  Future<ApiResponse> post(
    String path,
    Map<String, dynamic> body, {
    Map<String, String> headers = const {},
  }) async {
    return _transport.send(
      'POST',
      path,
      headers: {..._headers, 'Content-Type': 'application/json', ...headers},
      body: jsonEncode(body),
    );
  }

  Map<String, String> get _headers => {
    'Accept': 'application/json',
    if (accessToken != null) 'Authorization': 'Bearer $accessToken',
  };

  void close() => _transport.close();
}

class ApiNetworkException implements Exception {
  const ApiNetworkException(this.cause);
  final Object cause;
}

Map<String, dynamic>? decodeJsonMap(String body) {
  try {
    final value = jsonDecode(body);
    return value is Map<String, dynamic> ? value : null;
  } on FormatException {
    return null;
  }
}
