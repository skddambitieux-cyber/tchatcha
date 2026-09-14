import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/home/home_page.dart';

void main() {
  test('le mapping accueil ne révèle que les libellés publics', () {
    final home = homeDataFromResponses(
      '{"full_name":"Amina","roles":["CLIENT"],"access_token":"secret"}',
      '{"items":[{"id":"uuid","name":"Cotonou"}]}',
      '{"items":[{"id":"uuid","name":"Plomberie"}]}',
    );
    expect(home.fullName, 'Amina');
    expect(home.communes, ['Cotonou']);
    expect(home.categories, ['Plomberie']);
    expect(home.communes.join(), isNot(contains('uuid')));
  });

  test('un rôle absent ou invalide produit une réponse invalide', () {
    expect(
      () => homeDataFromResponses(
        '{"full_name":"Amina","roles":[]}',
        '{"items":[]}',
        '{"items":[]}',
      ),
      throwsFormatException,
    );
    expect(
      () => homeDataFromResponses(
        '{"full_name":"Amina","roles":["PROFESSIONAL"]}',
        '{"items":[]}',
        '{"items":[]}',
      ),
      throwsFormatException,
    );
  });
}
