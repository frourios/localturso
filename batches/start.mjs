import 'dotenv/config';
process.env.PORT ??= '5050';
await import('../dist/standalone/server.js');
