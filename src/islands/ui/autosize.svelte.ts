/**
 * A textarea that is as tall as what is in it.
 *
 * The greeting is the field people rewrite most after a parse, and two rows of
 * it meant scrolling a paragraph through a letterbox. Growing the field is the
 * whole fix — but a field that grows without a ceiling pushes the rest of the
 * document card off screen, so it is clamped at both ends and the scrollbar
 * comes back at the top of the range.
 *
 * `value` is a getter rather than the string itself: the action re-measures when
 * the document is replaced under it (a draft opened, the raw view re-applied),
 * not only while someone is typing into it.
 */
export interface AutosizeOptions {
  /** Rows the field never goes below. */
  min?: number;
  /** Rows the field never goes above, after which it scrolls. */
  max?: number;
  /** Read reactively so an external change to the text re-measures the field. */
  value?: () => string;
}

export function autosize(node: HTMLTextAreaElement, options: AutosizeOptions = {}) {
  const min = options.min ?? 3;
  const max = options.max ?? 20;

  const measure = (): void => {
    const style = getComputedStyle(node);
    const lineHeight =
      Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.5 || 20;
    const frame =
      Number.parseFloat(style.paddingTop) +
      Number.parseFloat(style.paddingBottom) +
      Number.parseFloat(style.borderTopWidth) +
      Number.parseFloat(style.borderBottomWidth);
    const borders =
      Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth);

    node.style.height = "auto";
    const content = node.scrollHeight + borders;
    const floor = min * lineHeight + frame;
    const ceiling = max * lineHeight + frame;

    node.style.height = `${Math.min(Math.max(content, floor), ceiling)}px`;
    node.style.overflowY = content > ceiling ? "auto" : "hidden";
  };

  $effect(() => {
    options.value?.();
    measure();
  });

  node.addEventListener("input", measure);
  return {
    destroy(): void {
      node.removeEventListener("input", measure);
    },
  };
}
