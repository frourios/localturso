import { getStore } from '../server/service/drizzleClient';
const store = await getStore();
store.client.close();
console.log('LocalTurso metadata migrated.');
