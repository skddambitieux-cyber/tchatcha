import 'package:flutter/foundation.dart';

import 'request_repository.dart';

String requestStatusLabel(String status) => switch (status) {
  'OPEN' => 'Ouverte',
  'CANCELLED' => 'Annulée',
  'EXPIRED' => 'Expirée',
  'IN_PROGRESS' => 'En cours',
  'COMPLETED' => 'Terminée',
  _ => 'Statut indisponible',
};

class RequestsController extends ChangeNotifier {
  RequestsController(this.repository);
  final RequestRepository repository;
  final items = <ClientRequest>[];
  String? nextCursor;
  String? error;
  bool loading = false;
  int _generation = 0;

  Future<void> load({bool refresh = false}) async {
    if (loading) return;
    final generation = ++_generation;
    loading = true;
    if (refresh) {
      items.clear();
      nextCursor = null;
    }
    error = null;
    notifyListeners();
    try {
      final page = await repository.list(cursor: refresh ? null : nextCursor);
      if (generation != _generation) return;
      final previousItems = refresh || nextCursor == null
          ? const <ClientRequest>[]
          : items;
      final merged = <String, ClientRequest>{
        for (final item in previousItems) item.id: item,
      };
      for (final item in page.items) {
        merged[item.id] = item;
      }
      items
        ..clear()
        ..insertAll(0, merged.values);
      nextCursor = page.nextCursor;
    } catch (_) {
      if (generation == _generation) {
        error = 'Demandes indisponibles. Réessayez.';
      }
    } finally {
      if (generation == _generation) {
        loading = false;
        notifyListeners();
      }
    }
  }
}
