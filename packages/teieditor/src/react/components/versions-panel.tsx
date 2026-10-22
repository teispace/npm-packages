'use client';

import {
  type ComponentPropsWithoutRef,
  type FormEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { TeiEditor } from '../../core/editor.js';
import type { VersionDiff } from '../../extensions/versions/diff.js';
import type { TeiVersion, VersionsStorage } from '../../extensions/versions/index.js';
import {
  compare as compareIcon,
  eye,
  saveVersion,
  trash,
  versionHistory,
} from '../../icons/index.js';
import { useOptionalEditor } from '../context.js';
import { Button } from '../ui/button.js';
import { cx } from '../ui/context.js';
import { Input } from '../ui/controls.js';
import { Dialog } from '../ui/dialog.js';
import { useSignal } from '../use-signal.js';

export interface VersionsPanelProps extends Omit<ComponentPropsWithoutRef<'section'>, 'children'> {
  /** The editor; defaults to the one from context. */
  editor?: TeiEditor;
  /** Dates in this language; default the page's. */
  locale?: string;
  /** Leave out the heading (when the app puts the panel under its own). */
  hideHeading?: boolean;
}

const NONE: readonly TeiVersion[] = [];

type Confirm = { action: 'restore' | 'delete'; version: TeiVersion } | null;

/**
 * The document's versions: save the document under a name, look at a
 * version read-only (or compared with now), put one back after a
 * confirm, or delete one. Needs the `Versions` extension; renders nothing
 * without.
 *
 * ```tsx
 * <Editor slots={{ footer: <VersionsPanel /> }} />
 * ```
 */
export function VersionsPanel({
  editor: editorProp,
  locale,
  hideHeading = false,
  className,
  ...rest
}: VersionsPanelProps) {
  const contextEditor = useOptionalEditor();
  const editor = editorProp ?? contextEditor;
  if (!editor) throw new Error('teieditor: <VersionsPanel> needs an `editor` prop or a provider');
  const storage = (
    editor.extension('@teispace/teieditor/versions')?.output as
      | { storage?: VersionsStorage }
      | undefined
  )?.storage;
  const versions = useSignal(storage?.versions) ?? NONE;
  const ready = useSignal(storage?.ready) ?? false;
  const previewing = useSignal(storage?.previewing) ?? null;
  const [name, setName] = useState('');
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [comparing, setComparing] = useState(false);
  const [spoken, setSpoken] = useState('');
  const id = useId();
  const dates = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }),
    [locale],
  );
  if (!storage) return null;

  const current = previewing ? versions.find((v) => v.id === previewing) : undefined;

  const save = (event: FormEvent) => {
    event.preventDefault();
    const version = storage.save(name);
    setName('');
    setSpoken(editor.t('versions.saved', { name: version.name }));
  };

  const act = () => {
    if (!confirm) return;
    const { action, version } = confirm;
    setConfirm(null);
    if (action === 'restore') {
      if (editor.commands.restoreVersion(version.id))
        setSpoken(editor.t('versions.restored', { name: version.name }));
    } else if (editor.commands.deleteVersion(version.id)) {
      setSpoken(editor.t('versions.deleted', { name: version.name }));
    }
  };

  return (
    <section
      {...rest}
      className={cx('tei-portal', 'tei-versions', className)}
      aria-labelledby={hideHeading ? undefined : `${id}-title`}
      aria-label={hideHeading ? editor.t('versions.label') : undefined}
      data-tei-versions=""
    >
      {!hideHeading && (
        <h2 id={`${id}-title`} className="tei-versions-title">
          {editor.t('versions.label')}
        </h2>
      )}
      <form className="tei-versions-save" onSubmit={save}>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={editor.t('versions.name')}
          aria-label={editor.t('versions.name')}
          data-tei-control="version-name"
        />
        <Button type="submit" variant="solid" size="sm" icon={saveVersion}>
          {editor.t('versions.saveAs')}
        </Button>
      </form>

      {!ready ? (
        <p className="tei-versions-empty">{editor.t('versions.loading')}</p>
      ) : versions.length === 0 ? (
        <p className="tei-versions-empty">{editor.t('versions.empty')}</p>
      ) : (
        <ul className="tei-versions-list">
          {versions.map((version) => {
            const open = version.id === previewing;
            return (
              <li
                key={version.id}
                className="tei-version"
                data-current={open ? '' : undefined}
                data-tei-version={version.id}
              >
                <div className="tei-version-meta">
                  <span className="tei-version-name">{version.name}</span>
                  <span className="tei-version-detail">
                    <time dateTime={new Date(version.createdAt).toISOString()}>
                      {dates.format(version.createdAt)}
                    </time>
                    {version.author && ` · ${editor.t('versions.by', { name: version.author })}`}
                  </span>
                </div>
                <div className="tei-version-actions">
                  <Button
                    size="sm"
                    icon={eye}
                    label={editor.t('versions.preview')}
                    pressed={open}
                    onClick={() => {
                      storage.preview(open ? null : version.id);
                      setComparing(false);
                    }}
                  />
                  <Button
                    size="sm"
                    icon={versionHistory}
                    label={editor.t('versions.restore')}
                    disabled={!editor.isEditable}
                    onClick={() => setConfirm({ action: 'restore', version })}
                  />
                  <Button
                    size="sm"
                    icon={trash}
                    label={editor.t('versions.delete')}
                    onClick={() => setConfirm({ action: 'delete', version })}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {current && (
        <div
          className="tei-version-preview"
          role="region"
          aria-label={editor.t('versions.previewOf', { name: current.name })}
          data-tei-version-preview=""
        >
          <div className="tei-version-preview-bar">
            <Button
              size="sm"
              icon={compareIcon}
              pressed={comparing}
              onClick={() => setComparing(!comparing)}
            >
              {editor.t('versions.compare')}
            </Button>
            <Button
              size="sm"
              variant="solid"
              onClick={() => setConfirm({ action: 'restore', version: current })}
            >
              {editor.t('versions.restore')}
            </Button>
            <Button
              size="sm"
              icon={CLOSE}
              label={editor.t('versions.closePreview')}
              onClick={() => storage.preview(null)}
            />
          </div>
          {comparing ? (
            <VersionCompare editor={editor} diff={storage.compare(current.id)} />
          ) : (
            <VersionDocument storage={storage} id={current.id} />
          )}
        </div>
      )}

      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={
          confirm
            ? editor.t(
                confirm.action === 'restore' ? 'versions.restoreTitle' : 'versions.deleteTitle',
                {
                  name: confirm.version.name,
                },
              )
            : ''
        }
        description={
          confirm
            ? editor.t(
                confirm.action === 'restore' ? 'versions.restoreBody' : 'versions.deleteBody',
              )
            : undefined
        }
        onSubmit={act}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              {editor.t('versions.cancel')}
            </Button>
            <Button
              type="submit"
              variant={confirm?.action === 'delete' ? 'danger' : 'solid'}
              data-tei-control="version-confirm"
            >
              {editor.t(confirm?.action === 'delete' ? 'versions.delete' : 'versions.restore')}
            </Button>
          </>
        }
      />
      <span className="tei-sr-only" role="status" aria-live="polite">
        {spoken}
      </span>
    </section>
  );
}

const CLOSE = [['path', { d: 'M18 6 6 18M6 6l12 12' }]] as const;

/** A version drawn read-only with the editor's nodes and theme. */
function VersionDocument({ storage, id }: { storage: VersionsStorage; id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    return storage.renderPreview(id, element);
  }, [storage, id]);
  return <div ref={ref} className="tei-prose tei-version-document" />;
}

/** How a version became the document now: blocks and words added and removed. */
function VersionCompare({ editor, diff }: { editor: TeiEditor; diff: VersionDiff | null }) {
  if (!diff) return null;
  const changed = diff.added + diff.removed + diff.changed;
  return (
    <div className="tei-version-diff" data-tei-version-diff="">
      <p className="tei-version-diff-summary">
        {changed === 0
          ? editor.t('versions.unchanged')
          : editor.t('versions.summary', {
              added: diff.added,
              removed: diff.removed,
              changed: diff.changed,
            })}
      </p>
      {diff.blocks.map((block, index) => {
        const key = `${index}-${block.kind}`;
        if (block.kind === 'changed') {
          return (
            <p key={key} className="tei-version-diff-block" data-kind="changed">
              {block.words.map((word, i) =>
                word.kind === 'same' ? (
                  <span key={`${i}-s`}>{word.text}</span>
                ) : word.kind === 'added' ? (
                  <ins key={`${i}-a`}>
                    <span className="tei-sr-only">{editor.t('versions.added')}: </span>
                    {word.text}
                  </ins>
                ) : (
                  <del key={`${i}-r`}>
                    <span className="tei-sr-only">{editor.t('versions.removed')}: </span>
                    {word.text}
                  </del>
                ),
              )}
            </p>
          );
        }
        const Tag = block.kind === 'added' ? 'ins' : block.kind === 'removed' ? 'del' : 'p';
        return (
          <Tag key={key} className="tei-version-diff-block" data-kind={block.kind}>
            {block.kind !== 'same' && (
              <span className="tei-sr-only">
                {editor.t(block.kind === 'added' ? 'versions.added' : 'versions.removed')}:{' '}
              </span>
            )}
            {block.text || ' '}
          </Tag>
        );
      })}
    </div>
  );
}
