import { Controller, Get, Param } from '@nestjs/common';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(Number(id));
  }

  // Returns the signed-in user. Auth is stubbed: user 1 is always "me".
  @Get('me')
  me() {
    return this.usersService.findOne(1);
  }
}
