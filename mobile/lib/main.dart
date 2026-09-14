import 'package:flutter/material.dart';

import 'app/app.dart';

export 'app/app.dart';
export 'core/api/api_client.dart';
export 'features/auth/auth_page.dart';

void main() => runApp(const TchatchaApp(enableSession: true));
