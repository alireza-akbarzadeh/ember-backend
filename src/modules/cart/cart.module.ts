import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { CartController } from './cart.controller';
import { CartRepository } from './cart.repository';
import { CartService } from './cart.service';

@Module({
  // Checkout delegates to OrdersService so pricing lives in exactly one place.
  imports: [OrdersModule, RestaurantsModule],
  controllers: [CartController],
  providers: [CartService, CartRepository],
})
export class CartModule {}
