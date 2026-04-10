import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { RichTextPlugin as LexicalRichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';

export interface EditorContentProps {
  /** Additional class name for the content editable area. */
  className?: string;
  /** Placeholder text when editor is empty. */
  placeholder?: string;
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className="tei-placeholder pointer-events-none absolute top-4 left-4 select-none text-muted-foreground/50">
      {text}
    </div>
  );
}

/**
 * The actual editable area. Wraps Lexical's RichTextPlugin + ContentEditable.
 */
export function EditorContent({
  className = '',
  placeholder = 'Start writing...',
}: EditorContentProps) {
  return (
    <LexicalRichTextPlugin
      contentEditable={
        <ContentEditable
          className={`tei-content-editable outline-none ${className}`.trim()}
          aria-placeholder={placeholder}
          placeholder={<Placeholder text={placeholder} />}
        />
      }
      ErrorBoundary={LexicalErrorBoundary}
    />
  );
}
