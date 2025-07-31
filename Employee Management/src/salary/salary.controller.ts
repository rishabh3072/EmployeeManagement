import { Controller, Post, Get, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SalaryService } from './salary.service';
import { CalculateSalaryDto } from './dto/salary.dto';
import { Roles, RolesGuard } from '../common/guards/role.guard';
import { UserType } from '@Common';
import { Request as ExpressRequest } from 'express';


@Controller('salary')
@UseGuards(AuthGuard('jwt'))
export class SalaryController {
  constructor(private salaryService: SalaryService) {}

  @Post('calculate')
  @UseGuards(RolesGuard)
  @Roles(UserType.Admin)
  async calculateSalary(@Body() calculateSalaryDto: CalculateSalaryDto) {
    return this.salaryService.calculateSalary(calculateSalaryDto);
  }

  @Get(':employeeId')
  async getSalary(
    @Param('employeeId') employeeId: number,
    @Query('month') month: string,
    @Request() req: ExpressRequest,
  ) {
    return this.salaryService.getSalary(Number(employeeId), month, req.user);
  }
}
