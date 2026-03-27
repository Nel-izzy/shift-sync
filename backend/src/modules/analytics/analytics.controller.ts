import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard, RolesGuard, Roles } from '../auth/auth.guard';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'manager')
@Controller('analytics')
export class AnalyticsController {
  constructor(private svc: AnalyticsService) {}

  @Get('distribution')
  distribution(
    @Query('locationId') locationId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.svc.getDistributionReport(locationId, new Date(from), new Date(to));
  }

  @Get('fairness')
  fairness(
    @Query('locationId') locationId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.svc.getFairnessReport(locationId, new Date(from), new Date(to));
  }

  @Get('overtime-projection')
  overtimeProjection(
    @Query('locationId') locationId: string,
    @Query('weekStart') weekStart: string,
  ) {
    return this.svc.getWeeklyProjection(locationId, weekStart);
  }
}
