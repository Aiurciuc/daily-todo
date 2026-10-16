import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  CreateTaskDto,
  ReorderTasksDto,
  SetTaskCompletedDto,
  TaskListQueryDto,
  TaskIdParamsDto,
} from './dto/task-request.dto';
import { TaskResponseDto } from './dto/task-response.dto';
import { parseDay } from './task-date';
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(@Query() query: TaskListQueryDto): Promise<TaskResponseDto[]> {
    return this.tasks.listCalendar(query);
  }

  @Post()
  create(@Body() input: CreateTaskDto): Promise<TaskResponseDto> {
    return this.tasks.create(input.title, parseDay(input.date), input);
  }

  @Patch('order')
  reorder(@Body() input: ReorderTasksDto): Promise<TaskResponseDto[]> {
    return this.tasks.reorder(parseDay(input.date), input.ids);
  }

  @Put(':id')
  update(@Param() params: TaskIdParamsDto, @Body() input: CreateTaskDto): Promise<TaskResponseDto> {
    return this.tasks.update(params.id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param() params: TaskIdParamsDto): Promise<void> {
    return this.tasks.remove(params.id);
  }

  @Patch(':id')
  setCompleted(
    @Param() params: TaskIdParamsDto,
    @Body() input: SetTaskCompletedDto,
  ): Promise<TaskResponseDto> {
    return this.tasks.setCompleted(params.id, input.completed);
  }
}
