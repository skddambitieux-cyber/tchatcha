import 'package:flutter/material.dart';

import '../requests/request_repository.dart';
import 'professional_page.dart';
import 'search_controller.dart' as search;
import 'search_repository.dart';

class SearchPage extends StatefulWidget {
  const SearchPage({
    super.key,
    required this.repository,
    required this.communes,
    required this.categories,
    this.requestRepository,
  });
  final SearchRepository repository;
  final List<CatalogOption> communes;
  final List<CatalogOption> categories;
  final RequestRepository? requestRepository;

  @override
  State<SearchPage> createState() => _SearchPageState();
}

class _SearchPageState extends State<SearchPage> {
  late final search.SearchController controller = search.SearchController(
    widget.repository,
  );
  final query = TextEditingController();
  String? categoryId;
  String? divisionId;

  @override
  void dispose() {
    query.dispose();
    controller.dispose();
    super.dispose();
  }

  SearchFilters get filters => SearchFilters(
    query: query.text,
    categoryId: categoryId,
    divisionId: divisionId,
  );

  void runSearch() {
    controller.setFilters(filters);
    controller.search();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: controller,
    builder: (context, _) => Scaffold(
      appBar: AppBar(title: const Text('Rechercher un artisan')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            controller: query,
            decoration: const InputDecoration(
              labelText: 'Métier ou besoin',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: categoryId,
            decoration: const InputDecoration(
              labelText: 'Métier',
              border: OutlineInputBorder(),
            ),
            items: widget.categories
                .map(
                  (item) =>
                      DropdownMenuItem(value: item.id, child: Text(item.name)),
                )
                .toList(),
            onChanged: (value) => setState(() => categoryId = value),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: divisionId,
            decoration: const InputDecoration(
              labelText: 'Commune',
              border: OutlineInputBorder(),
            ),
            items: widget.communes
                .map(
                  (item) =>
                      DropdownMenuItem(value: item.id, child: Text(item.name)),
                )
                .toList(),
            onChanged: (value) => setState(() => divisionId = value),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: controller.loading ? null : runSearch,
            child: const Text('Rechercher'),
          ),
          if (controller.loading && controller.items.isEmpty)
            const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: CircularProgressIndicator()),
            ),
          if (controller.error != null)
            Center(
              child: FilledButton(
                onPressed: controller.search,
                child: const Text('Réessayer'),
              ),
            ),
          if (!controller.loading &&
              controller.error == null &&
              controller.items.isEmpty)
            const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: Text('Aucun artisan trouvé.')),
            ),
          ...controller.items.map(
            (item) => Card(
              child: ListTile(
                title: Text(item.businessName ?? 'Artisan professionnel'),
                subtitle: Text(
                  [
                    if (item.category != null) item.category!,
                    if (item.commune != null) item.commune!,
                    '${item.ratingAvg.toStringAsFixed(1)} (${item.ratingCount} avis)',
                  ].join(' · '),
                ),
                trailing: item.verified
                    ? const Icon(Icons.verified, semanticLabel: 'Vérifié')
                    : null,
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => ProfessionalPage(
                      repository: widget.repository,
                      requestRepository: widget.requestRepository,
                      professionalId: item.id,
                    ),
                  ),
                ),
              ),
            ),
          ),
          if (controller.nextCursor != null)
            OutlinedButton(
              onPressed: controller.loading ? null : controller.loadMore,
              child: const Text('Charger la suite'),
            ),
        ],
      ),
    ),
  );
}
