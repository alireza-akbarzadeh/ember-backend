import { Controller, Get, Header } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService, type HealthStatus, type ReadinessStatus } from './app.service';
import { ApiCatalogService } from './home/api-catalog.service';
import { renderHomePage } from './home/home-page.template';
import { Public } from './modules/auth/decorators/public.decorator';

/**
 * Probe endpoints. `@Public()` because an orchestrator has no credentials —
 * and they are excluded from the global `api` prefix in `main.ts` so the probe
 * URL stays stable if the prefix ever changes.
 */
@ApiTags('health')
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly catalog: ApiCatalogService,
    private readonly config: ConfigService,
  ) {}

  /**
   * A service index for whoever opens the server in a browser: what's running,
   * whether the database is actually usable, where the docs are, and every
   * route the app exposes.
   *
   * Excluded from the OpenAPI document — it is a page, not part of the API.
   */
  @Public()
  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiExcludeEndpoint()
  async index(): Promise<string> {
    const diagnostics = await this.appService.diagnostics();

    return renderHomePage({
      ...diagnostics,
      environment: this.config.get<string>('NODE_ENV', 'development'),
      uptimeSeconds: Math.floor(process.uptime()),
      docsEnabled: this.config.get<boolean>('SWAGGER_ENABLED') ?? false,
      groups: this.catalog.list(),
      endpointCount: this.catalog.count(),
    });
  }

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Liveness probe' })
  health(): HealthStatus {
    return this.appService.health();
  }

  @Public()
  @Get('health/ready')
  @ApiOperation({ summary: 'Readiness probe, including a database ping' })
  readiness(): Promise<ReadinessStatus> {
    return this.appService.readiness();
  }
}
