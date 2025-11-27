import { Command } from 'commander';
import { registerCommands } from './commands/index';
import { error, setupCancellationHandlers } from './config';

async function main() {
  setupCancellationHandlers({ logger: (m: string) => error(m) });

  const program = new Command();

  program.name('next-maker').description('Teispace Next.js Project Generator').version('1.0.0');

  registerCommands(program);

  program.parse();
}

main().catch((err) => {
  const message =
    err && typeof err === 'object' && 'message' in err ? (err as Error).message : String(err);
  error(`Unexpected error: ${message}`);
});
