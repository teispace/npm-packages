import type { Klass, LexicalNode } from 'lexical';
import type { ComponentType } from 'react';
import { BaseExtension } from '../../core/extension.js';
import type { ExtensionConfig } from '../../core/types.js';
import { ImageNode } from './image-node.js';
import { ImagePlugin } from './image-plugin.js';

export interface ImageConfig extends ExtensionConfig {
  /** Async upload handler. Receives a File, returns a URL string. */
  onUpload?: (file: File) => Promise<string>;
  /** Max file size in bytes. Default: 10MB. */
  maxSize: number;
  /** Accepted MIME types. */
  accept: string[];
}

class ImageExtension extends BaseExtension<ImageConfig> {
  readonly name = 'image';
  protected readonly defaults: ImageConfig = {
    maxSize: 10 * 1024 * 1024,
    accept: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'],
  };

  getNodes(): Array<Klass<LexicalNode>> {
    return [ImageNode];
  }

  getPlugins(): Array<ComponentType> {
    const config = this.config;
    const Plugin = () =>
      ImagePlugin({
        onUpload: config.onUpload,
        maxSize: config.maxSize,
        accept: config.accept,
      });
    Plugin.displayName = 'ImagePluginWrapper';
    return [Plugin];
  }
}

export const Image = new ImageExtension();
export { $createImageNode, $isImageNode, ImageNode, type ImagePayload } from './image-node.js';
export { INSERT_IMAGE_COMMAND } from './image-plugin.js';
