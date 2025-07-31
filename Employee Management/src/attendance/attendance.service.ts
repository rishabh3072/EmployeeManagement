import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MarkAttendanceDto } from './dto/attendance.dto';

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService) {}

  async markAttendance(employeeId: number, markAttendanceDto: MarkAttendanceDto) {
    const employee = await this.prisma.$queryRaw<any>`
      SELECT * FROM "employees" WHERE id = ${employeeId}
    `;

    if (!employee || employee.length === 0) {
      throw new NotFoundException('Employee not found');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const checkInTime = new Date(markAttendanceDto.checkIn);
    const checkOutTime = markAttendanceDto.checkOut
      ? new Date(markAttendanceDto.checkOut)
      : null;

    const existingAttendance = await this.prisma.$queryRaw<any>`
      SELECT * FROM "attendances" 
      WHERE "employeeId" = ${employeeId} 
      AND "date"::date = ${today}::date
    `;

    if (existingAttendance.length > 0 && existingAttendance[0].checkOut) {
      throw new BadRequestException('Attendance already marked for today');
    }

    let status = 'FULL_DAY';
    let hoursWorked: number | null = null;

    if (checkOutTime) {
      if (checkOutTime <= checkInTime) {
        throw new BadRequestException('Check-out must be after check-in');
      }

      hoursWorked =
        (checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);
      hoursWorked = parseFloat(hoursWorked.toFixed(2));
      status =
        hoursWorked >= 8
          ? 'FULL_DAY'
          : hoursWorked >= 4
          ? 'HALF_DAY'
          : 'ABSENT';
    }

    if (existingAttendance.length > 0) {
      // Update existing attendance
      if (checkOutTime && hoursWorked !== null) {
        const updated = await this.prisma.$queryRaw<any>`
          UPDATE "attendances"
          SET "checkIn" = ${checkInTime},
              "checkOut" = ${checkOutTime},
              "hoursWorked" = ${hoursWorked},
              "status" = ${status},
              "updatedAt" = NOW()
          WHERE id = ${existingAttendance[0].id}
          RETURNING *
        `;
        
        const employeeInfo = await this.getEmployeeBasicInfo(employeeId);
        return {
          ...updated[0],
          employee: employeeInfo,
        };
      } else {
        // Only check-in, no check-out
        const updated = await this.prisma.$queryRaw<any>`
          UPDATE "attendances"
          SET "checkIn" = ${checkInTime},
              "status" = ${status},
              "updatedAt" = NOW()
          WHERE id = ${existingAttendance[0].id}
          RETURNING *
        `;
        
        const employeeInfo = await this.getEmployeeBasicInfo(employeeId);
        return {
          ...updated[0],
          employee: employeeInfo,
        };
      }
    } else {
      // Insert new attendance
      if (checkOutTime && hoursWorked !== null) {
        const inserted = await this.prisma.$queryRaw<any>`
          INSERT INTO "attendances" (
            "employeeId", "date", "checkIn", "checkOut", "hoursWorked", "status", "updatedAt"
          )
          VALUES (
            ${employeeId}, ${today}, ${checkInTime}, ${checkOutTime}, ${hoursWorked}, ${status}::"AttendanceStatus", NOW()
          )
          RETURNING *
        `;
        
        const employeeInfo = await this.getEmployeeBasicInfo(employeeId);
        return {
          ...inserted[0],
          employee: employeeInfo,
        };
      } else {
        // Only check-in, no check-out
        const inserted = await this.prisma.$queryRaw<any>`
          INSERT INTO "attendances" (
            "employeeId", "date", "checkIn", "status", "updatedAt"
          )
          VALUES (
            ${employeeId}, ${today}, ${checkInTime}, ${status}::"AttendanceStatus", NOW()
          )
          RETURNING *
        `;
        
        const employeeInfo = await this.getEmployeeBasicInfo(employeeId);
        return {
          ...inserted[0],
          employee: employeeInfo,
        };
      }
    }
  }

  async getAttendanceByMonth(employeeId: number, month: string) {
    const monthRegex = /^\d{4}-\d{2}$/;
    if (!monthRegex.test(month)) {
      throw new BadRequestException('Month must be in YYYY-MM format');
    }

    const [year, monthNum] = month.split('-').map(Number);
    if (year < 1900 || year > 2100 || monthNum < 1 || monthNum > 12) {
      throw new BadRequestException('Invalid year or month');
    }

    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0);
    endDate.setHours(23, 59, 59, 999); // End of the last day

    return this.prisma.$queryRaw<any>`
      SELECT a.*, e."firstName", e."lastName", e."employeeCode"
      FROM "attendances" a
      JOIN "employees" e ON a."employeeId" = e.id
      WHERE a."employeeId" = ${employeeId}
        AND a."date" >= ${startDate}
        AND a."date" <= ${endDate}
      ORDER BY a."date" ASC
    `;
  }

  private async getEmployeeBasicInfo(employeeId: number) {
    const result = await this.prisma.$queryRaw<any>`
      SELECT "firstName", "lastName", "employeeCode"
      FROM "employees"
      WHERE id = ${employeeId}
    `;

    return result[0];
  }
}
