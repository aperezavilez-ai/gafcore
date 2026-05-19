import Editor from "@monaco-editor/react";
import { GAFCORE_DEFAULT_TEMPLATE_FILES } from "@/lib/gafcore-templates.shared";

export type FileItem = { name: string; language: string; content: string };

/** Plantilla por defecto del IDE (ver también plantillas en BD). */
export const initialFiles = GAFCORE_DEFAULT_TEMPLATE_FILES;

export function CodeEditor({
  files,
  setFiles,
  activeIndex,
}: {
  files: FileItem[];
  setFiles: (f: FileItem[]) => void;
  activeIndex: number;
}) {
  const active = Math.min(activeIndex, files.length - 1);
  const file = files[active];

  const updateContent = (val: string | undefined) => {
    const next = [...files];
    next[active] = { ...next[active], content: val ?? "" };
    setFiles(next);
  };

  return (
    <div className="h-full bg-background">
      <Editor
        height="100%"
        theme="light"
        path={file?.name}
        language={file?.language}
        value={file?.content}
        onChange={updateContent}
        options={{
          fontSize: 13,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          padding: { top: 12 },
          lineNumbers: "on",
          renderLineHighlight: "all",
          quickSuggestions: true,
          suggestOnTriggerCharacters: true,
          tabSize: 2,
        }}
      />
    </div>
  );
}
