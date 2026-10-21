import { ApiCookieAuth, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { CurrentUser, SessionGuard } from '../auth/auth.guards';
import { UserResponseDto } from '../auth/auth.dto';
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
  UseGuards,
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
@ApiCookieAuth('daily_todo_session')
@ApiUnauthorizedResponse({ description: 'Missing, invalid or expired session' })
@UseGuards(SessionGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @ApiOperation({ summary: 'List your own tasks; SHARED is a label, not cross-user access' })
  @ApiOkResponse({ type: TaskResponseDto, isArray: true })
  list(@CurrentUser() user: UserResponseDto, @Query() query: TaskListQueryDto): Promise<TaskResponseDto[]> {
    return this.tasks.listCalendar(user.id, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a task' })
  @ApiOkResponse({ type: TaskResponseDto })
  create(@CurrentUser() user: UserResponseDto, @Body() input: CreateTaskDto): Promise<TaskResponseDto> {
    return this.tasks.create(user.id, input.title, parseDay(input.date), input);
  }

  @Patch('order')
  @ApiOperation({ summary: 'Reorder tasks for a date' })
  @ApiOkResponse({ type: TaskResponseDto, isArray: true })
  reorder(@CurrentUser() user: UserResponseDto, @Body() input: ReorderTasksDto): Promise<TaskResponseDto[]> {
    return this.tasks.reorder(user.id, parseDay(input.date), input.ids);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a task' })
  @ApiOkResponse({ type: TaskResponseDto })
  update(@CurrentUser() user: UserResponseDto, @Param() params: TaskIdParamsDto, @Body() input: CreateTaskDto): Promise<TaskResponseDto> {
    return this.tasks.update(user.id, params.id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Task removed' })
  remove(@CurrentUser() user: UserResponseDto, @Param() params: TaskIdParamsDto): Promise<void> {
    return this.tasks.remove(user.id, params.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Set task completion status' })
  @ApiOkResponse({ type: TaskResponseDto })
  setCompleted(
    @CurrentUser() user: UserResponseDto,
    @Param() params: TaskIdParamsDto,
    @Body() input: SetTaskCompletedDto,
  ): Promise<TaskResponseDto> {
    return this.tasks.setCompleted(user.id, params.id, input.completed);
  }
}
