import { isValidElement, type ComponentProps, type ReactNode } from "react";
import type * as ButtonModule from "@/components/ui/button";

/** A Button a test drew, by its text, with the click a server render never attaches. */
export type DrawnButton = { text: string; disabled: boolean; click: () => void };

/** Every Button drawn since the test last emptied it, in order. */
export const drawnButtons: DrawnButton[] = [];

/** The text a React node shows: its strings and numbers, through its elements' children. */
export function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

/**
 * `@/components/ui/button` whose Button records itself in `drawnButtons` and draws as it does,
 * for `vi.mock`: a test renders a component on the server, then clicks its buttons through this.
 */
export function recordingButtonModule(actual: typeof ButtonModule): typeof ButtonModule {
  function Button(props: ComponentProps<typeof actual.Button>) {
    drawnButtons.push({
      text: textOf(props.children),
      disabled: Boolean(props.disabled),
      click: () => props.onClick?.({} as never),
    });
    return <actual.Button {...props} />;
  }
  return { ...actual, Button };
}

/** The last drawn button whose text includes `label`. */
export function drawnButton(label: string): DrawnButton {
  const button = drawnButtons.findLast((drawn) => drawn.text.includes(label));
  if (!button) throw new Error(`No button "${label}" among: ${drawnButtons.map((drawn) => drawn.text).join(", ")}`);
  return button;
}
