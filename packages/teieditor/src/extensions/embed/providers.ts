/**
 * Where embeds come from. A provider reads its links (`match`), and builds
 * the frame's address (`src`) and the page's (`url`) from an id. An id is
 * only ever used when its own page's link reads back as it: what reaches
 * `src` has been through `match`, whoever wrote it (a pasted link, saved
 * JSON, hostile HTML).
 */
export interface EmbedProvider {
  /** Saved with each embed (`provider` in JSON, `data-tei-embed` in HTML). */
  name: string;
  /** Its name, as people know it: `YouTube`. */
  label: string;
  /** What it shows, for the frame's title: `YouTube video`. */
  title: string;
  /** An icon name the editor knows (`video`, `embed`). */
  icon?: string;
  /** The id in a link to it (a page, or its frame's own address), else `null`. */
  match(url: URL): string | null;
  /** The frame's address. */
  src(id: string, context: { theme: 'light' | 'dark' }): string;
  /** The page it shows. */
  url(id: string): string;
  /** Width over height. Default 16/9. `null`: a fixed `height` the frame may change. */
  aspect?: number | null;
  /** In px, with `aspect: null`: the height before the frame reports its own. */
  height?: number;
  /** In px: no wider than this. */
  maxWidth?: number;
  /** The frame's `allow`. */
  allow?: string;
  /** The frame's height from a message it posts, if it posts them. */
  resize?(event: MessageEvent): number | null;
}

/** An id, checked: it reads back from its own page's link. */
export function embedId(provider: EmbedProvider, id: unknown): string | null {
  if (typeof id !== 'string' || id.length === 0 || id.length > 512) return null;
  try {
    return provider.match(new URL(provider.url(id))) === id ? id : null;
  } catch {
    return null;
  }
}

/** The provider and id of a link, from the first provider that reads it. */
export function matchEmbed(
  providers: readonly EmbedProvider[],
  link: string,
): { provider: EmbedProvider; id: string } | null {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  for (const provider of providers) {
    const id = provider.match(url);
    if (id !== null && embedId(provider, id) === id) return { provider, id };
  }
  return null;
}

/** The host without `www.`/`m.`, if it is one of these. */
function host(url: URL, ...hosts: string[]): boolean {
  return hosts.includes(url.hostname.replace(/^(?:www|m|mobile)\./, ''));
}

const VIDEO_ALLOW =
  'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen';

const YOUTUBE_ID = /^[\w-]{11}$/;

