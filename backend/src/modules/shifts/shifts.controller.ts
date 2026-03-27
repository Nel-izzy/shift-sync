import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ShiftsService, CreateShiftDto, AssignStaffDto } from './shifts.service';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser } from '../auth/auth.guard';

@ApiTags('shifts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('shifts')
export class ShiftsController {
  constructor(private svc: ShiftsService) {}

  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('locationId') locationId?: string,
    @Query('weekStart') weekStart?: string,
    @Query('weekEnd') weekEnd?: string,
  ) {
    return this.svc.findAll(user, { locationId, weekStart, weekEnd });
  }

  @Get('on-duty')
  getOnDuty(@Query('locationId') locationId: string) {
    return this.svc.getOnDutyNow(locationId);
  }

  @Get('overtime')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  getOvertime(
    @Query('locationId') locationId: string,
    @Query('weekStart') weekStart: string,
    @CurrentUser() actor: any,
  ) {
    return this.svc.getWeeklyOvertimeDashboard(locationId, weekStart, actor);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  create(@Body() dto: CreateShiftDto, @CurrentUser() actor: any) {
    return this.svc.create(dto, actor);
  }

  @Post(':id/assign')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  assign(@Param('id') id: string, @Body() dto: AssignStaffDto, @CurrentUser() actor: any) {
    return this.svc.assign(id, dto, actor);
  }

  @Delete(':id/assign/:userId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  unassign(@Param('id') id: string, @Param('userId') userId: string, @CurrentUser() actor: any) {
    return this.svc.unassign(id, userId, actor);
  }

  @Patch(':id/publish')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  publish(@Param('id') id: string, @CurrentUser() actor: any) {
    return this.svc.publish(id, actor);
  }

  @Post('publish-week')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  publishWeek(
    @Body() body: { locationId: string; weekStart: string },
    @CurrentUser() actor: any,
  ) {
    return this.svc.publishWeek(body.locationId, body.weekStart, actor);
  }

  @Patch(':id/unpublish')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  unpublish(@Param('id') id: string, @CurrentUser() actor: any) {
    return this.svc.unpublish(id, actor);
  }

  @Get(':id/check-assignment')
  checkAssignment(
    @Param('id') shiftId: string,
    @Query('userId') userId: string,
    @CurrentUser() actor: any,
  ) {
    return this.svc.checkAssignment(shiftId, userId);
  }
}
