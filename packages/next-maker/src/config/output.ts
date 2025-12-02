import pc from 'picocolors';

// Define a type for allowed colors explicitly
export type Color =
  | 'reset'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'cyan'
  | 'magenta'
  | 'white'
  | 'gray'
  | 'bright'
  | 'dim';

const colorMap: Record<Color, (s: string) => string> = {
  reset: (s: string) => s,
  red: pc.red,
  green: pc.green,
  yellow: pc.yellow,
  blue: pc.blue,
  cyan: pc.cyan,
  magenta: pc.magenta,
  white: pc.white,
  gray: pc.gray,
  bright: pc.bold,
  dim: pc.dim,
};

// Print with color
export function print(message: string, color: Color = 'reset'): void {
  const colorFn = colorMap[color] ?? ((text: string) => text);
  console.log(colorFn(message));
}

// Print section header
export function printHeader(title: string): void {
  console.log('');
  print('═'.repeat(60), 'cyan');
  print(`  ${title}`, 'bright');
  print('═'.repeat(60), 'cyan');
  console.log('');
}

// Print success message
export function success(message: string): void {
  print(`✓ ${message}`, 'green');
}

// Print error message
export function error(message: string): void {
  print(`✖ ${message}`, 'red');
}

// Alias for error
export const logError = error;

// Print warning message
export function warning(message: string): void {
  print(`⚠ ${message}`, 'yellow');
}

// Print info message
export function info(message: string): void {
  print(`ℹ ${message}`, 'cyan');
}

export function log(message: string): void {
  print(message);
}

// Print banner
export function printBanner(): void {
  console.log('');
  print('╔═══════════════════════════════════════════════════════════╗', 'cyan');
  print('║                                                           ║', 'cyan');
  print('║         🚀 Create Teispace Next.js App 🚀                 ║', 'cyan');
  print('║                                                           ║', 'cyan');
  print('╚═══════════════════════════════════════════════════════════╝', 'cyan');
  console.log('');
}
