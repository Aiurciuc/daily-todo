import type { Response } from 'express';
import { Pool } from 'pg';
export declare class HealthController {
    private readonly pool;
    private readonly logger;
    constructor(pool: Pool);
    live(): {
        api: string;
    };
    ready(response: Response): Promise<void>;
}
