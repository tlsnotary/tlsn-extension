import React, { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { EditorState } from '@codemirror/state';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  height?: string;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  onChange,
  readOnly = false,
  height = '400px',
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!editorRef.current) return;

    const startState = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        javascript(),
        EditorView.editable.of(!readOnly),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !readOnly) {
            const newValue = update.state.doc.toString();
            onChange(newValue);
          }
        }),
        EditorView.theme({
          '&': { height },
          '.cm-scroller': { overflow: 'auto' },
          '.cm-content': { fontFamily: 'Monaco, Menlo, "Ubuntu Mono", Consolas, monospace' },
        }),
      ],
    });

    const view = new EditorView({
      state: startState,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
    };
  }, []);

  // Update editor content when value prop changes (but not from user input)
  useEffect(() => {
    if (viewRef.current) {
      const currentValue = viewRef.current.state.doc.toString();
      if (currentValue !== value) {
        viewRef.current.dispatch({
          changes: { from: 0, to: currentValue.length, insert: value },
        });
      }
    }
  }, [value]);

  return <div ref={editorRef} className="code-editor-container" />;
};
