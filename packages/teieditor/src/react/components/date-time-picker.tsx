'use client';

import type { NodeKey } from 'lexical';
import { useEffect, useState } from 'react';
import type { TeiEditor } from '../../core/editor.js';
import {
  $getDateTime,
  DateTime,
  type DateTimeStorage,
  localDay,
} from '../../extensions/date-time/index.js';
import { TeiEditorContext, useOptionalEditor } from '../context.js';
import { Button } from '../ui/button.js';
import { Field, Input, Switch } from '../ui/controls.js';
import { Popover } from '../ui/popover.js';
import { useEditorState } from '../use-editor-state.js';
import { useUiRequest } from '../use-ui-request.js';

export interface DateTimePickerProps {
  /** The editor; defaults to the one from context. */
  editor?: TeiEditor;
}

/**
 * The picker a date opens (`openDateTimePicker`, a click on it, Enter on
 * it selected): the browser's own date and time inputs, so it is the
 * phone's native wheel on a phone and keyboard-friendly everywhere. Each
 * change applies at once; Done or Escape gives the text back.
 */
export function DateTimePicker({ editor: editorProp }: DateTimePickerProps) {
  const contextEditor = useOptionalEditor();
  const editor = editorProp ?? contextEditor;
  if (!editor) throw new Error('teieditor: <DateTimePicker> needs an `editor` prop or a provider');
  return (
    <TeiEditorContext.Provider value={editor}>
      <EditorDateTimePicker editor={editor} />
    </TeiEditorContext.Provider>
  );
}

function EditorDateTimePicker({ editor }: { editor: TeiEditor }) {
  const storage = editor.extension(DateTime)?.output.storage as DateTimeStorage | undefined;
  const [target, setTarget] = useState<{ key: NodeKey; anchor: Element } | null>(null);
  useUiRequest(storage?.picker, () => {
    const key = storage?.pickerFor.peek();
    const anchor = key ? editor.lexical.getElementByKey(key) : null;
    setTarget(key && anchor ? { key, anchor } : null);
  });
  if (!target) return null;
  const close = (refocus: boolean) => {
    setTarget(null);
    if (refocus) editor.focus();
  };
  return (
    <Popover
      open
      anchor={target.anchor}
      placement="bottom-start"
      offset={4}
      initialFocus="first"
      restoreFocus={false}
      onDismiss={(reason) => close(reason === 'escape')}
      role="dialog"
      aria-label={editor.t('dateTime.picker')}
      data-tei-control="date-time-picker"
    >
      <DateTimeForm editor={editor} nodeKey={target.key} onClose={close} />
    </Popover>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A value as the inputs take it: the day, and the time of day (9:00 for a day without one). */
function inputParts(value: string, showTime: boolean): [day: string, time: string] {
  if (!showTime) return [value, '09:00'];
  const date = new Date(value);
  return [localDay(date), `${pad(date.getHours())}:${pad(date.getMinutes())}`];
}

/** Mounted only while open; closes itself when its date goes (undone, deleted). */
function DateTimeForm({
  editor,
  nodeKey,
  onClose,
}: {
  editor: TeiEditor;
  nodeKey: NodeKey;
  onClose: (refocus: boolean) => void;
}) {
  const current = useEditorState(
    (e) =>
      e.read(() => {
        const node = $getDateTime(nodeKey);
        return node ? { value: node.getValue(), showTime: node.getShowTime() } : null;
      }),
    { editor },
  );
  const gone = current === null;
  useEffect(() => {
    if (gone) onClose(false);
  }, [gone, onClose]);
  if (!current) return null;
  const { showTime } = current;
  const [day, time] = inputParts(current.value, showTime);
  const t = (id: string) => editor.t(id);
  const set = (nextDay: string, nextTime: string, withTime: boolean) => {
    // An input half filled in reads as empty: nothing to set yet.
    if (!nextDay || (withTime && !nextTime)) return;
    editor.commands.setDateTime(withTime ? `${nextDay}T${nextTime}` : nextDay, withTime, nodeKey);
  };
  return (
    <form
      className="tei-date-time-picker"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onClose(true);
      }}
    >
      <Field label={t('dateTime.date')}>
        {(field) => (
          <Input
            {...field}
            type="date"
            value={day}
            data-tei-control="date-time-day"
            onChange={(event) => set(event.target.value, time, showTime)}
          />
        )}
      </Field>
      <Switch
        checked={showTime}
        label={t('dateTime.includeTime')}
        data-tei-control="date-time-show-time"
        onCheckedChange={(on) => set(day, time, on)}
      />
      {showTime && (
        <Field label={t('dateTime.time')}>
          {(field) => (
            <Input
              {...field}
              type="time"
              value={time}
              data-tei-control="date-time-time"
              onChange={(event) => set(day, event.target.value, true)}
            />
          )}
        </Field>
      )}
      <div className="tei-date-time-actions">
        <Button
          variant="danger"
          size="sm"
          icon="trash"
          onClick={() => {
            editor.commands.removeDateTime(nodeKey);
            onClose(true);
          }}
        >
          {t('dateTime.remove')}
        </Button>
        <Button type="submit" variant="solid" size="sm">
          {t('dateTime.done')}
        </Button>
      </div>
    </form>
  );
}
