import { Controller, Get, Patch, Post, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService, UpdateProfileDto, SetAvailabilityDto, SetExceptionDto } from './users.service';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser } from '../auth/auth.guard';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private svc: UsersService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  findAll() {
    return this.svc.findAll();
  }

  @Get('me/availability')
  getMyAvailability(@CurrentUser() user: any) {
    return this.svc.getAvailability(user.id);
  }

  @Post('me/availability')
  setAvailability(@CurrentUser() user: any, @Body() dto: SetAvailabilityDto) {
    return this.svc.setAvailability(user.id, dto);
  }

  @Post('me/availability/exceptions')
  setException(@CurrentUser() user: any, @Body() dto: SetExceptionDto) {
    return this.svc.setException(user.id, dto);
  }

  @Delete('me/availability/exceptions/:id')
  deleteException(@CurrentUser() user: any, @Param('id') id: string) {
    return this.svc.deleteException(user.id, id);
  }

  @Patch('me')
  updateProfile(@CurrentUser() user: any, @Body() dto: UpdateProfileDto) {
    return this.svc.updateProfile(user.id, dto);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Get(':id/availability')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  getAvailability(@Param('id') id: string) {
    return this.svc.getAvailability(id);
  }
}
