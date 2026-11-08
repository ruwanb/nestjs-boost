import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';

@Injectable()
export class OrdersService {
  private readonly orders = [{ id: 1, userId: 1, total: 42 }];

  constructor(private readonly usersService: UsersService) {}

  findForUser(userId: number) {
    const user = this.usersService.findOne(userId);
    return { user: user.email, orders: this.orders.filter((o) => o.userId === userId) };
  }
}
