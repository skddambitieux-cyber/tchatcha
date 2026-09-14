import '../../core/api/api_client.dart';

class CatalogOption {
  const CatalogOption({required this.id, required this.name});
  final String id;
  final String name;
}

class SearchFilters {
  const SearchFilters({
    this.query,
    this.categoryId,
    this.divisionId,
    this.verified,
    this.minRating,
    this.minPrice,
    this.maxPrice,
    this.sort,
  });
  final String? query;
  final String? categoryId;
  final String? divisionId;
  final bool? verified;
  final double? minRating;
  final double? minPrice;
  final double? maxPrice;
  final String? sort;

  Map<String, String> toQuery({String? cursor, int limit = 20}) {
    final result = <String, String>{'country_code': 'BJ', 'limit': '$limit'};
    final trimmedQuery = query?.trim();
    if (trimmedQuery != null && trimmedQuery.isNotEmpty) {
      result['q'] = trimmedQuery;
    }
    if (categoryId case final value?) result['category_id'] = value;
    if (divisionId case final value?) result['division_id'] = value;
    if (verified case final value?) result['verified'] = '$value';
    if (minRating case final value?) result['min_rating'] = '$value';
    if (minPrice case final value?) result['min_price'] = '$value';
    if (maxPrice case final value?) result['max_price'] = '$value';
    if (sort case final value?) result['sort'] = value;
    if (cursor case final value?) result['cursor'] = value;
    return result;
  }
}

class SearchItem {
  const SearchItem({
    required this.id,
    required this.businessName,
    required this.headline,
    required this.verified,
    required this.ratingAvg,
    required this.ratingCount,
    required this.minPrice,
    required this.currency,
    required this.commune,
    required this.category,
  });
  final String id;
  final String? businessName;
  final String? headline;
  final bool verified;
  final double ratingAvg;
  final int ratingCount;
  final num? minPrice;
  final String currency;
  final String? commune;
  final String? category;

  factory SearchItem.fromJson(Map<String, dynamic> json) => SearchItem(
    id: json['id'].toString(),
    businessName: json['business_name']?.toString(),
    headline: json['headline']?.toString(),
    verified: json['verified'] == true,
    ratingAvg: (json['rating_avg'] as num?)?.toDouble() ?? 0,
    ratingCount: (json['rating_count'] as num?)?.toInt() ?? 0,
    minPrice: json['min_price'] as num?,
    currency: json['currency']?.toString() ?? '',
    commune: (json['commune'] as Map?)?['name']?.toString(),
    category: (json['primary_service'] as Map?)?['category'] is Map
        ? ((json['primary_service'] as Map)['category'] as Map)['name']
              ?.toString()
        : null,
  );
}

class SearchPageResult {
  const SearchPageResult(this.items, this.nextCursor);
  final List<SearchItem> items;
  final String? nextCursor;

  factory SearchPageResult.fromJson(Map<String, dynamic> json) =>
      SearchPageResult(
        (json['items'] as List? ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(SearchItem.fromJson)
            .toList(),
        json['next_cursor']?.toString(),
      );
}

class ProfessionalProfile {
  const ProfessionalProfile({
    required this.id,
    required this.businessName,
    required this.headline,
    required this.description,
    required this.verified,
    required this.ratingAvg,
    required this.ratingCount,
    required this.commune,
    required this.services,
    required this.portfolioCount,
  });
  final String id;
  final String? businessName;
  final String? headline;
  final String? description;
  final bool verified;
  final double ratingAvg;
  final int ratingCount;
  final String? commune;
  final List<String> services;
  final int portfolioCount;

  factory ProfessionalProfile.fromJson(Map<String, dynamic> json) =>
      ProfessionalProfile(
        id: json['id'].toString(),
        businessName: json['business_name']?.toString(),
        headline: json['headline']?.toString(),
        description: json['description']?.toString(),
        verified: json['verified'] == true,
        ratingAvg: (json['rating_avg'] as num?)?.toDouble() ?? 0,
        ratingCount: (json['rating_count'] as num?)?.toInt() ?? 0,
        commune: (json['location'] as Map?)?['division_name']?.toString(),
        services: (json['services'] as List? ?? const [])
            .whereType<Map>()
            .map((item) => item['title']?.toString())
            .whereType<String>()
            .toList(),
        portfolioCount: (json['portfolio'] as List? ?? const []).length,
      );
}

class SearchRepository {
  const SearchRepository({required this.client});
  final ApiClient client;

  Future<SearchPageResult> search(
    SearchFilters filters, {
    String? cursor,
  }) async {
    final query = Uri(queryParameters: filters.toQuery(cursor: cursor)).query;
    final response = await client.get('/search?$query');
    if (response.statusCode != 200) throw const ApiRequestException();
    return SearchPageResult.fromJson(decodeJsonMap(response.body) ?? const {});
  }

  Future<ProfessionalProfile> professional(String id) async {
    final response = await client.get(
      '/professionals/${Uri.encodeComponent(id)}',
    );
    if (response.statusCode == 404) throw const ProfessionalNotFoundException();
    if (response.statusCode != 200) throw const ApiRequestException();
    return ProfessionalProfile.fromJson(
      decodeJsonMap(response.body) ?? const {},
    );
  }
}

class ApiRequestException implements Exception {
  const ApiRequestException();
}

class ProfessionalNotFoundException implements Exception {
  const ProfessionalNotFoundException();
}
