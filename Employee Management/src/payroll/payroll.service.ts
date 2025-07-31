import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DistributePayrollDto } from './dto/payroll.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class PayrollService {
  constructor(private prisma: PrismaService) {}

  async distributePayroll(distributePayrollDto: DistributePayrollDto, distributedBy: string) {
    const { month, employeeIds } = distributePayrollDto;

    if (!distributedBy) {
      throw new BadRequestException('DistributedBy parameter is required');
    }

    const employeeFilter = employeeIds?.length
      ? `AND s."employeeId" IN (${employeeIds.map(Number).join(',')})`
      : '';

    // Get salary records with employee and user data
    const salaries: any[] = await this.prisma.$queryRawUnsafe(`
      SELECT s.*, e."firstName", e."lastName", u."email"
      FROM "salaries" s
      JOIN "employees" e ON s."employeeId" = e.id
      JOIN "user" u ON e."userId" = u.id
      WHERE s."month" = '${month}' ${employeeFilter};
    `);

    if (salaries.length === 0) {
      throw new NotFoundException('No salary records found for the specified month');
    }

    const salaryIds = salaries.map(s => s.id).join(',');

    // Check for already distributed salaries
    const existingPayrolls = await this.prisma.$queryRawUnsafe<any>(`
      SELECT * FROM "payrolls" WHERE "salaryId" IN (${salaryIds});
    `);

    const distributedSalaryIds = new Set<number>(
  existingPayrolls.map((p: { salaryId: number }) => p.salaryId)
);

const undistributedSalaries = salaries.filter(s => !distributedSalaryIds.has(s.id));

if (undistributedSalaries.length === 0) {
  throw new BadRequestException('All selected salaries have already been distributed');
}


    // Create payrolls using Prisma.sql for better safety
    const payrollInserts = undistributedSalaries.map(salary => ({
      salaryId: salary.id,
      month: month,
      totalAmount: salary.netSalary,
      distributedBy: distributedBy
    }));

    // Use createMany for safer insertion
    await this.prisma.payroll.createMany({
      data: payrollInserts
    });

    const totalResult = await this.prisma.$queryRaw<any>(
      Prisma.sql`
        SELECT SUM("netSalary") as "totalAmount"
        FROM "salaries"
        WHERE "month" = ${month}
        ${employeeIds?.length ? Prisma.sql`AND "employeeId" IN (${Prisma.join(employeeIds)})` : Prisma.empty};
      `
    );
    const totalAmount = Number(totalResult[0].totalAmount);

    return {
      message: 'Payroll distributed successfully',
      distributedBy,
      totalEmployees: undistributedSalaries.length,
      totalAmount,
      distributedSalaries: undistributedSalaries.map(salary => ({
        employeeId: salary.employeeId,
        employeeName: `${salary.firstName} ${salary.lastName}`,
        amount: salary.netSalary,
      })),
    };
  }

  async getPayrollHistory(month?: string) {
    const monthFilter = month ? `WHERE p."month" = '${month}'` : '';

    const payrolls = await this.prisma.$queryRawUnsafe<any>(`
      SELECT 
        p.*, 
        s."employeeId", 
        e."firstName", 
        e."lastName", 
        u."email"
      FROM "payrolls" p
      JOIN "salaries" s ON p."salaryId" = s.id
      JOIN "employees" e ON s."employeeId" = e.id
      JOIN "user" u ON e."userId" = u.id
      ${monthFilter}
      ORDER BY p."distributedAt" DESC;
    `);

    type Summary = {
      [month: string]: {
        month: string;
        totalEmployees: number;
        totalAmount: number;
        distributions: {
          employeeId: number;
          employeeName: string;
          amount: number;
          distributedAt: Date;
        }[];
      };
    };

    const summary = payrolls.reduce((acc: Summary, payroll: any) => {
      const m = payroll.month;
      if (!acc[m]) {
        acc[m] = {
          month: m,
          totalEmployees: 0,
          totalAmount: 0,
          distributions: [],
        };
      }
      acc[m].totalEmployees++;
      acc[m].totalAmount += Number(payroll.totalAmount);
      acc[m].distributions.push({
        employeeId: payroll.employeeId,
        employeeName: `${payroll.firstName} ${payroll.lastName}`,
        amount: payroll.totalAmount,
        distributedAt: payroll.distributedAt,
      });
      return acc;
    }, {});

    return Object.values(summary);  
  }
}
