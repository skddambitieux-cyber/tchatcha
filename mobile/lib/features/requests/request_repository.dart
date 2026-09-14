import 'package:uuid/uuid.dart';

import '../../core/api/api_client.dart';

typedef RequestGet = Future<ApiResponse> Function(String path);
typedef RequestPost = Future<ApiResponse> Function(
  String path,
  Map<String, dynamic> body, {
  Map<String, String> headers,
});

class ClientRequest {
  const ClientRequest({
    required this.id,
    required this.category,
    required this.title,
    required this.description,
    required this.division,
    required this.desiredDate,
    required this.urgency,
    required this.status,
    required this.createdAt,
  });
  final String id;
  final String category;
  final String title;
  final String description;
  final String? division;
  final String? desiredDate;
  final String urgency;
  final String status;
  final String createdAt;

  factory ClientRequest.fromJson(Map<String, dynamic> json) => ClientRequest(
    id: json['id'].toString(),
    category: json['category_name']?.toString() ?? '',
    title: json['title']?.toString() ?? '',
    description: json['description']?.toString() ?? '',
    division: json['division_name']?.toString(),
    desiredDate: json['desired_date']?.toString(),
    urgency: json['urgency']?.toString() ?? '',
    status: json['status']?.toString() ?? '',
    createdAt: json['created_at']?.toString() ?? '',
  );
}

class RequestPageResult {
  const RequestPageResult(this.items, this.nextCursor);
  final List<ClientRequest> items;
  final String? nextCursor;

  factory RequestPageResult.fromJson(Map<String, dynamic> json) =>
      RequestPageResult(
        (json['items'] as List? ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(ClientRequest.fromJson)
            .toList(),
        json['next_cursor']?.toString(),
      );
}

class RequestRepository {
  const RequestRepository({
    required this.client,
    this.authorizedGet,
    this.authorizedPost,
  });
  final ApiClient client;
  final RequestGet? authorizedGet;
  final RequestPost? authorizedPost;

  Future<ApiResponse> _get(String path) =>
      authorizedGet?.call(path) ?? client.get(path);

  Future<ApiResponse> _post(
    String path,
    Map<String, dynamic> body, {
    Map<String, String> headers = const {},
  }) =>
      authorizedPost?.call(path, body, headers: headers) ??
      client.post(path, body, headers: headers);

  Future<RequestPageResult> list({String? cursor, int limit = 20}) async {
    if (limit < 1 || limit > 50) {
      throw const RequestValidationException(
        'limite',
        'La limite doit être comprise entre 1 et 50.',
      );
    }
    final parameters = <String, String>{'limit': '$limit'};
    if (cursor case final value?) parameters['cursor'] = value;
    final query = Uri(queryParameters: parameters).query;
    final response = await _get('/requests?$query');
    if (response.statusCode != 200) throw const RequestApiException();
    return RequestPageResult.fromJson(decodeJsonMap(response.body) ?? const {});
  }

  Future<ClientRequest> detail(String id) async {
    final response = await _get('/requests/${Uri.encodeComponent(id)}');
    if (response.statusCode == 404) throw const RequestNotFoundException();
    if (response.statusCode != 200) throw const RequestApiException();
    return ClientRequest.fromJson(decodeJsonMap(response.body) ?? const {});
  }

