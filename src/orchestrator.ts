import { createClient } from "redis";
import { kubernetesManager } from "./k8s.js";
import { logger } from "./logger.js";

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
}