import 'package:flutter/material.dart';

import 'search_repository.dart';

class ProfessionalPage extends StatelessWidget {
  const ProfessionalPage({
    super.key,
    required this.repository,
    required this.professionalId,
  });
  final SearchRepository repository;
  final String professionalId;

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
              onPressed: null,
              child: const Text('Faire une demande'),
            ),
          ],
        );
      },
    ),
  );
}
