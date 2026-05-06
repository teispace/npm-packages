declare module 'png-to-ico' {
  /**
   * Convert one or more PNG buffers (or file paths) into an ICO buffer.
   * Each input PNG becomes one entry in the ICO; pass multiple sizes
   * (16, 32, 48) for a multi-resolution favicon.
   */
  export default function pngToIco(input: Buffer | Buffer[] | string | string[]): Promise<Buffer>;
}
