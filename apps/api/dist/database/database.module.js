"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseModule = exports.DATABASE_POOL = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
exports.DATABASE_POOL = Symbol('DATABASE_POOL');
const logger = new common_1.Logger('Database');
let DatabaseShutdown = class DatabaseShutdown {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    async onApplicationShutdown() {
        await this.pool.end();
    }
};
DatabaseShutdown = __decorate([
    __param(0, (0, common_1.Inject)(exports.DATABASE_POOL)),
    __metadata("design:paramtypes", [pg_1.Pool])
], DatabaseShutdown);
let DatabaseModule = class DatabaseModule {
};
exports.DatabaseModule = DatabaseModule;
exports.DatabaseModule = DatabaseModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        providers: [
            {
                provide: exports.DATABASE_POOL,
                useFactory: () => {
                    const port = Number(process.env.DB_PORT ?? 5432);
                    const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
                    const missing = required.filter((key) => !process.env[key]);
                    if (missing.length > 0)
                        throw new Error(`Missing required database configuration: ${missing.join(', ')}`);
                    if (!Number.isInteger(port) || port < 1 || port > 65535)
                        throw new Error('DB_PORT must be a valid TCP port');
                    const pool = new pg_1.Pool({
                        host: process.env.DB_HOST,
                        port,
                        database: process.env.DB_NAME,
                        user: process.env.DB_USER,
                        password: process.env.DB_PASSWORD,
                        max: 5,
                        connectionTimeoutMillis: 1500,
                        idleTimeoutMillis: 10000,
                        statement_timeout: 2000,
                        application_name: 'local-todo-api',
                    });
                    pool.on('error', () => logger.warn('An idle database connection encountered an error'));
                    return pool;
                },
            },
            DatabaseShutdown,
        ],
        exports: [exports.DATABASE_POOL],
    })
], DatabaseModule);
//# sourceMappingURL=database.module.js.map