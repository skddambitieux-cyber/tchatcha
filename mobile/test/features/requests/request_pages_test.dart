import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/api/api_client.dart';
import 'package:mobile/features/requests/request_page.dart';
import 'package:mobile/features/requests/request_repository.dart';
import 'package:mobile/features/requests/requests_page.dart';
import 'package:mobile/features/home/home_page.dart';
import 'package:mobile/features/search/search_repository.dart';

void main() {
  testWidgets('erreur réseau assainie, retry idempotent et détail réel', (
    tester,
  ) async {
    var posts = 0;
    final keys = <String>[];
    final api = ApiClient();
    final repository = RequestRepository(
      client: api,
      authorizedPost: (path, body, {headers = const {}}) async {
        posts++;
        keys.add(headers['Idempotency-Key']!);
        if (posts == 1) {
          throw const ApiNetworkException('offline at http://secret');
        }
        return const ApiResponse(
          201,
          '{"id":"request-1","title":"Réparer","description":"Cuisine",'
          '"status":"OPEN","created_at":"2026-09-14"}',
        );
      },
      authorizedGet: (path) async => const ApiResponse(
        200,
        '{"id":"request-1","title":"Réparer","description":"Cuisine",'
        '"category_name":"Plomberie","status":"OPEN",'
        '"created_at":"2026-09-14"}',
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: RequestPage(
          repository: repository,
          categoryId: 'category-1',
          divisionId: 'division-1',
        ),
      ),
    );
    await tester.enterText(find.byType(TextField).at(0), 'Réparer');
    await tester.enterText(find.byType(TextField).at(1), 'Cuisine');
    await tester.tap(find.text('Publier la demande'));
    await tester.pump();

    expect(find.text('Publication impossible. Réessayez.'), findsOneWidget);
    expect(find.textContaining('offline'), findsNothing);
    expect(find.textContaining('http://'), findsNothing);

    await tester.tap(find.text('Publier la demande'));
    await tester.pumpAndSettle();

    expect(posts, 2);
    expect(keys[1], keys[0]);
    expect(find.text('Réparer'), findsOneWidget);
    expect(find.text('Ouverte'), findsOneWidget);
  });

  testWidgets('double pression pendant le POST ne produit qu’une requête', (
    tester,
  ) async {
    final response = Completer<ApiResponse>();
    var posts = 0;
    final api = ApiClient();
    final repository = RequestRepository(
      client: api,
      authorizedPost: (path, body, {headers = const {}}) {
        posts++;
        return response.future;
      },
    );

    await tester.pumpWidget(
      MaterialApp(
        home: RequestPage(
          repository: repository,
          categoryId: 'category-1',
          divisionId: 'division-1',
        ),
      ),
    );
    await tester.enterText(find.byType(TextField).at(0), 'Titre');
    await tester.enterText(find.byType(TextField).at(1), 'Description');
    final submitFinder = find.widgetWithText(
      FilledButton,
      'Publier la demande',
    );
    final submit = tester.widget<FilledButton>(submitFinder).onPressed!;
    submit();
    submit();
    await tester.pump();
    expect(posts, 1);
    expect(
      tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
      isNull,
    );

    response.complete(
      const ApiResponse(
        201,
        '{"id":"request-1","title":"Titre","description":"Description",'
        '"status":"OPEN","created_at":"2026-09-14"}',
      ),
    );
    await tester.pumpAndSettle();
  });

  testWidgets('Mes demandes affiche erreur, réessaie puis ouvre le détail', (
    tester,
  ) async {
    var listCalls = 0;
    final api = ApiClient();
    final repository = RequestRepository(
      client: api,
      authorizedGet: (path) async {
        if (path.startsWith('/requests?')) {
          listCalls++;
          if (listCalls == 1) throw const ApiNetworkException('offline');
          return const ApiResponse(
            200,
            '{"items":[{"id":"request-1","title":"Fuite",'
            '"description":"Cuisine","status":"OPEN",'
            '"created_at":"2026-09-14"}],"next_cursor":null}',
          );
        }
        return const ApiResponse(
          200,
          '{"id":"request-1","title":"Fuite","description":"Cuisine",'
          '"status":"OPEN","created_at":"2026-09-14"}',
        );
      },
    );

    await tester.pumpWidget(
      MaterialApp(home: RequestsPage(repository: repository)),
    );
    await tester.pump();
    expect(find.text('Réessayer'), findsOneWidget);
    expect(find.text('offline'), findsNothing);

    await tester.tap(find.text('Réessayer'));
    await tester.pumpAndSettle();
    expect(find.text('Fuite'), findsOneWidget);
    await tester.tap(find.text('Fuite'));
    await tester.pumpAndSettle();
    expect(find.text('Détail de la demande'), findsOneWidget);
    expect(find.text('Ouverte'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('Mes demandes'), findsOneWidget);
  });

  testWidgets('accueil ouvre la création avec les libellés des catalogues', (
    tester,
  ) async {
    final api = ApiClient();
    final repository = RequestRepository(
      client: api,
      authorizedPost: (path, body, {headers = const {}}) async =>
          const ApiResponse(201, '{}'),
    );
    const categoryId = '11111111-1111-4111-8111-111111111111';
    const divisionId = '22222222-2222-4222-8222-222222222222';
    await tester.pumpWidget(
      MaterialApp(
        home: HomePage(
          load: () async => const HomeData(
            fullName: 'Client',
            role: 'CLIENT',
            communes: ['Cotonou'],
            categories: ['Plomberie'],
            communeOptions: [CatalogOption(id: divisionId, name: 'Cotonou')],
            categoryOptions: [CatalogOption(id: categoryId, name: 'Plomberie')],
          ),
          onLogout: () {},
          requestRepository: repository,
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Faire une demande'));
    await tester.pumpAndSettle();

    final categoryField = find.byKey(const ValueKey('request-category-field'));
    await tester.ensureVisible(categoryField);
    await tester.pumpAndSettle();
    await tester.tap(categoryField);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Plomberie').last);
    final divisionField = find.byKey(const ValueKey('request-division-field'));
    await tester.ensureVisible(divisionField);
    await tester.pumpAndSettle();
    await tester.tap(divisionField);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cotonou').last);
    expect(find.text('Plomberie'), findsOneWidget);
    expect(find.text('Cotonou'), findsOneWidget);
    expect(find.text(categoryId), findsNothing);
    expect(find.text(divisionId), findsNothing);
    expect(find.text('Mes demandes'), findsNothing);
  });
}
