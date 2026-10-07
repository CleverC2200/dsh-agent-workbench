/*!
MIT License

Copyright (c) 2026 DeepSeek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/
// Button: token-styled button atom. Variants map to the --dsw-alias-button-*
// fill families; no framework imports, all behavior via props.

import type { ButtonHTMLAttributes, ReactNode } from "react";
import css from "./Button.module.css";

/** Visual variant, each backed by its --dsw-alias-button-* token family. */
export type ButtonVariant = "primary" | "ghost" | "outline" | "toolbar";

/**
 * Render a button.
 * @param props.variant - visual family (default 'ghost').
 * @param props.size - 'md' 36px capsule (figma Button) or 'sm' 28px compact.
 * @param props.icon - optional leading 16px icon node.
 * @returns the button element; native button attributes pass through.
 */
export function Button({
  variant = "ghost",
  size = "md",
  icon,
  className,
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: "md" | "sm";
  icon?: ReactNode;
  className?: string | undefined;
  children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={[css.button, css[variant], css[size], className]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {icon != null && <span className={css.icon}>{icon}</span>}
      {children}
    </button>
  );
}
