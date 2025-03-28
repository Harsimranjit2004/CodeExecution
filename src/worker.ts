import { createClient } from "redis";
import { exec } from 'child_process'
import axios from "axios";
import { logger } from "./logger.js";
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { promisify } from 'util'


const execAsync = promisify(exec)
const QUEUE_NAME = 'code-execution-queue'

interface JobData {
    source_code: string;
    language_id: number;
    stdin?: string;
    token: string;
    callback_url?: string;
    timeout?: number;
    memory_limit?: number;
}

interface ExecutionResult {
    stdout?: string;
    stderr?: string;
    status: string;
    execution_time?: number;
    exit_code?: number;
}

interface LanguageConfig {
    extension: string;
    compile?: (filepath: string) => string;
    execute: (filepath: string) => string;
    timeout: number;
}

const languageConfigs: Record<number, LanguageConfig> = {
    71: { // Python
        extension: 'py',
        execute: (filepath) => `python3 ${filepath}`,
        timeout: 10000
    },
    63: { // JavaScript (Node.js)
        extension: 'js',
        execute: (filepath) => `node ${filepath}`,
        timeout: 10000
    },
    50: { // C
        extension: 'c',
        compile: (filepath) => `gcc ${filepath} -o ${filepath.replace('.c', '')}`,
        execute: (filepath) => `${filepath.replace('.c', '')}`,
        timeout: 10000
    },
    62: { // Java
        extension: 'java',
        compile: (filepath) => `javac ${filepath}`,
        execute: (filepath) => {
            const className = path.basename(filepath, '.java');
            const directory = path.dirname(filepath);
            return `java -cp ${directory} ${className}`;
        },
        timeout: 15000
    }
};

export class Worker {
    private workerId: string;
    private redisClient: ReturnType<typeof createClient> | null = null;
    private running: boolean = false;

    constructor(redisConfig: { host: string; port: number }) {
        this.workerId = `worker-${Math.random().toString(36).slice(2, 7)}`;
        this.connectRedis(redisConfig)
    }
    private async connectRedis(redisConfig: { host: string; port: number }) {
        if (!this.redisClient) {
            this.redisClient = createClient({
                socket: { host: redisConfig.host, port: redisConfig.port }
            });
            this.redisClient.on('error', err => logger.error('Redis Client Error', err));
            await this.redisClient.connect();
            logger.info('Worker Redis client connected');
        }
    }

    private async getRedisClient(): Promise<ReturnType<typeof createClient>> {
        if (!this.redisClient) {
            throw new Error('Redis client not initialized');
        }
        return this.redisClient;
    }

    private async executeCode(
        job: JobData
    ): Promise<ExecutionResult> {
        const { source_code, language_id, token, timeout, memory_limit } = job;
        const config = languageConfigs[language_id];
        if (!config) {
            logger.error(`Unsupported language_id: ${language_id} for token ${token}`);
            return { status: 'error', stderr: `Unsupported language_id: ${language_id}`, exit_code: 1 };
        }
        let tempFilePath: string | null = null;
        let tempDir: string | null = null;
        let startTime: [number, number] = [0, 0];
        const effectiveTimeout = timeout || config.timeout;

        try {
            tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'code-'));
            tempFilePath = path.join(tempDir, `Main.${config.extension}`)
            await fs.writeFile(tempFilePath, source_code);
            logger.debug(`Created temp file: ${tempFilePath} for token ${token}`);
            if (config.compile) {
                startTime = process.hrtime();
                const { stderr } = await execAsync(config.compile(tempFilePath), { timeout: 30000 });
                const [seconds, nanoseconds] = process.hrtime(startTime);
                const compileTime = seconds * 1000 + nanoseconds / 1000000;

                if (stderr) {
                    logger.warn(`Compilation warning for token ${token}: ${stderr}`);
                    return {
                        stderr,
                        status: 'compilation_error',
                        execution_time: parseFloat(compileTime.toFixed(2)),
                        exit_code: 1
                    };
                }
            }
            const effectiveMemoryLimit = memory_limit || 512;
            const timeoutInSeconds = Math.ceil(effectiveTimeout / 1000);
            const command = `bash -c "ulimit -v ${effectiveMemoryLimit * 1024} && timeout ${timeoutInSeconds}s ${config.execute(tempFilePath)}"`;
            startTime = process.hrtime();
            const { stdout, stderr } = await execAsync(command);
            const [seconds, nanoseconds] = process.hrtime(startTime);
            const executionTime = seconds * 1000 + nanoseconds / 1000000;

            logger.info(`Execution completed for token ${token}, language ${language_id}`);
            return {
                stdout,
                stderr,
                status: 'completed',
                execution_time: parseFloat(executionTime.toFixed(2)),
                exit_code: 0
            };
        } catch (error: any) {
            const [seconds, nanoseconds] = error.code ? process.hrtime(startTime) : [0, 0];
            const executionTime = seconds * 1000 + nanoseconds / 1000000;

            if (error.code === 124) {
                logger.warn(`Execution timed out for token ${token}`);
                return { stderr: 'Execution timed out', status: 'timeout', execution_time: effectiveTimeout, exit_code: 124 };
            }

            if (error.code === 137) {
                logger.warn(`Memory limit exceeded for token ${token}`);
                return { stderr: 'Memory limit exceeded', status: 'memory_limit_exceeded', execution_time: parseFloat(executionTime.toFixed(2)), exit_code: 137 };
            }

            logger.error(`Execution error for token ${token}: ${error.message}`);
            return {
                stdout: error.stdout,
                stderr: error.stderr || error.message,
                status: 'runtime_error',
                execution_time: parseFloat(executionTime.toFixed(2)),
                exit_code: error.code || 1
            };
        } finally {
            if (tempDir) {
                fs.rm(tempDir, { recursive: true, force: true }).catch(err => logger.error(`Cleanup failed for token ${token}: ${err.message}`));
            }
        }
    }
    public async start(): Promise<void> {
        this.running = true;
        const redis = await this.getRedisClient();

        while (this.running) {
            try {
                const jobData = await redis.BRPOP(QUEUE_NAME, 0);
                if (!jobData) continue;

                const job: JobData = JSON.parse(jobData.element);
                logger.info(`[${this.workerId}] Processing job with token ${job.token} for problem  || 'unknown'}`, {
                    source_code: job.source_code,
                });
                // logger.info(`[${this.workerId}] Execution result for token ${job.token}:`, { ...result });
                logger.info(`[${this.workerId}] Webhook sent to ${job.callback_url} for token ${job.token}`);

                const result = await this.executeCode(job);

                if (job.callback_url) {
                    try {
                        await axios.post(job.callback_url, { token: job.token, ...result });
                        logger.info(`Webhook sent to ${job.callback_url} for token ${job.token}`);
                    } catch (error: any) {
                        logger.error(`Webhook failed for token ${job.token}: ${error.message}`);
                    }
                }
            } catch (error: any) {
                logger.error(`Worker error: ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }
    public async shutdown(): Promise<void> {
        this.running = false;
        if (this.redisClient) {
            await this.redisClient.quit();
            this.redisClient = null;
            logger.info('Worker Redis client shut down');
        }
    }
}

const worker = new Worker({ host: 'localhost', port: 6379 });
worker.start();