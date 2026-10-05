import { defineConfig } from 'vitest/config';

// Tests unitaires : code sans interface (règles de codes, adressage, géométrie, grille, exports).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
