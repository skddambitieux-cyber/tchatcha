import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/core/api/api_client.dart';
import 'package:mobile/features/auth/auth_page.dart';

class _Client extends http.BaseClient {
  _Client(this.onRequest);
  final Future<http.Response> Function(http.BaseRequest request) onRequest;
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final response = await onRequest(request);
    return http.StreamedResponse(
      Stream.value(response.bodyBytes),
      response.statusCode,
      request: request,
    );
  }
}

void main() {
  test('ApiResponse conserve le statut et le corps sans les exposer', () {
    const response = ApiResponse(200, '{"ok":true}');
    expect(response.statusCode, 200);
    expect(response.body, contains('ok'));
    expect(response.toString(), isNot(contains('token')));
  });

  test('ApiClient ajoute Authorization Bearer', () async {
    String? authorization;
    final api = ApiClient(
      accessToken: 'access-secret',
      client: _Client((request) async {
        authorization = request.headers['authorization'];
        return http.Response('{}', 200, request: request);
      }),
    );
    await api.get('/me');
    expect(authorization, 'Bearer access-secret');
    api.close();
  });

  test('AuthApi et ApiClient partagent le transport injecté', () async {
    final requests = <String>[];
    final transport = ApiTransport(
      client: _Client((request) async {
        requests.add('${request.method} ${request.url.path}');
        return http.Response('{}', 200, request: request);
      }),
    );
    final auth = AuthApi(apiClient: ApiClient(transport: transport));
    final api = ApiClient(transport: transport, accessToken: 'secret');

    await auth.post('/auth/otp/request', {'phone': '97000000'});
    await api.get('/me');

    expect(requests, ['POST /api/v1/auth/otp/request', 'GET /api/v1/me']);
    transport.close();
  });
}
