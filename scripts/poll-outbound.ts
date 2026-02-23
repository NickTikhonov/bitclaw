import { createBitclawPaths } from '../src/config.js';
import { receiveFromAgent } from '../src/ipc.js';

const paths = createBitclawPaths();

const result = await receiveFromAgent(paths, async (event) => {
  console.log(JSON.stringify(event, null, 2));
});

console.log(`processed=${result.processed} errors=${result.errors}`);

