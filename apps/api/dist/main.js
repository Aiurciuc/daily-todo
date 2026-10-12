"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const node_path_1 = require("node:path");
const dotenv_1 = require("dotenv");
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
(0, dotenv_1.config)({ path: (0, node_path_1.resolve)(process.cwd(), '../../.env') });
(0, dotenv_1.config)();
async function bootstrap() {
    const logger = new common_1.Logger('Bootstrap');
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.setGlobalPrefix('api');
    app.enableShutdownHooks();
    const port = Number(process.env.API_PORT ?? 3000);
    const host = process.env.API_HOST ?? '0.0.0.0';
    await app.listen(port, host);
    logger.log(`API listening on ${host}:${port}`);
}
void bootstrap();
//# sourceMappingURL=main.js.map