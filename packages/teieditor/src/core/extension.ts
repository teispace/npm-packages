import type { Klass, LexicalEditor, LexicalNode } from 'lexical';
import type { ComponentType } from 'react';
import type { ExtensionConfig, TeiExtension } from './types.js';

/**
 * Base class for creating extensions. Provides `configure()` out of the box.
 *
 * @example
 * ```ts
 * class BoldExtension extends BaseExtension<{ shortcut: string }> {
 *   name = 'bold' as const;
 *   defaults = { shortcut: 'Ctrl+B' };
 * }
 * export const Bold = new BoldExtension();
 * ```
 */
export abstract class BaseExtension<TConfig extends ExtensionConfig = ExtensionConfig>
  implements TeiExtension<TConfig>
{
  abstract readonly name: string;

  /** Default configuration. Override in subclasses. */
  protected abstract readonly defaults: TConfig;

  private _config: Partial<TConfig> = {};

  get config(): TConfig {
    return { ...this.defaults, ...this._config };
  }

  configure(config: Partial<TConfig>): this {
    // Return a shallow clone with merged config (immutable pattern).
    const clone = Object.create(Object.getPrototypeOf(this)) as this;
    Object.assign(clone, this);
    clone._config = { ...this._config, ...config };
    return clone;
  }

  // Override in subclasses as needed ----------------------------------------

  getNodes?(): Array<Klass<LexicalNode>>;
  getPlugins?(): Array<ComponentType>;
  getKeyBindings?(): Record<string, (editor: LexicalEditor) => boolean>;
  onRegister?(editor: LexicalEditor): (() => void) | void;
  onDestroy?(editor: LexicalEditor): void;
}
