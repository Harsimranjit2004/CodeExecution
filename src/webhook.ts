import express, { Request, Response } from 'express';
import { logger } from './logger.js'; // Reuse your logger, adjust path if needed

const app = express();
app.use(express.json()); // Parse incoming JSON payloads

// Webhook endpoint to receive execution results
app.post('/callback', (req: Request, res: Response) => {
    const result = req.body;
    logger.info('Received webhook callback:', {
        token: result.token,
        stdout: result.stdout,
        stderr: result.stderr,
        status: result.status,
        execution_time: result.execution_time,
        exit_code: result.exit_code,
    });

    // Respond to the worker to acknowledge receipt
    res.status(200).json({ message: 'Webhook received successfully' });
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'healthy' });
});

// Start the webhook server
const port = 3001; // Use a different port from the main API
app.listen(port, () => {
    logger.info(`Webhook server started on port ${port}`);
});