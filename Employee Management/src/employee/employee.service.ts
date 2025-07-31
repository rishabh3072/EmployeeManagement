  import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
  import { PrismaService } from '../prisma/prisma.service';
  import { CreateEmployeeDto, UpdateEmployeeDto } from './dto/employee.dto';
  import { Prisma } from '@prisma/client';
  import { UtilsService } from '@Common';

  @Injectable()
  export class EmployeeService {
    constructor(private prisma: PrismaService,
      private readonly utilsService: UtilsService,
    ) { }
    
    async create(createEmployeeDto: CreateEmployeeDto) {
      const existingUser = await this.prisma.$queryRaw<any>(
    Prisma.sql`
      SELECT "user".*, employees."employeeCode"
      FROM "user"
      LEFT JOIN employees ON "user".id = employees."userId"
      WHERE "user"."email" = ${createEmployeeDto.email}
      LIMIT 1
    `
  )

      if (existingUser.length > 0) {
        const user = existingUser[0];
        if (user.employeeCode) {
          throw new ForbiddenException('User with this email already exists and is already an employee');
        }

    await this.prisma.$executeRaw`
    INSERT INTO employees (
      "userId", "employeeCode", "firstName", "lastName", "department", "designation",
      "joinDate", "basicSalary", "hra", "allowances", "otherDeductions", "createdAt", "updatedAt"
    ) VALUES (
      ${user.id}, ${createEmployeeDto.employeeCode}, ${createEmployeeDto.firstName},
      ${createEmployeeDto.lastName}, ${createEmployeeDto.department}, ${createEmployeeDto.designation},
      ${new Date(createEmployeeDto.joinDate)}, ${createEmployeeDto.basicSalary},
      ${createEmployeeDto.hra || 0}, ${createEmployeeDto.allowances || 0},
      ${createEmployeeDto.otherDeductions || 0}, now(), now()
    )
  `;

    const employee = await this.prisma.$queryRaw<any>`
    SELECT e.*, u.*,e.id FROM employees e
    JOIN "user" u ON u.id = e."userId"
    WHERE e."userId" = ${user.id}
    LIMIT 1
  `;
        return employee[0];
    }

      return this.prisma.$transaction(async (tx) => {
      const newUser = await tx.$queryRaw<any>`
    INSERT INTO "user" ("email", "firstname", "lastname", "created_at", "updated_at")
    VALUES (${createEmployeeDto.email}, ${createEmployeeDto.firstName}, ${createEmployeeDto.lastName}, now(), now())
    RETURNING *
  `;

  const passwordSalt = this.utilsService.generateSalt();
  const hashedPassword = this.utilsService.hashPassword(
    createEmployeeDto.password,
    passwordSalt,
    64 // or your defined password hash length
  );

    await tx.$executeRaw`
    INSERT INTO "user_meta" ("user_id", "password_hash", "password_salt")
    VALUES (${newUser[0].id}, ${hashedPassword}, ${passwordSalt})
  `;

    await tx.$executeRaw`
    INSERT INTO employees (
      "userId", "employeeCode", "firstName", "lastName", "department", "designation",
      "joinDate", "basicSalary", "hra", "allowances", "otherDeductions", "createdAt", "updatedAt"
    ) VALUES (
      ${newUser[0].id}, ${createEmployeeDto.employeeCode}, ${createEmployeeDto.firstName},
      ${createEmployeeDto.lastName}, ${createEmployeeDto.department}, ${createEmployeeDto.designation},
      ${new Date(createEmployeeDto.joinDate)}, ${createEmployeeDto.basicSalary},
      ${createEmployeeDto.hra || 0}, ${createEmployeeDto.allowances || 0},
      ${createEmployeeDto.otherDeductions || 0}, now(), now()
    )
  `;

        const employee = await tx.$queryRawUnsafe<any>(`
          SELECT e.*, u.* FROM employees e
          JOIN "user" u ON u.id = e."userId"
          WHERE e."userId" = $1
          LIMIT 1
        `, newUser[0].id);

        return employee[0];
      });
    }

      async findOne(id: number, requestingUser: any) {
        const employee = await this.prisma.$queryRaw<any>`
      SELECT e.*, u.*,e.id FROM employees e
      JOIN "user" u ON u.id = e."userId"  
      WHERE e.id = ${Number(id)}
      LIMIT 1
    `;


      if (employee.length === 0) {
        throw new NotFoundException('Employee not found');
      }

      if (requestingUser.type === 'user' && requestingUser.employee?.id !== Number(id)) {
        throw new ForbiddenException('You can only view your own data');
      }

      return employee[0];
    }

      async findAll() {
        return this.prisma.$queryRaw<any>`
      SELECT e.*, u.*,e.id FROM employees e
      JOIN "user" u ON u.id = e."userId"
      WHERE e."isActive" = true
    `;
      }

    async update(id: number, updateEmployeeDto: UpdateEmployeeDto) {
    const {
      firstName,
      lastName,
      department,
      designation,
      basicSalary,
      hra,
      allowances,
      otherDeductions,
    } = updateEmployeeDto;

    // 1. Check if employee exists
    const existingEmployee = await this.prisma.$queryRaw<any>`
    SELECT * FROM "employees" WHERE id = ${Number(id)}
  `;


    if (!existingEmployee.length) {
      throw new NotFoundException('Employee not found');
    }

    // 2. Update employee using COALESCE to retain existing values if input is undefined
    await this.prisma.$executeRaw`
    UPDATE "employees"
    SET
      "firstName" = COALESCE(${firstName ?? null}, "firstName"),
      "lastName" = COALESCE(${lastName ?? null}, "lastName"),
      "department" = COALESCE(${department ?? null}, "department"),
      "designation" = COALESCE(${designation ?? null}, "designation"),
      "basicSalary" = COALESCE(${basicSalary ?? null}, "basicSalary"),
      "hra" = COALESCE(${hra ?? null}, "hra"),
      "allowances" = COALESCE(${allowances ?? null}, "allowances"),
      "otherDeductions" = COALESCE(${otherDeductions ?? null}, "otherDeductions"),
      "updatedAt" = now()
    WHERE id = ${Number(id)}
  `;
    return { message: 'Employee updated successfully' };
  }


      async delete(id: number, requestingUser: any) {
        const employee = await this.prisma.$queryRaw<any>`
      SELECT e.*, u.*,e.id FROM employees e
      JOIN "user" u ON u.id = e."userId"
      WHERE e.id = ${Number(id)}
      LIMIT 1
    `;

      if (employee.length === 0) {
        throw new NotFoundException('Employee not found');
      }

      if (requestingUser.type !== 'admin') {
        throw new ForbiddenException('You are not authorized to delete this employee');
      }

      await this.prisma.$executeRaw`
    DELETE FROM employees
    WHERE id = ${Number(id)}
  `;
      return { message: 'Employee deleted successfully' };
    }
  }
