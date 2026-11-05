import ts from "typescript";

/** Check small generated contracts entirely in memory, without standard libraries. */
export function typeDiagnostics(source: string): string[] {
  const options: ts.CompilerOptions = {
    strict: true,
    noLib: true,
    noEmit: true,
    types: [],
  };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = (name) =>
    name === "generated.ts"
      ? ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true)
      : undefined;
  const program = ts.createProgram(["generated.ts"], options, host);

  return [
    ...program.getSyntacticDiagnostics(),
    ...program.getSemanticDiagnostics(),
  ].map((diagnostic) =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
  );
}
