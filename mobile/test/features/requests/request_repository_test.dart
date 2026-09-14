import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/core/api/api_client.dart';
import 'package:mobile/features/requests/request_repository.dart';
import 'package:mobile/features/requests/requests_controller.dart';

class _FakeClient extends http.BaseClient {
  _FakeClient(this.handler);
  final Future<http.Response> Function(http.BaseRequest request) handler;
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final response = await handler(request);
    return http.StreamedResponse(
      Stream.value(response.bodyBytes),
      response.statusCode,
      request: request,
    );
  }
}

void main() {
  test('création envoie le payload exact et une clé d’idempotence', () async {
    late http.BaseRequest request;
    final api = ApiClient(
      client: _FakeClient((incoming) async {
        request = incoming;
        return http.Response(
          '{"id":"request-1","category_name":"Plomberie",'
          '"title":"Réparer une fuite","description":"Cuisine",'
          '"division_name":"Cotonou","status":"OPEN",'
          '"urgency":"HIGH","created_at":"2026-09-14T10:00:00Z"}',
          201,
        );
      }),
    );
    final repository = RequestRepository(client: api);

    final created = await repository.create(
      categoryId: '11111111-1111-1111-1111-111111111111',
      divisionId: '22222222-2222-2222-2222-222222222222',
      title: ' Réparer une fuite ',
      description: 'Cuisine',
      budgetMin: 5000,
      budgetMax: 15000,
      urgency: 'HIGH',
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
    );

    expect(request, isA<http.Request>());
    final sentRequest = request as http.Request;
    expect(sentRequest.method, 'POST');
    expect(sentRequest.url.path, '/api/v1/requests');
    expect(
      sentRequest.headers['idempotency-key'],
      '33333333-3333-4333-8333-333333333333',
    );
    expect(
      sentRequest.body,
      contains('"category_id":"11111111-1111-1111-1111-111111111111"'),
    );
    expect(
      sentRequest.body,
      contains('"division_id":"22222222-2222-2222-2222-222222222222"'),
    );
    expect(sentRequest.body, contains('"budget_min":5000'));
    expect(created.id, 'request-1');
    api.close();
  });

  test('liste et détail mappent les champs publics', () async {
    var calls = 0;
    final api = ApiClient(
      client: _FakeClient((request) async {
        calls++;
        if (request.url.path == '/api/v1/requests') {
          return http.Response(
            '{"items":[{"id":"request-1","category_name":"Plomberie",'
            '"title":"Fuite","description":"Cuisine",'
            '"division_name":"Cotonou","status":"OPEN",'
            '"urgency":"NORMAL","created_at":"2026-09-14T10:00:00Z"}],'
            '"next_cursor":"opaque"}',
            200,
          );
        }
        return http.Response(
          '{"id":"request-1","category_name":"Plomberie",'
          '"title":"Fuite","description":"Cuisine",'
          '"division_name":"Cotonou","status":"OPEN",'
          '"urgency":"NORMAL","created_at":"2026-09-14T10:00:00Z"}',
          200,
        );
      }),
    );
    final repository = RequestRepository(client: api);

    final page = await repository.list();
    final detail = await repository.detail('request-1');

    expect(page.items.single.title, 'Fuite');
    expect(page.nextCursor, 'opaque');
    expect(detail.division, 'Cotonou');
    expect(calls, 2);
    api.close();
  });

  test('controller empêche les doublons et traduit les statuts', () async {
    var calls = 0;
    final api = ApiClient(
      client: _FakeClient((request) async {
        calls++;
        return http.Response('{"items":[],"next_cursor":null}', 200);
      }),
    );
    final controller = RequestsController(RequestRepository(client: api));

    await Future.wait<void>([controller.load(), controller.load()]);

    expect(calls, 1);
    expect(controller.items, isEmpty);
    expect(requestStatusLabel('OPEN'), 'Ouverte');
    expect(requestStatusLabel('CANCELLED'), 'Annulée');
    expect(requestStatusLabel('UNKNOWN'), 'Statut indisponible');
    api.close();
  });

  test('génère une clé UUID et réutilise une clé fournie au retry', () async {
    final keys = <String>[];
    final repository = RequestRepository(
      client: ApiClient(
        client: _FakeClient((_) async => http.Response('{}', 500)),
      ),
      authorizedPost: (path, body, {headers = const {}}) async {
        keys.add(headers['Idempotency-Key']!);
        return const ApiResponse(
          201,
          '{"id":"request-1","title":"T","description":"D",'
          '"status":"OPEN","created_at":"2026-09-14"}',
        );
      },
    );

    final first = await repository.create(
      categoryId: 'cat',
      divisionId: 'div',
      title: 'T',
      description: 'D',
    );
    final retry = await repository.create(
      categoryId: 'cat',
      divisionId: 'div',
      title: 'T',
      description: 'D',
      idempotencyKey: keys.single,
    );
    final second = await repository.create(
      categoryId: 'cat',
      divisionId: 'div',
      title: 'T2',
      description: 'D2',
    );

    expect(
      RegExp(
        r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
      ).hasMatch(keys[0]),
      isTrue,
    );
    expect(keys[1], keys[0]);
    expect(keys[2], isNot(keys[0]));
    expect(first.id, retry.id);
    expect(second.id, 'request-1');
  });

  test('omet les champs optionnels nuls et expose les erreurs HTTP sans faux succès', () async {
    final bodies = <Map<String, dynamic>>[];
    final statuses = <int>[400, 409, 500];
    final repository = RequestRepository(
      client: ApiClient(
        client: _FakeClient((_) async => http.Response('{}', 500)),
      ),
      authorizedPost: (path, body, {headers = const {}}) async {
        bodies.add(body);
        return ApiResponse(statuses.removeAt(0), '{}');
      },
    );

    for (final status in [400, 409, 500]) {
      await expectLater(
        repository.create(
          categoryId: 'cat',
          divisionId: 'div',
          title: ' T ',
          description: ' D ',
        ),
        throwsA(
          isA<RequestApiException>().having(
            (error) => error.statusCode,
            'statusCode',
            status,
          ),
        ),
      );
    }
    expect(bodies, everyElement(isNot(contains('budget_min'))));
    expect(bodies, everyElement(isNot(contains('budget_max'))));
    expect(bodies, everyElement(isNot(contains('desired_date'))));
  });

  test('pagination conserve le curseur sans doublon', () async {
    var calls = 0;
    final repository = RequestRepository(
      client: ApiClient(
        client: _FakeClient((_) async => http.Response('{}', 500)),
      ),
      authorizedGet: (path) {
        calls++;
        expect(
          path,
          calls == 1 ? contains('limit=20') : contains('cursor=next'),
        );
        return Future.value(
          ApiResponse(
            200,
            calls == 1
                ? '{"items":[{"id":"one","title":"N"}],"next_cursor":"next"}'
                : '{"items":[{"id":"one","title":"N modifié"},'
                      '{"id":"two","title":"T"}],"next_cursor":null}',
          ),
        );
      },
    );
    final controller = RequestsController(repository);
    await controller.load();
    await controller.load();

    expect(controller.items.map((item) => item.id), ['one', 'two']);
    expect(controller.items.first.title, 'N modifié');
    expect(calls, 2);
  });

  test('valide les limites DTO avant tout POST', () async {
    var posts = 0;
    final repository = RequestRepository(
      client: ApiClient(
        client: _FakeClient((_) async => http.Response('{}', 500)),
      ),
      authorizedPost: (path, body, {headers = const {}}) async {
        posts++;
        return const ApiResponse(
          201,
          '{"id":"request-1","title":"T","description":"D",'
          '"status":"OPEN","created_at":"2026-09-14"}',
        );
      },
    );
    Future<ClientRequest> valid() => repository.create(
      categoryId: 'cat',
      divisionId: 'div',
      title: 't' * 160,
      description: 'd' * 2000,
      budgetMin: 0,
      budgetMax: 0,
      desiredDate: DateTime.now()
          .add(const Duration(days: 2))
          .toIso8601String(),
      urgency: 'EMERGENCY',
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
    );
    await valid();
    expect(posts, 1);

    final invalid = <Future<ClientRequest> Function()>[
      () => repository.create(
        categoryId: 'cat',
        divisionId: 'div',
        title: '',
        description: 'D',
      ),
      () => repository.create(
        categoryId: 'cat',
        divisionId: 'div',
        title: 't' * 161,
        description: 'D',
      ),
      () => repository.create(
        categoryId: 'cat',
        divisionId: 'div',
        title: 'T',
        description: '',
      ),
      () => repository.create(
        categoryId: 'cat',
        divisionId: 'div',
        title: 'T',
        description: 'd' * 2001,
      ),
      () => repository.create(
        categoryId: 'cat',
        divisionId: 'div',
        title: 'T',
        description: 'D',
        budgetMin: -1,
      ),
      () => repository.create(
        categoryId: 'cat',
        divisionId: 'div',
        title: 'T',
        description: 'D',
        desiredDate: '2020-01-01',
      ),
      () => repository.create(
        categoryId: 'cat',
        divisionId: 'div',
        title: 'T',
        description: 'D',
        urgency: 'INVALID',
      ),
    ];
    for (final attempt in invalid) {
      await expectLater(attempt(), throwsA(isA<RequestValidationException>()));
    }
    expect(posts, 1);
  });
}
