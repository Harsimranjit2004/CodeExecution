import { createClient } from "redis";
import { kubernetesManager } from "./k8s.js";
import { logger } from "./logger.js";
import { v4 as uuidv4 } from 'uuid'
interface ScalingConfig {
    minPods: number;
    maxPods: number;
    jobsPerPod: number;
    checkIntervalMs: number;
}

export interface JobData {
    source_code: string;
    language_id: number;
    problem_id: string;
    callback_url?: string;
    timeout?: number;
    memory_limit?: number;
}

const QUEUE_NAME = 'code-execution-queue';


export class Orchestrator {
    private redisClient: ReturnType<typeof createClient> | null = null;
    private k8sManager: kubernetesManager;
    private config: ScalingConfig;
    private deploymentName: string;
    private podSelector: string;
    private scalingInterval: NodeJS.Timeout | null = null;


    constructor(
        redisConfig: { host: string, port: number },
        deploymentName: string = 'code-worker-deployment',
        podSelector: string = 'app=code-worker',
        scalingConfig?: Partial<ScalingConfig>
    ) {
        this.k8sManager = new kubernetesManager;
        this.deploymentName = deploymentName;
        this.podSelector = podSelector;
        this.config = {
            minPods: 1,
            maxPods: 10,
            jobsPerPod: 5,
            checkIntervalMs: 10000,
            ...scalingConfig
        }
        this.connectRedis(redisConfig);
    }

    private async connectRedis(redisConfig: { host: string; port: number }) {
        if (!this.redisClient) {
            this.redisClient = createClient({
                socket: { host: redisConfig.host, port: redisConfig.port }
            })
            this.redisClient.on('error', err => logger.error('Redis Client Error', err));
            await this.redisClient.connect();
            logger.info('Redis client connected');
        }
    }
    private async getRedisClient(): Promise<ReturnType<typeof createClient>> {
        if (!this.redisClient) {
            throw new Error('Redis client not initialized');
        }
        return this.redisClient;
    }
    private async scaleWorkers(): Promise<void> {
        try {
            const redis = await this.getRedisClient();
            const queueLength = await redis.LLEN(QUEUE_NAME)
            const currentPods = await this.k8sManager.getPodWithLabel(this.podSelector);
            const metrics = await this.k8sManager.topPods(this.podSelector);
            let desiredPods = Math.max(
                this.config.minPods,
                Math.min(this.config.maxPods, Math.ceil(queueLength / this.config.jobsPerPod))
            )
            if (metrics.length > 0) {
                const totalCpu = metrics.reduce((sum, pod) => sum + this.parseCpu(pod.cpu), 0);
                const avgCpuPerPod = currentPods > 0 ? totalCpu / currentPods : 0;
                if (avgCpuPerPod > 0.8) {
                    desiredPods = Math.min(this.config.maxPods, desiredPods + 1);
                    logger.info(`CPU usage high (${avgCpuPerPod.toFixed(2)} cores/pod), scaling up`);
                }
            }
            if (currentPods !== desiredPods) {
                logger.info(`Scaling workers: ${currentPods} → ${desiredPods} (queue: ${queueLength}, CPU: ${metrics[0]?.cpu || 'N/A'})`);
                await this.k8sManager.scaleDeployment(this.deploymentName, desiredPods);
            } else {
                logger.debug(`No scaling needed: ${currentPods} pods, ${queueLength} jobs`);
            }

        } catch (error) {
            logger.error('Scaling error:', error);
        }
    }
    private parseCpu(cpu: string): number {
        if (cpu.endsWith('n')) return parseInt(cpu) / 1e9;
        if (cpu.endsWith('u')) return parseInt(cpu) / 1e6;
        if (cpu.endsWith('m')) return parseInt(cpu) / 1e3;
        return parseInt(cpu);
    }

    startScalingLoop(): void {
        if (this.scalingInterval) {
            clearInterval(this.scalingInterval)
        }
        this.scalingInterval = setInterval(
            () => this.scaleWorkers(),
            this.config.checkIntervalMs
        );
        logger.info(`Scaling loop started (interval : ${this.config.checkIntervalMs}ms)`)
    }

    public async getQueueStatus(): Promise<{ queued: number; workerCount: number }> {
        const redis = await this.getRedisClient();
        const [queued, workerCount] = await Promise.all([
            redis.LLEN(QUEUE_NAME),
            this.k8sManager.getPodWithLabel(this.podSelector)
        ])
        return { queued, workerCount }
    }
    public async submitJob(data: Omit<JobData, 'token'>): Promise<string> {
        const token = uuidv4();
        const redis = await this.getRedisClient();
        const job: JobData & { token: string } = { ...data, token };
        // change this for test cases
        await redis.lPush(QUEUE_NAME, JSON.stringify(job));
        logger.info(`Job submitted with token ${token} for problem ${data.problem_id}`);

        return token;
    }

    public async shutdown(): Promise<void> {
        if (this.scalingInterval) {
            clearInterval(this.scalingInterval);
            this.scalingInterval = null;
        }

        if (this.redisClient) {
            await this.redisClient.quit();
            this.redisClient = null;
            logger.info('Orchestrator Redis client shut down');
        }
    }

}