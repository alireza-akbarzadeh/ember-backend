import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './drizzle/migrations',
  // Schema lives under src/ so the Nest build can import it without dragging
  // a second root directory into dist/. drizzle/ holds generated SQL only.
  schema: './src/database/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
