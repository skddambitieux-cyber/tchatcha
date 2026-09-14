import 'package:flutter/material.dart';

import 'request_page.dart';
import 'request_repository.dart';
import 'requests_controller.dart';

class RequestsPage extends StatefulWidget {
  const RequestsPage({super.key, required this.repository});
  final RequestRepository repository;
  @override
  State<RequestsPage> createState() => _RequestsPageState();
}

class _RequestsPageState extends State<RequestsPage> {
  late final RequestsController controller = RequestsController(
    widget.repository,
  );
  @override
  void initState() {
    super.initState();
    controller.addListener(_changed);
    controller.load();
  }

  void _changed() => setState(() {});
  @override
  void dispose() {
    controller.removeListener(_changed);
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Mes demandes')),
    body: controller.loading && controller.items.isEmpty
        ? const Center(child: CircularProgressIndicator())
        : controller.error != null
        ? Center(
            child: FilledButton(
              onPressed: controller.load,
              child: const Text('Réessayer'),
            ),
          )
        : controller.items.isEmpty
        ? const Center(child: Text('Vous n’avez pas encore publié de demande.'))
        : RefreshIndicator(
            onRefresh: () => controller.load(refresh: true),
            child: ListView.builder(
              itemCount:
                  controller.items.length +
                  (controller.nextCursor == null ? 0 : 1),
              itemBuilder: (context, index) {
                if (index == controller.items.length) {
                  controller.load();
                  return const Padding(
                    padding: EdgeInsets.all(16),
                    child: Center(child: CircularProgressIndicator()),
                  );
                }
                final request = controller.items[index];
                return ListTile(
                  title: Text(request.title),
                  subtitle: Text(
                    '${requestStatusLabel(request.status)}${request.division == null ? '' : ' · ${request.division}'}',
                  ),
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => RequestDetailPage(
                        repository: widget.repository,
                        requestId: request.id,
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
  );
}
