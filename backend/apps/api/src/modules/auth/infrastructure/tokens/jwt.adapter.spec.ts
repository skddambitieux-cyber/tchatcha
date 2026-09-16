import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtAdapter } from './jwt.adapter';

describe('JwtAdapter', () => {
  const jwt = { sign: jest.fn(), verify: jest.fn() } as unknown as JwtService;

  function config(value: unknown): ConfigService {
    return {
      get: jest.fn().mockReturnValue(value),
    } as unknown as ConfigService;
  }

  it('s’initialise avec un secret JWT valide', () => {
    expect(() => new JwtAdapter(jwt, config('test-secret'))).not.toThrow();
  });

  it.each([undefined, ''])('échoue immédiatement si JWT_SECRET vaut %p', (value) => {
    expect(() => new JwtAdapter(jwt, config(value))).toThrow(
      'JWT_SECRET est obligatoire',
    );
  });

  it('ne révèle jamais la valeur du secret dans l’erreur', () => {
    const secret = 'super-secret-that-must-not-leak';
    let thrown: unknown;
    try {
      new JwtAdapter(jwt, config(''));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).not.toContain(secret);
  });
});
