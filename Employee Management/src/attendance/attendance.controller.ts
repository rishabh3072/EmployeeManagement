import { Controller, Post, Body, Get, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AttendanceService } from './attendance.service';
import { MarkAttendanceDto } from './dto/attendance.dto';

@Controller('attendance')
@UseGuards(AuthGuard('jwt'))
export class AttendanceController {
  constructor(private attendanceService: AttendanceService) {}

  @Post('mark/:id')
  async markAttendance(
    @Param('id') employeeId: number,
    @Body() markAttendanceDto: MarkAttendanceDto,
  ) {
    return this.attendanceService.markAttendance(employeeId, markAttendanceDto);
  }

  @Get('month/:id/:month')
  async getAttendanceByMonth(
    @Param('id') employeeId: number,
    @Param('month') month: string,
  ) {
    return this.attendanceService.getAttendanceByMonth(employeeId, month);
  }
}
