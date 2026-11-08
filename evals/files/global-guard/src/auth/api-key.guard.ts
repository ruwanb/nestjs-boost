import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.API_KEY;
    const request = context.switchToHttp().getRequest();
    if (!expected || request.headers['x-api-key'] !== expected) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
