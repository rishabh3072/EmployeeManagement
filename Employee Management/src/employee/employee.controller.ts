import { Controller, Get, Delete, Post, Body, Put, Param, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { EmployeeService } from './employee.service';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto/employee.dto';
import { RolesGuard, Roles } from '../common/guards/role.guard';
import { UserType } from '@Common';
import { Request as ExpressRequest } from 'express';


@Controller('employees')
@UseGuards(AuthGuard('jwt'))
export class EmployeeController {
  constructor(private employeeService: EmployeeService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserType.Admin)
  async create(@Body() createEmployeeDto: CreateEmployeeDto) {
    return this.employeeService.create(createEmployeeDto);
  }

  @Get(':id')
  async findOne(@Param('id') id: number, @Request() req: ExpressRequest) {
    return this.employeeService.findOne(Number(id), req.user);
  }
  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserType.Admin)
  async findAll() {
    return this.employeeService.findAll();
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(UserType.Admin)
  async update(
    @Param('id') id: number,
    @Body() updateEmployeeDto: UpdateEmployeeDto,
  ) {
    return this.employeeService.update(Number(id), updateEmployeeDto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserType.Admin)
  async delete(@Param('id') id: number, @Request() req: ExpressRequest) {
    return this.employeeService.delete(Number(id), req.user);
  }
}
