import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MESSAGES } from '../../common/messages';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { OrderResponseDto } from '../orders/dto/order-response.dto';
import { OrdersService } from '../orders/orders.service';
import { MenuItemsService } from '../restaurants/menu-items.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { CartRepository } from './cart.repository';
import { AddCartItemDto, CheckoutDto, UpdateCartItemDto } from './dto/cart-item.dto';
import { CartLineDto, CartResponseDto } from './dto/cart-response.dto';

/** What an empty basket looks like — no cart row exists yet. */
const EMPTY: CartResponseDto = {
  id: null,
  restaurantId: null,
  restaurantName: null,
  items: [],
  subtotalCents: 0,
  deliveryFeeCents: 0,
  totalCents: 0,
  minimumOrderCents: 0,
  canCheckout: false,
  blockers: [MESSAGES.cart.empty],
};

@Injectable()
export class CartService {
  constructor(
    private readonly cart: CartRepository,
    private readonly restaurants: RestaurantsService,
    private readonly menuItems: MenuItemsService,
    private readonly orders: OrdersService,
  ) {}

  /**
   * The basket priced against the menu as it stands now.
   *
   * Nothing is cached: a dish that went up in price or sold out since it was
   * added shows its current state here, so the customer sees the change before
   * committing rather than on the receipt.
   */
  async view(user: AuthenticatedUser): Promise<CartResponseDto> {
    const cart = await this.cart.findByUser(user.id);
    if (!cart || cart.items.length === 0) return EMPTY;

    const [restaurant, menu] = await Promise.all([
      this.restaurants.requireById(cart.restaurantId),
      this.menuItems.findOrderableItems(
        cart.restaurantId,
        cart.items.map((item) => item.menuItemId),
      ),
    ]);

    const byId = new Map(menu.map((item) => [item.id, item]));
    const lines: CartLineDto[] = [];

    for (const line of cart.items) {
      const item = byId.get(line.menuItemId);
      // Absent means the restaurant deleted the dish outright; the FK cascade
      // will already have removed the row, so this is belt and braces.
      if (!item) continue;

      lines.push({
        menuItemId: item.id,
        name: item.name,
        unitPriceCents: item.priceCents,
        quantity: line.quantity,
        lineTotalCents: item.priceCents * line.quantity,
        isAvailable: item.isAvailable,
      });
    }

    // Sold-out lines stay visible but contribute nothing — showing a total
    // that includes food nobody can send would be a lie.
    const subtotalCents = lines
      .filter((line) => line.isAvailable)
      .reduce((sum, line) => sum + line.lineTotalCents, 0);

    const blockers: string[] = [];
    if (lines.length === 0) blockers.push(MESSAGES.cart.empty);
    else if (subtotalCents === 0) blockers.push(MESSAGES.cart.nothingAvailable);
    else if (subtotalCents < restaurant.minimumOrderCents) {
      blockers.push(MESSAGES.cart.belowMinimum);
    }
    if (!restaurant.isOpen) blockers.push(MESSAGES.restaurants.closed);

    return {
      id: cart.id,
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      items: lines,
      subtotalCents,
      deliveryFeeCents: restaurant.deliveryFeeCents,
      totalCents: subtotalCents + restaurant.deliveryFeeCents,
      minimumOrderCents: restaurant.minimumOrderCents,
      canCheckout: blockers.length === 0,
      blockers,
    };
  }

  /**
   * Adds a dish, creating the basket if there isn't one.
   *
   * The restaurant is derived from the dish rather than supplied, which is why
   * a basket can never end up holding food from two kitchens.
   */
  async addItem(user: AuthenticatedUser, dto: AddCartItemDto): Promise<CartResponseDto> {
    const item = await this.menuItems.findAnyById(dto.menuItemId);
    if (!item) throw new NotFoundException(MESSAGES.menu.itemNotFound);

    if (!item.isAvailable) {
      throw new ConflictException(MESSAGES.orders.unavailableItems([item.name]));
    }

    const existing = await this.cart.findByUser(user.id);

    if (existing && existing.restaurantId !== item.restaurantId) {
      const current = await this.restaurants.requireById(existing.restaurantId);
      throw new ConflictException(MESSAGES.cart.differentRestaurant(current.name));
    }

    const cart = existing ?? (await this.cart.findOrCreate(user.id, item.restaurantId));
    await this.cart.addItem(cart.id, item.id, dto.quantity ?? 1);

    return this.view(user);
  }

  async updateItem(
    user: AuthenticatedUser,
    menuItemId: string,
    dto: UpdateCartItemDto,
  ): Promise<CartResponseDto> {
    const cart = await this.requireCart(user);

    const changed =
      dto.quantity === 0
        ? await this.cart.removeItem(cart.id, menuItemId)
        : await this.cart.setItemQuantity(cart.id, menuItemId, dto.quantity);

    if (!changed) throw new NotFoundException(MESSAGES.cart.itemNotInCart);

    return this.view(user);
  }

  async removeItem(user: AuthenticatedUser, menuItemId: string): Promise<CartResponseDto> {
    const cart = await this.requireCart(user);

    const removed = await this.cart.removeItem(cart.id, menuItemId);
    if (!removed) throw new NotFoundException(MESSAGES.cart.itemNotInCart);

    return this.view(user);
  }

  async clear(user: AuthenticatedUser): Promise<void> {
    await this.cart.clearForUser(user.id);
  }

  /**
   * Turns the basket into an order.
   *
   * Checkout deliberately re-runs every check rather than trusting what `view`
   * reported a moment ago — the restaurant could have closed or sold out
   * between the customer seeing the total and pressing the button. Pricing
   * happens inside `OrdersService.create`, from the menu, exactly as it does
   * for a direct order.
   */
  async checkout(user: AuthenticatedUser, dto: CheckoutDto): Promise<OrderResponseDto> {
    const cart = await this.view(user);

    if (cart.blockers.length > 0) {
      throw new ConflictException(cart.blockers[0]);
    }

    const order = await this.orders.create(user, {
      restaurantId: cart.restaurantId as string,
      items: cart.items
        .filter((line) => line.isAvailable)
        .map((line) => ({ menuItemId: line.menuItemId, quantity: line.quantity })),
      deliveryAddress: dto.deliveryAddress,
      deliveryNotes: dto.deliveryNotes,
    });

    // Only once the order exists. Clearing first would lose the basket if
    // order creation then failed.
    await this.cart.clearForUser(user.id);

    return order;
  }

  private async requireCart(user: AuthenticatedUser) {
    const cart = await this.cart.findByUser(user.id);
    if (!cart) throw new NotFoundException(MESSAGES.cart.empty);

    return cart;
  }
}
