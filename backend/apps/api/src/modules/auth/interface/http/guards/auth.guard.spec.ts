/**
 * TCHATCHA — Tests unitaires AuthGuard — docs/33-tests-users.md §2.1 (lot 6.3.1).
 * Guard Bearer : pose request.currentUser = claims.sub ; sans garde → undefined.
 */
import { Test } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { TokenService } from '../../../application/services/token.service';
import { TokenExpiredError, RefreshUnknownError } from '../../../domain/errors/auth-errors';
import { TokenManagerPortToken } from '../../../application/ports/token-manager.port';
import { SessionRepositoryPortToken } from '../../../application/ports/session-repository.port';
import { ClockPortToken } from '../../../application/ports/clock.port';
import { UserRepositoryPortToken } from '../../../application/ports/user-repository.port';
import { EventPublisherPortToken } from '../../../application/ports/event-publisher.port';
import { currentUserFactory } from '../decorators/current-user.decorator';

function fakeContext(
  req: Partial<AuthenticatedRequest>,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
}

describe('AuthGuard — docs 33 §2.1', () => {
  let guard: AuthGuard;
  let verifyAccess: jest.Mock;

  beforeEach(async () => {
    verifyAccess = jest.fn();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthGuard,
        TokenService,
        { provide: TokenManagerPortToken, useValue: { verifyAccess } },
        { provide: SessionRepositoryPortToken, useValue: {} },
        { provide: ClockPortToken, useValue: { now: () => new Date() } },
        { provide: UserRepositoryPortToken, useValue: {} },
        { provide: EventPublisherPortToken, useValue: { publish: jest.fn() } },
      ],
    }).compile();
    guard = moduleRef.get(AuthGuard);
  });

  it('Bearer valide → request.currentUser = claims.sub', () => {
    verifyAccess.mockReturnValue({ sub: 'user-1', role: 'CLIENT' });
    const req: AuthenticatedRequest = {
      headers: { authorization: 'Bearer abc.def.ghi' },
    } as AuthenticatedRequest;
    expect(guard.canActivate(fakeContext(req))).toBe(true);
    expect(req.currentUser).toBe('user-1');
  });

  it('header absent → RefreshUnknownError (401 unauthorized)', () => {
    const req: AuthenticatedRequest = {
      headers: {},
    } as AuthenticatedRequest;
    expect(() => guard.canActivate(fakeContext(req))).toThrow(
      RefreshUnknownError,
    );
  });

  it('header non-Bearer → RefreshUnknownError', () => {
    const req: AuthenticatedRequest = {
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    } as AuthenticatedRequest;
    expect(() => guard.canActivate(fakeContext(req))).toThrow(
      RefreshUnknownError,
    );
  });

  it('token expiré → TokenExpiredError', () => {
    verifyAccess.mockImplementation(() => {
      const err = new Error('jwt expired') as Error & { name: string };
      err.name = 'TokenExpiredError';
      throw err;
    });
    const req: AuthenticatedRequest = {
      headers: { authorization: 'Bearer expired.token' },
    } as AuthenticatedRequest;
    expect(() => guard.canActivate(fakeContext(req))).toThrow(
      TokenExpiredError,
    );
  });

  it('token falsifié → RefreshUnknownError (401 unauthorized)', () => {
    verifyAccess.mockImplementation(() => {
      throw new Error('jwt malformed');
    });
    const req: AuthenticatedRequest = {
      headers: { authorization: 'Bearer bad.token' },
    } as AuthenticatedRequest;
    expect(() => guard.canActivate(fakeContext(req))).toThrow(
      RefreshUnknownError,
    );
  });
});

describe('CurrentUser decorator — docs 33 §2.1 (sans garde → undefined)', () => {
  it('renvoie undefined sans currentUser posé (pas de crash)', () => {
    const req: AuthenticatedRequest = { headers: {} } as AuthenticatedRequest;
    const value = currentUserFactory(undefined, fakeContext(req));
    expect(value).toBeUndefined();
  });

  it('renvoie le sub posé par le guard', () => {
    const req: AuthenticatedRequest = {
      headers: {},
      currentUser: 'user-42',
    } as AuthenticatedRequest;
    const value = currentUserFactory(undefined, fakeContext(req));
    expect(value).toBe('user-42');
  });
});