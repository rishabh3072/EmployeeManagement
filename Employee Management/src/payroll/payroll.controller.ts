import { Controller, Post, Get, Body, Query, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PayrollService } from './payroll.service';
import { DistributePayrollDto } from './dto/payroll.dto';
import { Roles, RolesGuard } from '../common/guards/role.guard';
import { UserType } from '@Common';
import { RequestWithUser } from '../common/interfaces/request-with-user.interface';

@Controller('payroll')
@UseGuards(AuthGuard('jwt'))
export class PayrollController {
  constructor(private payrollService: PayrollService) {}

  @Post('distribute')
  @UseGuards(RolesGuard)
  @Roles(UserType.Admin)
  async distributePayroll(@Body() distributePayrollDto: DistributePayrollDto,   @Request() req: RequestWithUser) {
    return this.payrollService.distributePayroll(distributePayrollDto, req.user.id.toString());
  }

  @Get('history')
  @UseGuards(RolesGuard)
  @Roles(UserType.Admin)
  async getPayrollHistory(@Query('month') month?: string) {
    return this.payrollService.getPayrollHistory(month);
  }
}
