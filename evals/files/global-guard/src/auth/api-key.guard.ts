import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (value: string) => createHash('sha256').update(value).digest();

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.API_KEY;
    const given = context.switchToHttp().getRequest().headers['x-api-key'];
    if (!expected || typeof given !== 'string' || !timingSafeEqual(digest(given), digest(expected))) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
