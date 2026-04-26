/**
 * Source for the two validation scripts the starter ships under `scripts/`.
 *
 * Inlined here (not fetched from the starter via degit) because (a) these
 * scripts are stable and don't drift, (b) we get instant offline retrofits,
 * and (c) the diff between starter and next-maker is small enough to spot
 * during release reviews. If they ever start to differ, switch this module
 * to a degit fetch — the rest of the service won't need to change.
 */

export const SYNC_ENV_SCRIPT = `import * as fs from 'node:fs';
import * as path from 'node:path';

const envPath = path.join(process.cwd(), '.env');
const examplePath = path.join(process.cwd(), '.env.example');

if (!fs.existsSync(envPath)) {
  console.log('⚠️  No .env file found. Skipping sync.');
  process.exit(0);
}

const envContent = fs.readFileSync(envPath, 'utf-8');
const lines = envContent.split('\\n');

let isPublicBlock = false;

const exampleLines = lines.map((line) => {
  const trimmed = line.trim();

  // Preserve empty lines and reset public block state
  if (!trimmed) {
    isPublicBlock = false;
    return line;
  }

  // Preserve comments
  if (trimmed.startsWith('#')) {
    if (line.toLowerCase().includes('-public')) {
      isPublicBlock = true;
    }
    return line;
  }

  // Parse KEY=VALUE
  const match = line.match(/^([^=]+)=(.*)$/);

  if (match) {
    const key = match[1];

    // Public marker: explicit "# -public" comment, or "KEY=VAL # -public"
    if (isPublicBlock || line.toLowerCase().includes('-public')) {
      isPublicBlock = false;
      return line;
    }

    isPublicBlock = false;
    return \`\${key}=\`;
  }

  isPublicBlock = false;
  return line;
});

const newExampleContent = exampleLines.join('\\n');

let currentExampleContent = '';
if (fs.existsSync(examplePath)) {
  currentExampleContent = fs.readFileSync(examplePath, 'utf-8');
}

if (currentExampleContent !== newExampleContent) {
  fs.writeFileSync(examplePath, newExampleContent);
  console.log('✅ Synchronized .env.example with .env');
} else {
  console.log('✨ .env.example is already up to date');
}
`;

export const CHECK_DEPRECATED_SCRIPT = `/**
 * Walks every identifier in the project and flags any whose resolved TypeScript
 * symbol carries a \`@deprecated\` JSDoc tag. Catches deprecated API usage that
 * \`tsc --noEmit\` does not surface (deprecations are "suggestion"-level, not
 * errors) and that Biome does not yet detect.
 *
 * Exits 1 if any deprecated usage is found (so it can gate CI).
 */
import path from 'node:path';
import ts from 'typescript';

const cwd = process.cwd();
const configPath = ts.findConfigFile(cwd, ts.sys.fileExists, 'tsconfig.json');

if (!configPath) {
  console.error('tsconfig.json not found');
  process.exit(1);
}

const raw = ts.readConfigFile(configPath, ts.sys.readFile).config;
const parsed = ts.parseJsonConfigFileContent(raw, ts.sys, path.dirname(configPath));

const program = ts.createProgram({
  rootNames: parsed.fileNames,
  options: parsed.options,
});

const checker = program.getTypeChecker();

function isDeprecated(sym: ts.Symbol | undefined): boolean {
  if (!sym) return false;
  return sym.getJsDocTags(checker).some((tag) => tag.name === 'deprecated');
}

let hits = 0;

for (const sourceFile of program.getSourceFiles()) {
  if (sourceFile.fileName.includes('node_modules')) continue;
  if (!sourceFile.fileName.startsWith(cwd)) continue;

  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      const sym = checker.getSymbolAtLocation(node);
      if (isDeprecated(sym)) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        console.log(
          \`\${path.relative(cwd, sourceFile.fileName)}:\${line + 1}:\${character + 1}  \${node.text}  (@deprecated)\`,
        );
        hits++;
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
}

if (hits === 0) {
  console.log('✓ No deprecated API usage found.');
  process.exit(0);
}

console.log(\`\\n\${hits} deprecated symbol use(s) found.\`);
process.exit(1);
`;
