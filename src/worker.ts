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