  Future<ClientRequest> create({
    required String categoryId,
    required String title,
    required String description,
    required String divisionId,
    num? budgetMin,
    num? budgetMax,
    String? desiredDate,
    String urgency = 'NORMAL',
    double? lat,
    double? lon,
    String? idempotencyKey,
  }) async {
    _validateCreate(
      title: title,
      description: description,
      budgetMin: budgetMin,
      budgetMax: budgetMax,
      desiredDate: desiredDate,
      urgency: urgency,
      lat: lat,
      lon: lon,
      idempotencyKey: idempotencyKey,
    );
    final key = idempotencyKey ?? const Uuid().v4();
    final body = <String, dynamic>{
      'category_id': categoryId,
      'title': title.trim(),
      'description': description.trim(),
      'urgency': urgency,
      'location': {'division_id': divisionId},
    };
    if (budgetMin case final value?) body['budget_min'] = value;
    if (budgetMax case final value?) body['budget_max'] = value;
    if (desiredDate case final value?) body['desired_date'] = value;
    if (lat != null && lon != null) {
      (body['location'] as Map<String, dynamic>)
        ..['lat'] = lat
        ..['lon'] = lon;
    }
    final response = await _post(
      '/requests',
      body,
      headers: {'Idempotency-Key': key},
    );
    if (response.statusCode != 201) {
      throw RequestApiException(response.statusCode);
    }
    return ClientRequest.fromJson(decodeJsonMap(response.body) ?? const {});
  }

  void _validateCreate({
    required String title,
    required String description,
    required num? budgetMin,
    required num? budgetMax,
    required String? desiredDate,
    required String urgency,
    required double? lat,
    required double? lon,
    required String? idempotencyKey,
  }) {
    final titleLength = title.trim().length;
    if (titleLength < 1 || titleLength > 160) {
      throw const RequestValidationException(
        'titre',
        'Le titre doit contenir entre 1 et 160 caractères.',
      );
    }
    final descriptionLength = description.trim().length;
    if (descriptionLength < 1 || descriptionLength > 2000) {
      throw const RequestValidationException(
        'description',
        'La description doit contenir entre 1 et 2000 caractères.',
      );
    }
    if (budgetMin != null && (budgetMin < 0 || !_isFinite(budgetMin))) {
      throw const RequestValidationException(
        'budget_min',
        'Le budget minimum doit être positif ou nul.',
      );
    }
    if (budgetMax != null && (budgetMax < 0 || !_isFinite(budgetMax))) {
      throw const RequestValidationException(
        'budget_max',
        'Le budget maximum doit être positif ou nul.',
      );
    }
    if (budgetMin != null && budgetMax != null && budgetMin > budgetMax) {
      throw const RequestValidationException(
        'budget',
        'Le budget minimum ne peut pas dépasser le maximum.',
      );
    }
    if (desiredDate != null) {
      final parsedDate = DateTime.tryParse(desiredDate);
      if (parsedDate == null || !parsedDate.isAfter(DateTime.now())) {
        throw const RequestValidationException(
          'date',
          'La date souhaitée doit être une date future valide.',
        );
      }
    }
    if (!const {'LOW', 'NORMAL', 'HIGH', 'EMERGENCY'}.contains(urgency)) {
      throw const RequestValidationException(
        'urgence',
        'Le niveau d’urgence sélectionné est invalide.',
      );
    }
    if ((lat == null) != (lon == null)) {
      throw const RequestValidationException(
        'coordonnées',
        'La latitude et la longitude doivent être fournies ensemble.',
      );
    }
    if (lat != null && (lat < -90 || lat > 90)) {
      throw const RequestValidationException(
        'latitude',
        'La latitude est invalide.',
      );
    }
    if (lon != null && (lon < -180 || lon > 180)) {
      throw const RequestValidationException(
        'longitude',
        'La longitude est invalide.',
      );
    }
    if (idempotencyKey != null &&
        !RegExp(
          r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
          caseSensitive: false,
        ).hasMatch(idempotencyKey)) {
      throw const RequestValidationException(
        'idempotence',
        'La clé d’idempotence est invalide.',
      );
    }
  }

  bool _isFinite(num value) => value is! double || value.isFinite;
}

class RequestApiException implements Exception {
  const RequestApiException([this.statusCode]);
  final int? statusCode;
}

class RequestNotFoundException implements Exception {
  const RequestNotFoundException();
}

class RequestValidationException implements Exception {
  const RequestValidationException(this.field, this.message);
  final String field;
  final String message;
}
