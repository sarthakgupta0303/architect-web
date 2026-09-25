import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type LabelHTMLAttributes, type SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const base =
  'w-full rounded-xl border border-border bg-surface px-3 text-sm text-fg placeholder:text-muted transition-colors duration-150 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60'
const invalid = 'border-danger focus:border-danger focus:ring-danger/30'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid: isInvalid, ...props }, ref) {
    return <input ref={ref} className={cn(base, 'h-10', isInvalid && invalid, className)} aria-invalid={isInvalid || undefined} {...props} />
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ className, invalid: isInvalid, ...props }, ref) {
    return <textarea ref={ref} className={cn(base, 'py-2.5', isInvalid && invalid, className)} aria-invalid={isInvalid || undefined} {...props} />
  },
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  function Select({ className, invalid: isInvalid, children, ...props }, ref) {
    return (
      <select ref={ref} className={cn(base, 'h-10 appearance-none bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-9', isInvalid && invalid, className)}
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
        aria-invalid={isInvalid || undefined} {...props}>
        {children}
      </select>
    )
  },
)

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1.5 block text-sm font-medium text-fg', className)} {...props} />
}

export function FieldError({ id, children }: { id?: string; children?: React.ReactNode }) {
  if (!children) return null
  return <p id={id} role="alert" className="mt-1.5 text-xs text-danger">{children}</p>
}

export function FieldHint({ id, children }: { id?: string; children?: React.ReactNode }) {
  return <p id={id} className="mt-1.5 text-xs text-muted">{children}</p>
}
