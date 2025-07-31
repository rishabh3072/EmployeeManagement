import { IsString, IsOptional, IsArray, Matches } from 'class-validator';

export class DistributePayrollDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'Month must be in YYYY-MM format' })
  month: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  employeeIds?: number[];
}
