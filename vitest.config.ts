import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      enabled: true,
      reporter: ['text', 'html'],
      include: ['src/renderer/**/*.{ts,tsx}', 'src/shared/**/*.ts'],
      exclude: ['src/renderer/main.tsx', 'src/renderer/types/**/*.d.ts'],
    },
  },
});
