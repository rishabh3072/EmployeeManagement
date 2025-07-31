import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceService } from '../attendance/attendance.service';
import { CalculateSalaryDto } from './dto/salary.dto';

@Injectable()
export class SalaryService {
  constructor(
    private prisma: PrismaService,
    private attendanceService: AttendanceService,
  ) {}

  private async getTaxSlabs() {
    return this.prisma.$queryRaw<any>`
  SELECT * FROM "tax_slabs"
  ORDER BY "minIncome" ASC
`;
  }

    private calculateTax(annualIncome: number, taxSlabs: any[]): number {
      let remainingIncome = annualIncome;

      return taxSlabs.reduce((tax: number, slab: any) => {
        if (remainingIncome <= 0) return tax;

        // Convert BigInt values to numbers
        const minIncome = typeof slab.minIncome === 'bigint' ? Number(slab.minIncome) : slab.minIncome;
        const maxIncome = slab.maxIncome ? (typeof slab.maxIncome === 'bigint' ? Number(slab.maxIncome) : slab.maxIncome) : null;
        const taxRate = typeof slab.taxRate === 'bigint' ? Number(slab.taxRate) : slab.taxRate;

        const slabRange = maxIncome
          ? Math.min(remainingIncome, maxIncome - minIncome)
          : remainingIncome;

        if (annualIncome > minIncome) {
          const taxableIncome = Math.min(slabRange, remainingIncome);
          tax += (taxableIncome * taxRate) / 100;
          remainingIncome -= taxableIncome;
        }

        return tax;
      }, 0);
    }

  private getWorkingDaysInMonth(year: number, month: number): number {
    const daysInMonth = new Date(year, month, 0).getDate();

    const workingDays = Array.from({ length: daysInMonth }, (_, i) => i + 1)
      .map(day => new Date(year, month - 1, day).getDay())
      .filter(dayOfWeek => dayOfWeek !== 0 && dayOfWeek !== 6)
      .length;

    return workingDays;
  }

  // Helper function to safely convert BigInt to number
  private toNumber(value: any): number {
    if (typeof value === 'bigint') {
      return Number(value);
    }
    return typeof value === 'number' ? value : parseFloat(value) || 0;
  }

  async calculateSalary(calculateSalaryDto: CalculateSalaryDto) {
    const { employeeId, month } = calculateSalaryDto;
    const [year, monthNum] = month.split('-').map(Number);
  
    const employeeResult = await this.prisma.$queryRaw<any>`
      SELECT * FROM "employees" WHERE id = ${employeeId} LIMIT 1
    `;

    const employee = employeeResult[0];

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const attendanceResult = await this.prisma.$queryRaw<any>`
      SELECT
        COUNT(*) FILTER (WHERE status = 'FULL_DAY'::"AttendanceStatus") AS "fullDays",
        COUNT(*) FILTER (WHERE status = 'HALF_DAY'::"AttendanceStatus") AS "halfDays"
      FROM "attendances"
      WHERE "employeeId" = ${employeeId}  
        AND TO_CHAR("date", 'YYYY-MM') = ${month};
    `;

    // Convert BigInt values to numbers safely
    const fullDays = this.toNumber(attendanceResult[0].fullDays);
    const halfDays = this.toNumber(attendanceResult[0].halfDays);

    // Convert employee salary fields to numbers
    const basicSalary = this.toNumber(employee.basicSalary);
    const hra = this.toNumber(employee.hra);
    const allowances = this.toNumber(employee.allowances);
    const otherDeductions = this.toNumber(employee.otherDeductions);
    
    const grossSalary = basicSalary + hra + allowances;
    const pfDeduction = basicSalary * 0.12;

    const annualGross = grossSalary * 12;
    const taxSlabs = await this.getTaxSlabs();
    const annualTax = this.calculateTax(annualGross, taxSlabs);
    const monthlyTax = annualTax / 12;

    const workingDays = this.getWorkingDaysInMonth(year, monthNum);
    const dailyWage = grossSalary / workingDays;
    const totalSalary = fullDays * dailyWage + halfDays * (dailyWage / 2);
    const netSalary = totalSalary - monthlyTax - pfDeduction - otherDeductions;

    const existingSalary = await this.prisma.$queryRaw<any>`
      SELECT * FROM "salaries" WHERE "employeeId" = ${employeeId} AND "month" = ${month} LIMIT 1
    `;

    // Ensure netSalary is not negative (optional business rule)
    const finalNetSalary = Math.max(0, netSalary);

    if (existingSalary.length > 0) {
      await this.prisma.$executeRaw`
        UPDATE "salaries"
        SET
          "basicSalary" = ${basicSalary},
          "hra" = ${hra},
          "allowances" = ${allowances},
          "grossSalary" = ${grossSalary},
          "taxDeduction" = ${monthlyTax},
          "pfDeduction" = ${pfDeduction},
          "otherDeductions" = ${otherDeductions},
          "fullDays" = ${fullDays},
          "halfDays" = ${halfDays},
          "totalSalary" = ${totalSalary},
          "netSalary" = ${finalNetSalary},
          "updatedAt" = NOW()
        WHERE "employeeId" = ${employeeId} AND "month" = ${month}
      `;
    } else {
      await this.prisma.$executeRaw`
        INSERT INTO "salaries" (
          "employeeId", "month", "basicSalary", "hra", "allowances",
          "grossSalary", "taxDeduction", "pfDeduction", "otherDeductions",
          "fullDays", "halfDays", "totalSalary", "netSalary", "createdAt", "updatedAt"
        ) VALUES (
          ${employeeId}, ${month}, ${basicSalary}, ${hra}, ${allowances},
          ${grossSalary}, ${monthlyTax}, ${pfDeduction}, ${otherDeductions},
          ${fullDays}, ${halfDays}, ${totalSalary}, ${finalNetSalary}, NOW(), NOW()
        )
      `;
    }

    // Return the salary record (using raw query to match behavior)
    const salaryRecord = await this.prisma.$queryRaw<any>`
      SELECT * FROM "salaries"
      WHERE "employeeId" = ${employeeId} AND "month" = ${month}
      LIMIT 1
    `;

    return salaryRecord[0];
  }

  async getSalary(employeeId: number, month: string, requestingUser: any) {
    if (requestingUser.type === 'user' && requestingUser.employee?.id !== Number(employeeId)) {
      throw new ForbiddenException('You can only view your own salary');
    }

    const result = await this.prisma.$queryRaw<any>`
      SELECT s.*, e.*, u.*
      FROM "salaries" s
      JOIN "employees" e ON s."employeeId" = e.id
      JOIN "user" u ON e."userId" = u.id
      WHERE s."employeeId" = ${employeeId} AND s."month" = ${month}
      LIMIT 1
    `;

    if (result.length === 0) {
      throw new NotFoundException('Salary record not found');
    }

    // Optionally: structure output similar to Prisma include
    const row = result[0];
    return {
      ...row,
      employee: {
        id: row.employeeId,
        firstName: row.firstName,
        lastName: row.lastName,
        employeeCode: row.employeeCode,
        user: {
          id: row.userId,
          email: row.email,
        },
      },
    };
  }
}
