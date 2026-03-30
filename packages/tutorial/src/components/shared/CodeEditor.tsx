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
  const onChangeRef = useRef(onChange);
  const initialValueRef = useRef(value);
  const readOnlyRef = useRef(readOnly);
  const heightRef = useRef(height);

  useEffect(() => {
    onChangeRef.current = onChange;
    readOnlyRef.current = readOnly;
    heightRef.current = height;
  });

  useEffect(() => {
    if (!editorRef.current) return;

    const startState = EditorState.create({
      doc: initialValueRef.current,
      extensions: [
        basicSetup,
        javascript(),
        EditorView.editable.of(!readOnlyRef.current),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !readOnlyRef.current) {
            const newValue = update.state.doc.toString();
            onChangeRef.current(newValue);
          }
        }),
        EditorView.theme({
          '&': { height: heightRef.current },
          '.cm-scroller': { overflow: 'auto' },
          '.cm-content': {
            fontFamily: 'Monaco, Menlo, "Ubuntu Mono", Consolas, monospace',
            fontSize: '13px',
          },
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
