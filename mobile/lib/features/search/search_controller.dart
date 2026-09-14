import 'package:flutter/foundation.dart';

import 'search_repository.dart';

class SearchController extends ChangeNotifier {
  SearchController(this.repository);
  final SearchRepository repository;
  SearchFilters filters = const SearchFilters();
  final items = <SearchItem>[];
  String? nextCursor;
  String? error;
  bool loading = false;
  int _generation = 0;

  void setFilters(SearchFilters value) {
    filters = value;
    _generation++;
    nextCursor = null;
    items.clear();
    error = null;
    loading = false;
    notifyListeners();
  }

  Future<void> search() async {
    if (loading) return;
    final generation = _generation;
    loading = true;
    error = null;
    notifyListeners();
    try {
      final page = await repository.search(filters);
      if (generation != _generation) return;
      items
        ..clear()
        ..addAll(page.items);
      nextCursor = page.nextCursor;
    } catch (_) {
      if (generation == _generation) {
        error = 'Recherche indisponible. Réessayez.';
      }
    } finally {
      if (generation == _generation) {
        loading = false;
        notifyListeners();
      }
    }
  }

  Future<void> loadMore() async {
    if (loading || nextCursor == null) return;
    final generation = _generation;
    loading = true;
    notifyListeners();
    try {
      final page = await repository.search(filters, cursor: nextCursor);
      if (generation != _generation) return;
      items.addAll(page.items);
      nextCursor = page.nextCursor;
    } catch (_) {
      if (generation == _generation) error = 'Impossible de charger la suite.';
    } finally {
      if (generation == _generation) {
        loading = false;
        notifyListeners();
      }
    }
  }
}
