import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SwapsService, CreateSwapDto, RespondSwapDto, ApproveSwapDto } from './swaps.service';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser } from '../auth/auth.guard';

@ApiTags('swaps')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('swaps')
export class SwapsController {
  constructor(private svc: SwapsService) {}

  @Get()
  list(@CurrentUser() user: any) {
    return this.svc.list(user);
  }

  @Get('drops')
  availableDrops(@Query('locationId') locationId: string, @CurrentUser() user: any) {
    return this.svc.findAvailableDrops(locationId, user.id);
  }

  @Post()
  create(@Body() dto: CreateSwapDto, @CurrentUser() user: any) {
    return this.svc.create(dto, user.id);
  }

  @Patch(':id/respond')
  respond(@Param('id') id: string, @Body() dto: RespondSwapDto, @CurrentUser() user: any) {
    return this.svc.respond(id, dto, user.id);
  }

  @Patch(':id/approve')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  approve(@Param('id') id: string, @Body() dto: ApproveSwapDto, @CurrentUser() user: any) {
    return this.svc.managerApprove(id, dto, user.id);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.cancel(id, user.id);
  }

  @Post(':id/claim')
  claim(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.claimDrop(id, user.id);
  }
}
