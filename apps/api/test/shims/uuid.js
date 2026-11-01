// Jest runs CommonJS, and the uuid that @solana/web3.js -> rpc-websockets pulls
// in ships ESM only. rpc-websockets just needs v4 ids, which node provides.
const { randomUUID } = require('crypto');
module.exports = { v4: randomUUID };
