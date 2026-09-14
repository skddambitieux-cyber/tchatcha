import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app/app.dart';

void main() {
  testWidgets('smoke R-02A affiche la page d’authentification', (tester) async {
    await tester.pumpWidget(const TchatchaApp());
    expect(find.text('Demander un OTP'), findsOneWidget);
  });
}
