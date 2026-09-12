export function shouldFocusEditor(state: unknown): boolean {
  return (
    typeof state === "object" &&
    state !== null &&
    (state as { focusEditor?: unknown }).focusEditor === true
  );
}
