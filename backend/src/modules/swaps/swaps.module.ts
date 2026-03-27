import { Module } from '@nestjs/common';
import { SwapsController } from './swaps.controller';
import { SwapsService } from './swaps.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { ShiftsModule } from '../shifts/shifts.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [NotificationsModule, ShiftsModule, AuditModule],
  controllers: [SwapsController],
  providers: [SwapsService],
})
export class SwapsModule {}
