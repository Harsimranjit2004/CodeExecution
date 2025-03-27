import express, { Request, Response } from 'express'
import { logger } from './logger.js'

interface Submission {
    source_code: string;
    language_id: number;
    problem_id: string;
    stdin?: string;
    callback_url?: string;
    timeout?: number
    memory_limit?: number;
}
function submitJob(input: any): string {
    return 'hi'
}
const app = express()
app.use(express.json({ limit: '10mb' }))

export function startApi(port: number = 3000) {
    app.post('/submit/batch', async (req: any, res: any) => {
        const { submissions }: { submissions: Submission[] } = req.body;
        if (!Array.isArray(submissions) || submissions.length == 0) {
            return res.status(400).json({ error: 'Submission must be a non-empty array' })
        }

        try {
            const tokens: string[] = [];
            for (const submission of submissions) {
                if (!submission.source_code || !submission.language_id || !submission.problem_id) {
                    return res.status(400).json({ error: 'Each submission must have source_code, language_id, and problem_id' });
                }

                const token = await submitJob({
                    source_code: submission.source_code,
                    language_id: submission.language_id,
                    problem_id: submission.problem_id,
                    callback_url: submission.callback_url,
                    timeout: submission.timeout,
                    memory_limit: submission.memory_limit
                });
                tokens.push(token);
            }
        } catch (error) {
            logger.error('Batch submission error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }

    })
    app.get('/health', (req, res) => {
        res.status(200).json({ status: 'healthy' })
    })
    app.listen(port, () => {
        logger.info(`Api server started on port ${port}`)
    })
}