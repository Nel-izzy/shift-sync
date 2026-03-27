import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { JwtAuthGuard, RolesGuard, Roles } from '../auth/auth.guard';

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('audit')
export class AuditController {
  constructor(private svc: AuditService) {}

  @Get('shift/:id')
  @Roles('admin', 'manager')
  getShiftHistory(@Param('id') id: string) {
    return this.svc.getForEntity('shift', id);
  }

  @Get('export')
  @Roles('admin')
  export(
    @Query('locationId') locationId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.svc.export(locationId, new Date(from), new Date(to));
  }
}
