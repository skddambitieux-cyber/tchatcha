import { AdminGuard } from './admin.guard';
import { UserRole } from '../../../../auth/domain/entities/user-role';

function context(user = 'u1') {
  return { switchToHttp: () => ({ getRequest: () => ({ currentUser: user }) }) } as never;
}

describe('AdminGuard', () => {
  it('authentifie puis relit ADMIN en base', async () => {
    const auth = { canActivate: jest.fn() };
    const users = { findRole: jest.fn().mockResolvedValue(UserRole.ADMIN) };
    await expect(new AdminGuard(auth as never, users as never).canActivate(context())).resolves.toBe(true);
    expect(auth.canActivate).toHaveBeenCalled();
    expect(users.findRole).toHaveBeenCalledWith('u1');
  });
  it('refuse un rôle non admin même avec un JWT accepté', async () => {
    const guard = new AdminGuard({ canActivate: jest.fn() } as never,
      { findRole: jest.fn().mockResolvedValue(UserRole.PROFESSIONAL) } as never);
    await expect(guard.canActivate(context())).rejects.toMatchObject({ code: 'forbidden' });
  });
});
