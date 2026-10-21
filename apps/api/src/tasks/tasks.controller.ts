import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
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

@ApiTags('tasks')
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @ApiOperation({ summary: 'List tasks' })
  @ApiOkResponse({ type: TaskResponseDto, isArray: true })
  list(@Query() query: TaskListQueryDto): Promise<TaskResponseDto[]> {
    return this.tasks.listCalendar(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a task' })
  @ApiOkResponse({ type: TaskResponseDto })
  create(@Body() input: CreateTaskDto): Promise<TaskResponseDto> {
    return this.tasks.create(input.title, parseDay(input.date), input);
  }

  @Patch('order')
  @ApiOperation({ summary: 'Reorder tasks for a date' })
  @ApiOkResponse({ type: TaskResponseDto, isArray: true })
  reorder(@Body() input: ReorderTasksDto): Promise<TaskResponseDto[]> {
    return this.tasks.reorder(parseDay(input.date), input.ids);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a task' })
  @ApiOkResponse({ type: TaskResponseDto })
  update(@Param() params: TaskIdParamsDto, @Body() input: CreateTaskDto): Promise<TaskResponseDto> {
    return this.tasks.update(params.id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Task removed' })
  remove(@Param() params: TaskIdParamsDto): Promise<void> {
    return this.tasks.remove(params.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Set task completion status' })
  @ApiOkResponse({ type: TaskResponseDto })
  setCompleted(
    @Param() params: TaskIdParamsDto,
    @Body() input: SetTaskCompletedDto,
  ): Promise<TaskResponseDto> {
    return this.tasks.setCompleted(params.id, input.completed);
  }
}
