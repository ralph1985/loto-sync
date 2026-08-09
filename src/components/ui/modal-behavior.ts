export const shouldCloseModalOnEscape = (key: string, closeDisabled: boolean) =>
  key === "Escape" && !closeDisabled;
