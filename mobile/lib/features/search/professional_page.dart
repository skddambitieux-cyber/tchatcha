import 'package:flutter/material.dart';

import '../requests/request_page.dart';
import '../requests/request_repository.dart';
import 'search_repository.dart';

class ProfessionalPage extends StatelessWidget {
  const ProfessionalPage({
    super.key,
    required this.repository,
    required this.professionalId,
    this.requestRepository,
  });
  final SearchRepository repository;
  final String professionalId;
  final RequestRepository? requestRepository;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Fiche professionnelle')),
    body: FutureBuilder<ProfessionalProfile>(
      future: repository.professional(professionalId),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          final notFound = snapshot.error is ProfessionalNotFoundException;
          return Center(
            child: Text(
              notFound ? 'Professionnel indisponible.' : 'Fiche indisponible.',
            ),
          );
        }
        final profile = snapshot.data!;
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              profile.businessName ?? 'Artisan professionnel',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            if (profile.headline != null) Text(profile.headline!),
            if (profile.verified)
              const Chip(label: Text('Vérifié'), avatar: Icon(Icons.verified)),
            if (profile.commune != null) Text('Zone : ${profile.commune}'),
            Text(
              '${profile.ratingAvg.toStringAsFixed(1)} · ${profile.ratingCount} avis',
            ),
            if (profile.description != null) ...[
              const SizedBox(height: 16),
              Text(profile.description!),
            ],
            if (profile.services.isNotEmpty) ...[
              const SizedBox(height: 16),
              const Text(
                'Services',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
              ...profile.services.map(
                (service) => ListTile(title: Text(service)),
              ),
            ],
            if (profile.portfolioCount > 0)
              Text('Réalisations : ${profile.portfolioCount}'),
            const SizedBox(height: 24),
            OutlinedButton(
              onPressed:
                  profile.categoryId == null || profile.divisionId == null
                  ? null
                  : () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => RequestPage(
                          repository:
                              requestRepository ??
                              RequestRepository(client: repository.client),
                          categoryId: profile.categoryId,
                          divisionId: profile.divisionId,
                          categoryLabel: profile.categoryName,
                          divisionLabel: profile.commune,
                          categories: [
                            if (profile.categoryId != null &&
                                profile.categoryName != null)
                              CatalogOption(
                                id: profile.categoryId!,
                                name: profile.categoryName!,
                              ),
                          ],
                          divisions: [
                            if (profile.divisionId != null &&
                                profile.commune != null)
                              CatalogOption(
                                id: profile.divisionId!,
                                name: profile.commune!,
                              ),
                          ],
                        ),
                      ),
                    ),
              child: const Text('Faire une demande'),
            ),
            const SizedBox(height: 8),
            const Text(
              'La demande sera visible par les professionnels disponibles dans la zone sélectionnée ; elle n’est pas adressée exclusivement à cet artisan.',
            ),
          ],
        );
      },
    ),
  );
}
