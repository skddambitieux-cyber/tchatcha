import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';

import 'request_repository.dart';
import 'requests_controller.dart';
import '../search/search_repository.dart';

class RequestPage extends StatefulWidget {
  const RequestPage({
    super.key,
    required this.repository,
    required this.categoryId,
    required this.divisionId,
    this.categoryLabel,
    this.divisionLabel,
    this.categories = const [],
    this.divisions = const [],
  });
  final RequestRepository repository;
  final String? categoryId;
  final String? divisionId;
  final String? categoryLabel;
  final String? divisionLabel;
  final List<CatalogOption> categories;
  final List<CatalogOption> divisions;

  @override
  State<RequestPage> createState() => _RequestPageState();
}

class _RequestPageState extends State<RequestPage> {
  final title = TextEditingController();
  final description = TextEditingController();
  final budgetMin = TextEditingController();
  final budgetMax = TextEditingController();
  bool sending = false;
  String? message;
  String? idempotencyKey;
  String? selectedCategoryId;
  String? selectedDivisionId;

  @override
  void initState() {
    super.initState();
    selectedCategoryId = widget.categoryId;
    selectedDivisionId = widget.divisionId;
  }

  @override
  void dispose() {
    title.dispose();
    description.dispose();
    budgetMin.dispose();
    budgetMax.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    if (sending) return;
    if (selectedCategoryId == null || selectedDivisionId == null) {
      setState(() => message = 'Catégorie ou commune indisponible.');
      return;
    }
    if (title.text.trim().isEmpty || description.text.trim().isEmpty) {
      setState(() => message = 'Complétez le titre et la description.');
      return;
    }
    final min = num.tryParse(budgetMin.text.trim());
    final max = num.tryParse(budgetMax.text.trim());
    if (budgetMin.text.trim().isNotEmpty && min == null ||
        budgetMax.text.trim().isNotEmpty && max == null ||
        min != null && max != null && min > max) {
      setState(() => message = 'Vérifiez la fourchette de budget.');
      return;
    }
    setState(() {
      sending = true;
      message = null;
    });
    try {
      idempotencyKey ??= const Uuid().v4();
      final created = await widget.repository.create(
        categoryId: selectedCategoryId!,
        divisionId: selectedDivisionId!,
        title: title.text,
        description: description.text,
        budgetMin: min,
        budgetMax: max,
        idempotencyKey: idempotencyKey,
      );
      if (!mounted) return;
      await Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => RequestDetailPage(
            repository: widget.repository,
            requestId: created.id,
          ),
        ),
      );
    } on RequestValidationException catch (error) {
      if (mounted) setState(() => message = error.message);
    } catch (_) {
      if (mounted) {
        setState(() => message = 'Publication impossible. Réessayez.');
      }
    } finally {
      if (mounted) setState(() => sending = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Faire une demande')),
    body: ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (widget.categories.isNotEmpty)
          DropdownButtonFormField<String>(
            key: const ValueKey('request-category-field'),
            initialValue: selectedCategoryId,
            decoration: const InputDecoration(
              labelText: 'Catégorie',
              border: OutlineInputBorder(),
            ),
            items: widget.categories
                .map(
                  (option) => DropdownMenuItem(
                    value: option.id,
                    child: Text(option.name),
                  ),
                )
                .toList(),
            onChanged: sending
                ? null
                : (value) => setState(() => selectedCategoryId = value),
          )
        else if (widget.categoryLabel != null)
          InputDecorator(
            decoration: const InputDecoration(
              labelText: 'Catégorie',
              border: OutlineInputBorder(),
            ),
            child: Text(widget.categoryLabel!),
          ),
        if (widget.categories.isNotEmpty || widget.categoryLabel != null)
          const SizedBox(height: 12),
        if (widget.divisions.isNotEmpty)
          DropdownButtonFormField<String>(
            key: const ValueKey('request-division-field'),
            initialValue: selectedDivisionId,
            decoration: const InputDecoration(
              labelText: 'Commune',
              border: OutlineInputBorder(),
            ),
            items: widget.divisions
                .map(
                  (option) => DropdownMenuItem(
                    value: option.id,
                    child: Text(option.name),
                  ),
                )
                .toList(),
            onChanged: sending
                ? null
                : (value) => setState(() => selectedDivisionId = value),
          )
        else if (widget.divisionLabel != null)
          InputDecorator(
            decoration: const InputDecoration(
              labelText: 'Commune',
              border: OutlineInputBorder(),
            ),
            child: Text(widget.divisionLabel!),
          ),
        if (widget.divisions.isNotEmpty || widget.divisionLabel != null)
          const SizedBox(height: 12),
        TextField(
          controller: title,
          decoration: const InputDecoration(
            labelText: 'Titre',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: description,
          maxLines: 5,
          decoration: const InputDecoration(
            labelText: 'Description',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: budgetMin,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(
            labelText: 'Budget minimum',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: budgetMax,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(
            labelText: 'Budget maximum',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 16),
        FilledButton(
          key: const ValueKey('request-submit-button'),
          onPressed: sending ? null : submit,
          child: Text(sending ? 'Envoi…' : 'Publier la demande'),
        ),
        if (message != null)
          Padding(
            padding: const EdgeInsets.only(top: 16),
            child: Text(message!),
          ),
      ],
    ),
  );
}

class RequestDetailPage extends StatelessWidget {
  const RequestDetailPage({
    super.key,
    required this.repository,
    required this.requestId,
  });
  final RequestRepository repository;
  final String requestId;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Détail de la demande')),
    body: FutureBuilder<ClientRequest>(
      future: repository.detail(requestId),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return const Center(child: Text('Demande indisponible.'));
        }
        final request = snapshot.data!;
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              request.title,
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            Text(requestStatusLabel(request.status)),
            Text(request.category),
            if (request.division != null) Text('Zone : ${request.division}'),
            const SizedBox(height: 16),
            Text(request.description),
          ],
        );
      },
    ),
  );
}
