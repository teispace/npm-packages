/**
 * Registry of UI components that can be scaffolded into user projects
 * via `npx teieditor add <component>`.
 *
 * Each entry describes a component: its source file, dependencies,
 * and where it should be placed.
 */
export interface RegistryComponent {
  /** Component name (used in CLI). */
  name: string;
  /** Description shown in CLI help. */
  description: string;
  /** Source files relative to registry/ui/ */
  files: string[];
  /** npm packages the component imports from (user may need to install). */
  dependencies: string[];
  /** Other registry components this depends on. */
  registryDependencies: string[];
}

export const registry: RegistryComponent[] = [
  {
    name: 'toolbar',
    description: 'Default toolbar with text formatting and undo/redo',
    files: ['toolbar.tsx'],
    dependencies: ['@teispace/teieditor', 'lexical', '@lexical/react'],
    registryDependencies: [],
  },
  {
    name: 'editor',
    description: 'Zero-config TeiEditor component with toolbar and change handling',
    files: ['editor.tsx'],
    dependencies: ['@teispace/teieditor', 'lexical', '@lexical/react', '@lexical/html'],
    registryDependencies: ['toolbar'],
  },
];
