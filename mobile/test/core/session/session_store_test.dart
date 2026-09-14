import 'package:mobile/core/session/session_store.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('MemorySessionStore conserve puis efface les deux tokens', () async {
    final store = MemorySessionStore();
    const tokens = SessionTokens(
      accessToken: 'access',
      refreshToken: 'refresh',
    );
    await store.write(tokens);
    expect((await store.read())?.refreshToken, 'refresh');
    await store.clear();
    expect(await store.read(), isNull);
  });

  test(
    'DeviceIdProvider génère une fois puis réutilise l’identifiant',
    () async {
      final store = MemorySessionStore();
      var generations = 0;
      final provider = DeviceIdProvider(
        store: store,
        generate: () {
          generations++;
          return 'device-test';
        },
      );

      expect(await provider.getOrCreate(), 'device-test');
      expect(await provider.getOrCreate(), 'device-test');
      expect(generations, 1);
      expect(await store.readDeviceId(), 'device-test');
    },
  );
}
