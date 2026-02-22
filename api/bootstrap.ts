/**
 * Load .env before any other app code so JWT_SECRET etc. are available.
 */
import { resolve } from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: resolve(process.cwd(), '.env'), override: true });
