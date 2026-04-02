import { Command } from 'commander';
import { registerCommands } from './commands/index';
import { error, setupCancellationHandlers } from './config';

// Suppress the annoying enquirer localstorage warning
/* eslint-disable @typescript-eslint/no-unused-vars, prefer-rest-params */
const originalEmitWarning = process.emitWarning;
process.emitWarning = function (warning: any, _type?: any, _code?: any, _ctor?: any) {
  if (
    typeof warning === 'string' &&
    warning.includes('--localstorage-file') &&
    warning.includes('was provided without a valid path')
  ) {
    return; // Suppress this specific warning
  }
  // @ts-expect-error - calling with variable arguments
  return originalEmitWarning.apply(process, arguments);
};
/* eslint-enable @typescript-eslint/no-unused-vars, prefer-rest-params */

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
