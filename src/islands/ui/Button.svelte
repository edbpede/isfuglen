<script lang="ts">
  import type { Snippet } from "svelte";

  type Variant = "primary" | "secondary" | "ghost";

  interface Props {
    children: Snippet;
    variant?: Variant;
    type?: "button" | "submit";
    disabled?: boolean;
    title?: string;
    label?: string;
    pressed?: boolean;
    expanded?: boolean;
    controls?: string;
    id?: string;
    class?: string;
    onclick?: (event: MouseEvent) => void;
  }

  let {
    children,
    variant = "secondary",
    type = "button",
    disabled = false,
    title,
    label,
    pressed,
    expanded,
    controls,
    id,
    class: extra = "",
    onclick,
  }: Props = $props();

  // Full literal class strings picked by a lookup. Nothing here assembles a
  // class name at runtime: UnoCSS generates only what it can find by scanning.
  const VARIANTS: Record<Variant, string> = {
    primary: "btn-primary",
    secondary: "btn-secondary",
    ghost: "btn-ghost",
  };
</script>

<button
  {id}
  {type}
  {disabled}
  {title}
  class="{VARIANTS[variant]} {extra}"
  aria-label={label}
  aria-pressed={pressed}
  aria-expanded={expanded}
  aria-controls={controls}
  {onclick}
>
  {@render children()}
</button>
