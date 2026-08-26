---
name: nestjs-module
description: Add or extend a NestJS feature module in this backend — file layout, DI wiring, DTO validation, and the controller/service/repository split used across src/modules. Use when creating a new domain module (restaurants, products, cart, orders, delivery), adding endpoints to an existing one, or wiring a provider between modules.
---

# NestJS feature modules

Conventions for `food/backend` (NestJS 11, Drizzle ORM, PostgreSQL, pnpm).

## Layout

Every domain lives in `src/modules/<name>/`, plural for collections:

```
src/modules/orders/
├── dto/                    # request/response shapes, one file per operation
│   ├── create-order.dto.ts
│   └── update-order.dto.ts
├── orders.controller.ts    # HTTP only — parse, delegate, return
├── orders.service.ts       # business logic, the only place rules live
├── orders.repository.ts    # Drizzle queries (add when the service grows queries)
└── orders.module.ts        # wiring
```

Generate the shell with the Nest CLI, then move it under `modules/`:

```bash
pnpm exec nest g module modules/orders && pnpm exec nest g controller modules/orders --flat && pnpm exec nest g service modules/orders --flat
```

## The three layers

Keep the boundaries strict — this is what makes the modules testable:

- **Controller** — decorators, DTO binding, HTTP status. No business rules, no
  database access. It calls exactly one service method per route.
- **Service** — all rules, orchestration and authorization decisions. Throws
  Nest's `HttpException` subclasses (`NotFoundException`, `ForbiddenException`,
  `ConflictException`); never returns error objects.
- **Repository** — Drizzle queries and nothing else. Returns rows or `null`,
  never throws HTTP exceptions.

A module that only reads its own tables can skip the repository and query from
the service. Split it out the moment a second consumer appears.

## Wiring

```ts
@Module({
  imports: [UsersModule],        // to use another module's exported providers
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],      // only what other modules genuinely need
})
export class OrdersModule {}
```

Then register it in `src/app.module.ts`. Rules that matter here:

- **Never export a repository.** Cross-module access goes through the owning
  service, so invariants stay in one place.
- **Import the module, not the provider.** `imports: [UsersModule]` — Nest
  resolves `UsersService` from what that module exports.
- **Circular imports mean the split is wrong.** Fix the boundary first; reach
  for `forwardRef()` only when the cycle is genuinely inherent.

## DTOs and validation

DTOs are classes (not interfaces or types) — Nest needs the runtime metadata.
Name them `<verb>-<noun>.dto.ts` and derive updates from creates:

```ts
export class UpdateOrderDto extends PartialType(CreateOrderDto) {}
```

`class-validator` and `class-transformer` are **not installed yet**. When the
first DTO needs validation, add them and enable the global pipe in `main.ts`:

```bash
pnpm add class-validator class-transformer
```

```ts
app.useGlobalPipes(
  new ValidationPipe({ whitelist: true, transform: true }),
);
```

`whitelist: true` strips unknown properties — keep it on, it is the cheapest
mass-assignment defence available.

## Config

Read environment values through `ConfigService`, never `process.env` directly
outside `main.ts`. `ConfigModule` is already registered globally in
`app.module.ts`, so inject it without importing anything:

```ts
constructor(private readonly config: ConfigService) {}
```

## Checks

Run before calling a module done:

```bash
pnpm build && pnpm lint && pnpm test
```

`pnpm lint` runs with `recommendedTypeChecked`, so it catches floating promises
and unsafe `any` flow that `tsc` alone lets through.
