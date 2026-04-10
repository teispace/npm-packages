import { BaseExtension } from '../../core/extension.js';
import type { ExtensionConfig } from '../../core/types.js';
import { defaultSlashCommands } from '../slash-command/default-commands.js';
import type { SlashCommandItem } from '../slash-command/types.js';

export interface TurnIntoConfig extends ExtensionConfig {
  /** Block types available in the turn-into menu. Reuses slash command items. */
  items: SlashCommandItem[];
}

/**
 * Turn-into extension — allows converting the current block to another type.
 * This is a data-only extension; the UI is handled by the registry's
 * turn-into-menu component or can be triggered from the block handle.
 *
 * It reuses the same SlashCommandItem interface so commands are consistent
 * between slash menu and turn-into menu.
 */
class TurnIntoExtension extends BaseExtension<TurnIntoConfig> {
  readonly name = 'turnInto';
  protected readonly defaults: TurnIntoConfig = {
    // Filter slash commands to only block-level items (exclude divider, etc.)
    items: defaultSlashCommands.filter((c) =>
      [
        'paragraph',
        'heading1',
        'heading2',
        'heading3',
        'bulletList',
        'numberedList',
        'checklist',
        'quote',
        'codeBlock',
      ].includes(c.name),
    ),
  };
}

export const TurnInto = new TurnIntoExtension();
