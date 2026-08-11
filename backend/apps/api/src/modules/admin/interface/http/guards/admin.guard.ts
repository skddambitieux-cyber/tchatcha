import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { AuthGuard } from '../../../../auth/interface/http/guards/auth.guard';
import { UserRepositoryPortToken } from '../../../../auth/application/ports/user-repository.port';
import type { UserRepositoryPort } from '../../../../auth/application/ports/user-repository.port';
import { UserRole } from '../../../../auth/domain/entities/user-role';
import type { AuthenticatedRequest } from '../../../../auth/interface/http/guards/auth.guard';
import { ForbiddenError } from '../../../domain/errors/admin-errors';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly auth: AuthGuard,
    @Inject(UserRepositoryPortToken) private readonly users: UserRepositoryPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    this.auth.canActivate(context);
    const userId = context.switchToHttp().getRequest<AuthenticatedRequest>().currentUser;
    if (!userId || (await this.users.findRole(userId)) !== UserRole.ADMIN) {
      throw new ForbiddenError();
    }
    return true;
  }
}
