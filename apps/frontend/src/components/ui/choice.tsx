import * as RadioGroup from "@radix-ui/react-radio-group";
import { cn } from "@ritme/design";
import { useId } from "react";

export interface ChoiceOption {
  value: string;
  label: string;
  hint?: string;
}

/**
 * Radix radio group styled as selectable cards. Arrow keys move the choice, the whole card is the click target,
 * and the selected state is shown with a filled dot and a border, not colour alone.
 */
export function ChoiceGroup({
  label,
  value,
  onChange,
  options,
  disabled,
  className,
  hideLabel,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  options: ChoiceOption[];
  disabled?: boolean;
  className?: string;
  hideLabel?: boolean;
}) {
  const id = useId();
  return (
    <div className={className}>
      <p id={`${id}-label`} className={hideLabel ? "sr-only" : "mb-2 text-sm font-medium text-navy"}>
        {label}
      </p>
      <RadioGroup.Root
        value={value ?? ""}
        onValueChange={onChange}
        aria-labelledby={`${id}-label`}
        disabled={disabled}
        className="grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]"
      >
        {options.map((o) => {
          const itemId = `${id}-${o.value}`;
          return (
            <label
              key={o.value}
              htmlFor={itemId}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface p-3 transition-colors hover:bg-background",
                "has-[button[data-state=checked]]:border-primary-strong has-[button[data-state=checked]]:bg-primary/5",
                "has-[button:focus-visible]:outline has-[button:focus-visible]:outline-2 has-[button:focus-visible]:outline-offset-2 has-[button:focus-visible]:outline-primary-strong",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <RadioGroup.Item
                id={itemId}
                value={o.value}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-text-muted bg-surface data-[state=checked]:border-primary-strong"
              >
                <RadioGroup.Indicator className="h-3 w-3 rounded-full bg-primary-strong" />
              </RadioGroup.Item>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-navy">{o.label}</span>
                {o.hint && <span className="block text-xs text-text-secondary">{o.hint}</span>}
              </span>
            </label>
          );
        })}
      </RadioGroup.Root>
    </div>
  );
}
