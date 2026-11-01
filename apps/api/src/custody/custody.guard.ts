import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import { TENANT_HEADER, resolveTenant } from '../common/tenant';
import { PrivyService } from './privy.service';

export interface CustodyCaller {
  tenant: string;
  /** Privy user ID, from a verified access token — never from the request body. */
  userId: string;
}

/** Requires a valid Privy access token for the caller's tenant. */
@Injectable()
export class CustodyAuthGuard implements CanActivate {
  constructor(private readonly privy: PrivyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const tenant = resolveTenant(request.headers[TENANT_HEADER]);

    const header: unknown = request.headers.authorization;
    const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw new UnauthorizedException('Sign in to use your wallet');

    const caller: CustodyCaller = { tenant, userId: await this.privy.verify(tenant, token) };
    request.custody = caller;
    return true;
  }
}

export const Caller = createParamDecorator(
  (_: unknown, context: ExecutionContext): CustodyCaller => context.switchToHttp().getRequest().custody,
);
