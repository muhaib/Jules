/**
 * Load .env from the API directory, then fall back to the repository root, so
 * a single root .env works for the whole workspace in development. dotenv does
 * not overwrite variables that are already set, so a real environment always
 * wins over both files.
 */
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

config();
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });
