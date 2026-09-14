import 'dart:convert';

import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../search/search_page.dart';
import '../search/search_repository.dart';

typedef HomeLoader = Future<HomeData> Function();

class HomeData {
  const HomeData({
    required this.fullName,
    required this.role,
    required this.communes,
    required this.categories,
    this.communeOptions = const [],
    this.categoryOptions = const [],
  });
  final String fullName;
  final String role;
  final List<String> communes;
  final List<String> categories;
  final List<CatalogOption> communeOptions;
  final List<CatalogOption> categoryOptions;
}

class HomePage extends StatefulWidget {
  const HomePage({
    super.key,
    required this.load,
    required this.onLogout,
    this.api,
  });
  final HomeLoader load;
  final VoidCallback onLogout;
  final ApiClient? api;
  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  late Future<HomeData> _future = widget.load();

  void retry() => setState(() => _future = widget.load());

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Accueil'),
      actions: [
        IconButton(
          onPressed: widget.onLogout,
          icon: const Icon(Icons.logout),
          tooltip: 'Se déconnecter',
        ),
      ],
    ),
    body: FutureBuilder<HomeData>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return Center(
            child: FilledButton(
              onPressed: retry,
              child: const Text('Réessayer'),
            ),
          );
        }
        final data = snapshot.data!;
        if (data.communes.isEmpty && data.categories.isEmpty) {
          return const Center(child: Text('Aucune donnée disponible.'));
        }
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              'Bonjour ${data.fullName}',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            Text('Rôle : ${data.role}'),
            const SizedBox(height: 24),
            const Text(
              'Zone pilote',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            ...data.communes.map(
              (name) => ListTile(
                leading: const Icon(Icons.location_on_outlined),
                title: Text(name),
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Métiers disponibles',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            ...data.categories.map(
              (name) => ListTile(
                leading: const Icon(Icons.handyman_outlined),
                title: Text(name),
              ),
            ),
            if (widget.api != null) ...[
              const SizedBox(height: 20),
              FilledButton.icon(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => SearchPage(
                      repository: SearchRepository(client: widget.api!),
                      communes: data.communeOptions,
                      categories: data.categoryOptions,
                    ),
                  ),
                ),
                icon: const Icon(Icons.search),
                label: const Text('Rechercher un artisan'),
              ),
            ],
          ],
        );
      },
    ),
  );
}

HomeData homeDataFromResponses(
  String meBody,
  String divisionsBody,
  String categoriesBody,
) {
  final me = jsonDecode(meBody) as Map<String, dynamic>;
  final divisions = (jsonDecode(divisionsBody)['items'] as List)
      .cast<Map<String, dynamic>>();
  final categories = (jsonDecode(categoriesBody)['items'] as List)
      .cast<Map<String, dynamic>>();
  final roles = me['roles'];
  if (roles is! List || roles.length != 1 || roles.first != 'CLIENT') {
    throw const FormatException('Rôle de session invalide.');
  }
  return HomeData(
    fullName: (me['full_name'] ?? 'Client').toString(),
    role: roles.first.toString(),
    communes: divisions
        .where(
          (item) =>
              item['name'] == 'Cotonou' || item['name'] == 'Abomey-Calavi',
        )
        .map((item) => item['name'].toString())
        .toList(),
    categories: categories.map((item) => item['name'].toString()).toList(),
    communeOptions: divisions
        .where((item) => item['id'] != null)
        .where(
          (item) =>
              item['name'] == 'Cotonou' || item['name'] == 'Abomey-Calavi',
        )
        .map(
          (item) => CatalogOption(
            id: item['id'].toString(),
            name: item['name'].toString(),
          ),
        )
        .toList(),
    categoryOptions: categories
        .where((item) => item['id'] != null)
        .map(
          (item) => CatalogOption(
            id: item['id'].toString(),
            name: item['name'].toString(),
          ),
        )
        .toList(),
  );
}
