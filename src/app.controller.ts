import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService, type HealthStatus, type ReadinessStatus } from './app.service';
import { Public } from './modules/auth/decorators/public.decorator';

/**
 * Probe endpoints. `@Public()` because an orchestrator has no credentials —
 * and they are excluded from the global `api` prefix in `main.ts` so the probe
 * URL stays stable if the prefix ever changes.
 */
@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

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
