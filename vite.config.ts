// vitest 의 test 필드를 쓰므로 'vite' 가 아니라 'vitest/config' 에서 가져온다
import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    target: 'es2022',
    cssCodeSplit: false,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
