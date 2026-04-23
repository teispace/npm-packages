'use client';

import { $isCodeNode } from '@lexical/code';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { CHANGE_CODE_LANGUAGE_COMMAND } from '@teispace/teieditor/extensions/code-block';
import { $getNearestNodeFromDOMNode } from 'lexical';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconCheck, IconCopy } from '../../ui/icons';

const LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'java',
  'c',
  'cpp',
  'csharp',
  'go',
  'rust',
  'php',
  'ruby',
  'swift',
  'kotlin',
  'html',
  'css',
  'sql',
  'bash',
  'json',
  'yaml',
  'markdown',
  'xml',
  'plain',
];

/**
 * Floating bar above code blocks with language selector and copy button.
 * Appears on hover over a code block.
 */
export function CodeBar() {
  const [editor] = useLexicalComposerContext();
  const [codeNodeKey, setCodeNodeKey] = useState<string | null>(null);
  const [language, setLanguage] = useState('');
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const [copied, setCopied] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // Detect code block on mouse move
  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;

    let debounceTimer: ReturnType<typeof setTimeout>;

    const handleMouseMove = (e: MouseEvent) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const target = (e.target as HTMLElement).closest('code.tei-code-block, pre');
        if (!target) {
          setCodeNodeKey(null);
          return;
        }

        editor.getEditorState().read(() => {
          const node = $getNearestNodeFromDOMNode(target as HTMLElement);
          if (node && $isCodeNode(node)) {
            setCodeNodeKey(node.getKey());
            setLanguage(node.getLanguage() || 'plain');
            const rect = target.getBoundingClientRect();
            setPosition({ top: rect.top + 4, right: window.innerWidth - rect.right + 4 });
          } else {
            setCodeNodeKey(null);
          }
        });
      }, 100);
    };

    const handleMouseLeave = () => {
      clearTimeout(debounceTimer);
      // Delay hiding to allow interaction with the bar
      debounceTimer = setTimeout(() => setCodeNodeKey(null), 300);
    };

    root.addEventListener('mousemove', handleMouseMove);
    root.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      clearTimeout(debounceTimer);
      root.removeEventListener('mousemove', handleMouseMove);
      root.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [editor]);

  const handleLanguageChange = useCallback(
    (newLang: string) => {
      if (!codeNodeKey) return;
      setLanguage(newLang);
      editor.dispatchCommand(CHANGE_CODE_LANGUAGE_COMMAND, {
        nodeKey: codeNodeKey,
        language: newLang,
      });
    },
    [editor, codeNodeKey],
  );

  const handleCopy = useCallback(() => {
    if (!codeNodeKey) return;
    editor.getEditorState().read(() => {
      const node = editor.getEditorState()._nodeMap.get(codeNodeKey);
      if (node) {
        navigator.clipboard.writeText(node.getTextContent());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    });
  }, [editor, codeNodeKey]);

  if (!codeNodeKey || typeof window === 'undefined') return null;

  return createPortal(
    <div
      ref={barRef}
      className="tei-code-bar fixed z-40 flex items-center gap-1.5 rounded-md border border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-popover))] px-2 py-1 shadow-sm"
      style={{ top: position.top, right: position.right }}
      onMouseEnter={() => {
        /* Keep visible while hovering the bar */
      }}
    >
      <select
        value={language}
        onChange={(e) => handleLanguageChange(e.target.value)}
        className="h-6 rounded border-none bg-transparent text-xs text-[hsl(var(--tei-fg))] outline-none"
      >
        {LANGUAGES.map((lang) => (
          <option key={lang} value={lang}>
            {lang}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleCopy}
        className="flex h-6 w-6 items-center justify-center rounded text-[hsl(var(--tei-muted-fg))] hover:bg-[hsl(var(--tei-accent))] hover:text-[hsl(var(--tei-fg))]"
        title="Copy code"
      >
        {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
      </button>
    </div>,
    document.body,
  );
}
