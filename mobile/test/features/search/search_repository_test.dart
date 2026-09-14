import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/core/api/api_client.dart';
import 'package:mobile/features/search/search_controller.dart' as search;
import 'package:mobile/features/search/professional_page.dart';
import 'package:mobile/features/search/search_repository.dart';

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
  test('recherche encode exactement les filtres et la pagination', () async {
    Uri? requested;
    final api = ApiClient(
      client: _FakeClient((request) async {
        requested = request.url;
        return http.Response('{"items":[],"next_cursor":"opaque"}', 200);
      }),
    );
    final repository = SearchRepository(client: api);

    final page = await repository.search(
      const SearchFilters(
        query: 'électricité maison',
        categoryId: '11111111-1111-1111-1111-111111111111',
        divisionId: '22222222-2222-2222-2222-222222222222',
        verified: true,
        minRating: 4.5,
        minPrice: 5000,
        maxPrice: 7000,
        sort: 'rating',
      ),
      cursor: 'curseur opaque',
    );

    expect(requested!.path, '/api/v1/search');
    expect(requested!.queryParameters, {
      'country_code': 'BJ',
      'limit': '20',
      'q': 'électricité maison',
      'category_id': '11111111-1111-1111-1111-111111111111',
      'division_id': '22222222-2222-2222-2222-222222222222',
      'verified': 'true',
      'min_rating': '4.5',
      'min_price': '5000.0',
      'max_price': '7000.0',
      'sort': 'rating',
      'cursor': 'curseur opaque',
    });
    expect(page.nextCursor, 'opaque');
    api.close();
  });

  test('mappe un résultat public sans données privées', () async {
    final api = ApiClient(
      client: _FakeClient(
        (request) async => http.Response(
          '{"items":[{"id":"pro-1","business_name":"Express",'
          '"headline":"Électricité","verified":true,"rating_avg":4.8,'
          '"rating_count":12,"min_price":5000,"currency":"XOF",'
          '"commune":{"id":"division-1","name":"Cotonou"},'
          '"primary_service":{"category":{"id":"cat-1","name":"Électricité"}}}],'
          '"next_cursor":null}',
          200,
        ),
      ),
    );
    final result = await SearchRepository(client: api)
        .search(const SearchFilters());

    expect(result.items.single.businessName, 'Express');
    expect(result.items.single.commune, 'Cotonou');
    expect(result.items.single.category, 'Électricité');
    api.close();
  });

  test('contrôleur gère vide, pagination et erreur réseau', () async {
    var calls = 0;
    final api = ApiClient(
      client: _FakeClient((request) async {
        calls++;
        if (calls == 3) throw http.ClientException('offline');
        return http.Response(
          calls == 1
              ? '{"items":[{"id":"one"}],"next_cursor":"next"}'
              : '{"items":[],"next_cursor":null}',
          200,
        );
      }),
    );
    final controller = search.SearchController(SearchRepository(client: api));

    await controller.search();
    expect(controller.items.single.id, 'one');
    await controller.loadMore();
    expect(controller.items, hasLength(1));
    controller.setFilters(const SearchFilters(query: 'retry'));
    await controller.search();
    expect(controller.error, 'Recherche indisponible. Réessayez.');
    api.close();
  });

  test(
    'ignore une réponse devenue obsolète après changement de filtre',
    () async {
      final first = Completer<http.Response>();
      final second = Completer<http.Response>();
      var calls = 0;
      final api = ApiClient(
        client: _FakeClient((request) {
          calls++;
          return calls == 1 ? first.future : second.future;
        }),
      );
      final controller = search.SearchController(SearchRepository(client: api));

      final Future<void> oldRequest = controller.search();
      controller.setFilters(const SearchFilters(query: 'nouveau'));
      final Future<void> newRequest = controller.search();
      second.complete(http.Response('{"items":[{"id":"new"}]}', 200));
      first.complete(http.Response('{"items":[{"id":"old"}]}', 200));
      await Future.wait<void>([oldRequest, newRequest]);

      expect(controller.items.single.id, 'new');
      api.close();
    },
  );

  test('fiche 404 est assainie', () async {
    final api = ApiClient(
      client: _FakeClient((request) async => http.Response('{}', 404)),
    );

    expect(
      () => SearchRepository(client: api).professional('pro-1'),
      throwsA(isA<ProfessionalNotFoundException>()),
    );
    api.close();
  });

  testWidgets('fiche publique affiche le bouton sans créer de demande', (
    tester,
  ) async {
    var calls = 0;
    final api = ApiClient(
      client: _FakeClient((request) async {
        calls++;
        return http.Response(
          '{"id":"pro-1","business_name":"Express",'
          '"headline":"Électricité","description":"Services publics",'
          '"verified":true,"rating_avg":4.8,"rating_count":12,'
          '"services":[{"title":"Dépannage"}],'
          '"portfolio":[],"location":{"division_name":"Cotonou"}}',
          200,
        );
      }),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: ProfessionalPage(
          repository: SearchRepository(client: api),
          professionalId: 'pro-1',
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Express'), findsOneWidget);
    expect(find.text('Faire une demande'), findsOneWidget);
    expect(
      tester.widget<OutlinedButton>(find.byType(OutlinedButton)).onPressed,
      isNull,
    );
    expect(calls, 1);
    api.close();
  });
}
