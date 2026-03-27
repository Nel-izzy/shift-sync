import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { LocationsModule } from './modules/locations/locations.module';
import { ShiftsModule } from './modules/shifts/shifts.module';
import { SwapsModule } from './modules/swaps/swaps.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuditModule } from './modules/audit/audit.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    AuthModule,
    UsersModule,
    LocationsModule,
    ShiftsModule,
    SwapsModule,
    NotificationsModule,
    AnalyticsModule,
    AuditModule,
  ],
})
export class AppModule {}
