import 'dotenv/config';
import vinext from 'vinext';
import { defineConfig } from 'vite';
export default defineConfig({
  // The browser SQL client pulls CommonJS dependencies such as promise-limit.
  environments: { client: { optimizeDeps: { include: ['@libsql/client/web'] } } },
  plugins: [
    vinext({
      nextConfig: {
        output: 'standalone',
        serverExternalPackages: ['@libsql/client', 'drizzle-orm'],
      },
    }),
  ],
});
