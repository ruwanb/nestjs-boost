import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

// Constant-time comparison; only the key's length can leak.
const sameSecret = (given: string, expected: string) => {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.API_KEY;
    const given = context.switchToHttp().getRequest().headers['x-api-key'];
    if (!expected || typeof given !== 'string' || !sameSecret(given, expected)) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
