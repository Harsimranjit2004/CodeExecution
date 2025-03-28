import express, { Request, Response } from 'express';
import { logger } from './logger.js';
import { Orchestrator, JobData } from './orchestrator.js';

interface Submission {
    source_code: string;
    language_id: number;
    problem_id: string;
    callback_url?: string;
    timeout?: number;
    memory_limit?: number;
    expected_output?: string;
}

const app = express();
app.use(express.json({ limit: '10mb' }));

let orchestrator: Orchestrator;
async function initializeOrchestrator() {
    try {
        orchestrator = new Orchestrator(
            { host: 'redis', port: 6379 }, // redisConfig
            'code-worker-deployment',     // deploymentName
            'app=code-worker',            // podSelector
            {                             // scalingConfig
                minPods: 1,
                maxPods: 10,
                jobsPerPod: 5,
                checkIntervalMs: 10000,
            }
        );
        logger.info('Orchestrator initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize Orchestrator:', error);
        process.exit(1);
    }
}

async function submitJob(input: Submission): Promise<string> {
    try {
        const jobData: JobData = { ...input };
        return await orchestrator.submitJob(jobData);
    } catch (error) {
        logger.error('Submit job error:', error);
        throw error;
    }
}

export function startApi(port: number = 3000) {
    app.post('/submit/batch', async (req: any, res: any) => {
        logger.info('Received batch submission request');
        const { submissions }: { submissions: Submission[] } = req.body;
        if (!Array.isArray(submissions) || submissions.length === 0) {
            return res.status(400).json({ error: 'Submission must be a non-empty array' });
        }
        try {
            const tokens: string[] = [];
            for (const submission of submissions) {
                if (!submission.source_code || !submission.language_id || !submission.problem_id) {
                    return res.status(400).json({ error: 'Each submission must have source_code, language_id, and problem_id' });
                }
                const token = await submitJob(submission);
                logger.info(`Job queued with token ${token}`);
                tokens.push(token);
            }
            res.status(200).json({ tokens });
        } catch (error) {
            logger.error('Batch submission error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    app.get('/health', (req: Request, res: Response) => {
        res.status(200).json({ status: 'healthy' });
    });

    app.listen(port, async () => {
        logger.info(`API server started on port ${port}`);
        await initializeOrchestrator();
        orchestrator.startScalingLoop(); // Enable scaling
    });
}

startApi();