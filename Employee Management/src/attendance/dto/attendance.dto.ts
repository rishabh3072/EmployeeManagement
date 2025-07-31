import { IsDateString, IsOptional } from 'class-validator';

export class MarkAttendanceDto {
  @IsDateString()
  checkIn: string;

  @IsOptional()
  @IsDateString()
  checkOut?: string;
}