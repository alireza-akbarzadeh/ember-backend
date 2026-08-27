import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Order } from '../../database/schema/orders';
import type { AuthenticatedUser } from '../auth/auth.types';
import { MenuItemsService } from '../restaurants/menu-items.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { CreateOrderDto, OrderItemInputDto } from './dto/create-order.dto';
import { ListOrdersQueryDto } from './dto/list-orders.query.dto';
import { OrderResponseDto, type OrderWithItems } from './dto/order-response.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { checkTransition, type OrderActor } from './order-status';
import { type FindOrdersOptions, type NewOrderLine, OrdersRepository } from './orders.repository';
import { MESSAGES } from '../../common/messages';

@Injectable()
export class OrdersService {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly restaurants: RestaurantsService,
    private readonly menuItems: MenuItemsService,
  ) {}

  /**
   * Prices and places an order.
   *
   * Every number on the resulting row is derived here from the current menu —
   * the request contributes item ids and quantities and nothing else. This is
   * the single most important rule in the module: a client that could name its
   * own price would be a payment bug, not a validation one.
   */
  async create(customer: AuthenticatedUser, dto: CreateOrderDto): Promise<OrderResponseDto> {
    const restaurant = await this.restaurants.requireById(dto.restaurantId);

    if (!restaurant.isOpen) {
      throw new ConflictException(MESSAGES.restaurants.closed);
    }

    const quantities = mergeQuantities(dto.items);
    const found = await this.menuItems.findOrderableItems(restaurant.id, [...quantities.keys()]);
    const byId = new Map(found.map((item) => [item.id, item]));

    const missing: string[] = [];
    const unavailable: string[] = [];
    const lines: NewOrderLine[] = [];

    for (const [menuItemId, quantity] of quantities) {
      const item = byId.get(menuItemId);

      // Absent means "not on *this* restaurant's menu" — the batch lookup is
      // scoped, so an id belonging to another restaurant lands here too.
      if (!item) {
        missing.push(menuItemId);
        continue;
      }
      if (!item.isAvailable) {
        unavailable.push(item.name);
        continue;
      }

      lines.push({
        menuItemId: item.id,
        nameSnapshot: item.name,
        unitPriceCents: item.priceCents,
        quantity,
        lineTotalCents: item.priceCents * quantity,
      });
    }

    if (missing.length > 0) {
      throw new BadRequestException(MESSAGES.orders.unknownItems(missing));
    }
    if (unavailable.length > 0) {
      throw new ConflictException(MESSAGES.orders.unavailableItems(unavailable));
    }

    const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
    const deliveryFeeCents = restaurant.deliveryFeeCents;

    // Enforced here rather than only in the cart, so posting straight to
    // /orders cannot slip under a restaurant's minimum.
    if (subtotalCents < restaurant.minimumOrderCents) {
      throw new ConflictException(MESSAGES.cart.belowMinimum);
    }

    const order = await this.orders.createWithItems(
      {
        customerId: customer.id,
        restaurantId: restaurant.id,
        subtotalCents,
        deliveryFeeCents,
        totalCents: subtotalCents + deliveryFeeCents,
        deliveryAddress: dto.deliveryAddress,
        deliveryNotes: dto.deliveryNotes,
      },
      lines,
    );

    return OrderResponseDto.from(order);
  }

  /**
   * Lists orders through whichever lens the caller has: customers see what
   * they ordered, couriers what they are delivering, owners what their
   * kitchens received. The scope is derived from the token, so there is no
   * "list all orders" query a client can ask for.
   */
  async list(user: AuthenticatedUser, query: ListOrdersQueryDto): Promise<OrderResponseDto[]> {
    const options: FindOrdersOptions = {
      status: query.status,
      limit: query.limit,
      offset: query.offset,
    };

    if (query.restaurantId) {
      // Filtering by restaurant is only meaningful if it's yours; this throws
      // for anyone else rather than quietly returning an empty list.
      await this.restaurants.requireOwned(query.restaurantId, user);
      options.restaurantIds = [query.restaurantId];
    } else {
      switch (user.role) {
        case 'admin':
          break;
        case 'restaurant_owner':
          options.restaurantIds = await this.restaurants.listOwnedIds(user.id);
          break;
        case 'courier':
          options.courierId = user.id;
          break;
        default:
          options.customerId = user.id;
      }
    }

    const rows = await this.orders.findMany(options);
    return rows.map((row) => OrderResponseDto.from(row));
  }

  /** The courier job board: ready orders nobody has claimed yet. */
  async listAvailableForCourier(query: ListOrdersQueryDto): Promise<OrderResponseDto[]> {
    const rows = await this.orders.findMany({
      status: 'ready',
      unclaimedOnly: true,
      limit: query.limit,
      offset: query.offset,
    });

    return rows.map((row) => OrderResponseDto.from(row));
  }

  async getById(user: AuthenticatedUser, id: string): Promise<OrderResponseDto> {
    const order = await this.requireById(id);
    await this.requireInvolved(order, user);

    return OrderResponseDto.from(order);
  }

  /**
   * Drives the order lifecycle. The legality of a move and the right to make
   * it are both decided by `order-status.ts`, then applied with a conditional
   * write so a concurrent update can't be clobbered.
   */
  async updateStatus(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateOrderStatusDto,
  ): Promise<OrderResponseDto> {
    const order = await this.requireById(id);
    const actors = await this.requireInvolved(order, user);

    const check = checkTransition(order.status, dto.status, actors);

    if (!check.allowed) {
      if (check.reason === 'illegal') {
        throw new ConflictException(MESSAGES.orders.illegalTransition(order.status, dto.status));
      }
      throw new ForbiddenException(MESSAGES.orders.transitionForbidden(dto.status));
    }

    // A kitchen must not start cooking food nobody has paid for. Read from the
    // order's own `paidAt`, which PaymentsService sets on capture — orders
    // stays unaware of the payments module, so there is no dependency cycle.
    if (dto.status === 'confirmed' && order.paidAt === null) {
      throw new ConflictException(MESSAGES.payments.unpaidOrder);
    }

    const updated = await this.orders.updateStatus(id, order.status, dto.status, {
      cancelledAt: dto.status === 'cancelled' ? new Date() : undefined,
      deliveredAt: dto.status === 'delivered' ? new Date() : undefined,
    });

    if (!updated) {
      throw new ConflictException(
        'This order changed while you were updating it — reload and try again',
      );
    }

    // Lines are immutable once placed, so the ones already read are current.
    return OrderResponseDto.from({ ...updated, items: order.items });
  }

  /** A courier takes a delivery. First writer wins; the rest get a 409. */
  async claim(courier: AuthenticatedUser, id: string): Promise<OrderResponseDto> {
    const order = await this.requireById(id);
    const claimed = await this.orders.claim(id, courier.id);

    if (!claimed) {
      throw new ConflictException(MESSAGES.orders.notAvailableToClaim);
    }

    return OrderResponseDto.from({ ...claimed, items: order.items });
  }

  private async requireById(id: string): Promise<OrderWithItems> {
    const order = await this.orders.findById(id);
    if (!order) throw new NotFoundException(MESSAGES.orders.notFound);

    return order;
  }

  /**
   * 404 rather than 403 for an uninvolved caller: answering "forbidden" would
   * confirm that an order with that id exists, which is more than a stranger
   * should learn from guessing a UUID.
   */
  private async requireInvolved(order: Order, user: AuthenticatedUser): Promise<OrderActor[]> {
    const actors = await this.actorsFor(order, user);
    if (actors.length === 0) throw new NotFoundException(MESSAGES.orders.notFound);

    return actors;
  }

  /**
   * Maps an account to its roles *on this order*. Holding the `courier` role
   * grants nothing here — only being the assigned courier does.
   */
  private async actorsFor(order: Order, user: AuthenticatedUser): Promise<OrderActor[]> {
    const actors: OrderActor[] = [];

    if (user.role === 'admin') actors.push('admin');
    if (order.customerId === user.id) actors.push('customer');
    if (order.courierId === user.id) actors.push('courier');

    // Only costs a query for someone who could plausibly own the restaurant.
    if (user.role === 'restaurant_owner') {
      const restaurant = await this.restaurants.requireById(order.restaurantId);
      if (restaurant.ownerId === user.id) actors.push('restaurant');
    }

    return actors;
  }
}

/**
 * Folds a basket down to one entry per menu item.
 *
 * Sending the same dish on two lines is normal client behaviour ("add to cart"
 * twice); summing is what the customer means, and it keeps the order's lines
 * unique per item.
 */
function mergeQuantities(items: OrderItemInputDto[]): Map<string, number> {
  const quantities = new Map<string, number>();

  for (const item of items) {
    quantities.set(item.menuItemId, (quantities.get(item.menuItemId) ?? 0) + item.quantity);
  }

  return quantities;
}
