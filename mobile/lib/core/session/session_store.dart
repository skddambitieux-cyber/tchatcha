import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:uuid/uuid.dart';

class SessionTokens {
  const SessionTokens({required this.accessToken, required this.refreshToken});
  final String accessToken;
  final String refreshToken;
}

abstract interface class SessionStore {
  Future<SessionTokens?> read();
  Future<void> write(SessionTokens tokens);
  Future<void> clear();
  Future<String?> readDeviceId();
  Future<void> writeDeviceId(String deviceId);
}

class SecureSessionStore implements SessionStore {
  SecureSessionStore({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();
  static const _sessionKey = 'tchatcha.session';
  static const _deviceIdKey = 'tchatcha.device_id';
  final FlutterSecureStorage _storage;

  @override
  Future<SessionTokens?> read() async {
    final raw = await _storage.read(key: _sessionKey);
    if (raw == null) return null;
    try {
      final value = jsonDecode(raw) as Map<String, dynamic>;
      final access = value['access_token']?.toString();
      final refresh = value['refresh_token']?.toString();
      if (access == null ||
          refresh == null ||
          access.isEmpty ||
          refresh.isEmpty) {
        return null;
      }
      return SessionTokens(accessToken: access, refreshToken: refresh);
    } on FormatException {
      return null;
    }
  }

  @override
  Future<void> write(SessionTokens tokens) async {
    await _storage.write(
      key: _sessionKey,
      value: jsonEncode({
        'access_token': tokens.accessToken,
        'refresh_token': tokens.refreshToken,
      }),
    );
  }

  @override
  Future<void> clear() async {
    await _storage.delete(key: _sessionKey);
  }

  @override
  Future<String?> readDeviceId() => _storage.read(key: _deviceIdKey);

  @override
  Future<void> writeDeviceId(String deviceId) =>
      _storage.write(key: _deviceIdKey, value: deviceId);
}

class MemorySessionStore implements SessionStore {
  SessionTokens? tokens;
  String? deviceId;
  @override
  Future<SessionTokens?> read() async => tokens;
  @override
  Future<void> write(SessionTokens value) async => tokens = value;
  @override
  Future<void> clear() async => tokens = null;

  @override
  Future<String?> readDeviceId() async => deviceId;

  @override
  Future<void> writeDeviceId(String value) async => deviceId = value;
}

class DeviceIdProvider {
  DeviceIdProvider({required this.store, String Function()? generate})
    : _generate = generate ?? const Uuid().v4;

  final SessionStore store;
  final String Function() _generate;

  Future<String> getOrCreate() async {
    final existing = await store.readDeviceId();
    if (existing != null && existing.isNotEmpty) return existing;
    final created = _generate();
    await store.writeDeviceId(created);
    return created;
  }
}
