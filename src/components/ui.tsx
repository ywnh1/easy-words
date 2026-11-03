import React from "react";
import { cn } from "../lib/cn";

export function Button({
  variant = "default",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "ghost";
  size?: "sm" | "md";
}) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition select-none",
        "disabled:opacity-45 disabled:pointer-events-none",
        size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]",
        variant === "primary" &&
          "bg-[var(--color-accent)] text-white hover:brightness-110 active:brightness-95",
        variant === "default" &&
          "border border-[var(--color-line)] bg-[var(--color-panel)] hover:bg-[var(--color-accent-soft)]",
        variant === "ghost" && "hover:bg-[var(--color-accent-soft)]",
        className,
      )}
    />
  );
}

export function Panel({
  title,
  right,
  children,
  className,
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)]",
        className,
      )}
    >
      {title && (
        <header className="flex items-center justify-between gap-2 border-b border-[var(--color-line)] px-3.5 py-2.5">
          <h2 className="text-[13px] font-semibold tracking-wide text-[var(--color-muted)]">
            {title}
          </h2>
          {right}
        </header>
      )}
      <div className="p-3.5">{children}</div>
    </section>
  );
}

export function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        "rounded-md border px-2 py-1 text-[13px] leading-none transition",
        active
          ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
          : "border-[var(--color-line)] hover:border-[var(--color-accent)]",
      )}
    >
      {children}
    </button>
  );
}

export function Check({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 py-1 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
      />
      <span>
        {label}
        {hint && <span className="ml-1.5 text-xs text-[var(--color-muted)]">{hint}</span>}
      </span>
    </label>
  );
}

export function TextInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-9 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] px-2.5 text-sm",
        "focus:border-[var(--color-accent)] focus:outline-none",
        className,
      )}
    />
  );
}

export function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] px-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
