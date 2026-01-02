/// <reference lib="dom" />
/**
 * CodeMirror 6 browser bundle entry point
 * This file gets bundled as IIFE for browser use
 */
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { json } from "@codemirror/lang-json";
import { oneDark } from "@codemirror/theme-one-dark";

// Expose on window for use in the UI
declare global {
  interface Window {
    createEditor: typeof createEditor;
    EditorView: typeof EditorView;
  }
}

/**
 * Create a CodeMirror editor instance
 */
function createEditor(container: HTMLElement, initialValue: string = ""): EditorView {
  const state = EditorState.create({
    doc: initialValue,
    extensions: [
      basicSetup,
      json(),
      oneDark,
      EditorView.lineWrapping,
      EditorView.theme({
        "&": { height: "100%" },
        ".cm-scroller": { overflow: "auto" },
      }),
    ],
  });

  return new EditorView({
    state,
    parent: container,
  });
}

// Expose to window
window.createEditor = createEditor;
window.EditorView = EditorView;
