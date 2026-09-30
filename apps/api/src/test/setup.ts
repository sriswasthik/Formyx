import { afterAll } from 'vitest';
import { testPrisma } from './database.js';

afterAll(async () => {
  await testPrisma.$disconnect();
});
