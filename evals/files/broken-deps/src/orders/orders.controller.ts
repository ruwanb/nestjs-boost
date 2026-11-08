import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { OrdersService } from './orders.service.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('user/:userId')
  findForUser(@Param('userId', ParseIntPipe) userId: number) {
    return this.ordersService.findForUser(userId);
  }
}