/** Seconds from `t=90`, `t=90s`, `t=1m30s`, `start=90`. */
function seconds(value: string | null): number {
  if (!value) return 0;
  const parts = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(value);
  if (!parts) return 0;
  const [, h = '0', m = '0', s = '0'] = parts;
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

/** YouTube, through its privacy-enhanced domain. An id is `VIDEO` or `VIDEO&t=SECONDS`. */
export const youtube: EmbedProvider = {
  name: 'youtube',
  label: 'YouTube',
  title: 'YouTube video',
  icon: 'video',
  match(url) {
    let video: string | null = null;
    if (host(url, 'youtu.be')) video = url.pathname.slice(1);
    else if (host(url, 'youtube.com', 'youtube-nocookie.com', 'music.youtube.com')) {
      const path = /^\/(?:embed|shorts|live|v)\/([^/]+)\/?$/.exec(url.pathname);
      video = path
        ? (path[1] as string)
        : url.pathname === '/watch'
          ? url.searchParams.get('v')
          : null;
    }
    if (!video || !YOUTUBE_ID.test(video)) return null;
    const start = seconds(url.searchParams.get('t') ?? url.searchParams.get('start'));
    return start > 0 ? `${video}&t=${start}` : video;
  },
  src(id) {
    const [video, start] = id.split('&t=');
    return `https://www.youtube-nocookie.com/embed/${video}${start ? `?start=${start}` : ''}`;
  },
  url(id) {
    const [video, start] = id.split('&t=');
    return `https://www.youtube.com/watch?v=${video}${start ? `&t=${start}s` : ''}`;
  },
  allow: VIDEO_ALLOW,
};

/** Vimeo, without tracking. An id is `VIDEO`, or `VIDEO/HASH` for an unlisted one. */
export const vimeo: EmbedProvider = {
  name: 'vimeo',
  label: 'Vimeo',
  title: 'Vimeo video',
  icon: 'video',
  match(url) {
    if (host(url, 'player.vimeo.com')) {
      const video = /^\/video\/(\d{1,12})\/?$/.exec(url.pathname)?.[1];
      const hash = url.searchParams.get('h');
      if (!video) return null;
      return hash && /^[\da-f]{6,20}$/.test(hash) ? `${video}/${hash}` : video;
    }
    if (!host(url, 'vimeo.com')) return null;
    const path =
      /^\/(?:channels\/[\w-]+\/|groups\/[\w-]+\/videos\/|video\/)?(\d{1,12})(?:\/([\da-f]{6,20}))?\/?$/.exec(
        url.pathname,
      );
    if (!path) return null;
    return path[2] ? `${path[1]}/${path[2]}` : (path[1] as string);
  },
  src(id) {
    const [video, hash] = id.split('/');
    return `https://player.vimeo.com/video/${video}?${hash ? `h=${hash}&` : ''}dnt=1`;
  },
  url: (id) => `https://vimeo.com/${id}`,
  allow: VIDEO_ALLOW,
};

/** Posts on X (Twitter), without tracking; the frame grows to fit the post. */
export const x: EmbedProvider = {
  name: 'x',
  label: 'X',
  title: 'Post on X',
  icon: 'embed',
  match(url) {
    if (host(url, 'platform.twitter.com')) {
      const id = url.pathname === '/embed/Tweet.html' ? url.searchParams.get('id') : null;
      return id && /^\d{1,20}$/.test(id) ? id : null;
    }
    if (!host(url, 'x.com', 'twitter.com')) return null;
    return (
      /^\/(?:\w{1,15}|i(?:\/web)?)\/status(?:es)?\/(\d{1,20})\/?$/.exec(url.pathname)?.[1] ?? null
    );
  },
  src: (id, { theme }) =>
    `https://platform.twitter.com/embed/Tweet.html?id=${id}&dnt=true&theme=${theme}`,
  url: (id) => `https://x.com/i/status/${id}`,
  aspect: null,
  height: 320,
  maxWidth: 550,
  resize(event) {
    if (event.origin !== 'https://platform.twitter.com') return null;
    let data: unknown = event.data;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        return null;
      }
    }
    const embed = (data as { 'twttr.embed'?: { method?: string; params?: unknown } } | null)?.[
      'twttr.embed'
    ];
    if (embed?.method !== 'twttr.private.resize' || !Array.isArray(embed.params)) return null;
    const height = (embed.params[0] as { height?: unknown } | undefined)?.height;
    return typeof height === 'number' && height > 0 && height < 10000 ? Math.ceil(height) : null;
  },
};

/** Figma files, designs, prototypes, boards and slides. An id is `KIND/KEY`, with its `?node-id=`. */
export const figma: EmbedProvider = {
  name: 'figma',
  label: 'Figma',
  title: 'Figma file',
  icon: 'embed',
  match(url) {
    if (!host(url, 'figma.com')) return null;
    if (url.pathname === '/embed') {
      const inner = url.searchParams.get('url');
      try {
        return inner && !inner.includes('/embed') ? figma.match(new URL(inner)) : null;
      } catch {
        return null;
      }
    }
    const path = /^\/(file|design|proto|board|slides)\/([A-Za-z0-9]{10,64})(?:\/[^/]*)?\/?$/.exec(
      url.pathname,
    );
    if (!path) return null;
    const node = url.searchParams.get('node-id');
    const id = `${path[1]}/${path[2]}`;
    return node && /^[\d:-]{1,40}$/.test(node) ? `${id}?node-id=${node}` : id;
  },
  src: (id) =>
    `https://www.figma.com/embed?embed_host=teieditor&url=${encodeURIComponent(`https://www.figma.com/${id}`)}`,
  url: (id) => `https://www.figma.com/${id}`,
  allow: 'clipboard-write; fullscreen',
};

/** Loom recordings. */
export const loom: EmbedProvider = {
  name: 'loom',
  label: 'Loom',
  title: 'Loom video',
  icon: 'video',
  match(url) {
    if (!host(url, 'loom.com')) return null;
    return /^\/(?:share|embed)\/([\da-f]{32})\/?$/.exec(url.pathname)?.[1] ?? null;
  },
  src: (id) => `https://www.loom.com/embed/${id}`,
  url: (id) => `https://www.loom.com/share/${id}`,
  allow: VIDEO_ALLOW,
};

/** The providers an embed comes from, unless you say otherwise. */
export const EMBED_PROVIDERS: readonly EmbedProvider[] = [youtube, vimeo, x, figma, loom];
