import { GameServer } from './GameServer';

const PORT = parseInt(process.env.PORT || '8080', 10);

const server = new GameServer(PORT);

process.on('SIGINT', () => {
  console.log('\nShutting down...');
  process.exit(0);
});
