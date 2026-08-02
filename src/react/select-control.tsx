import type { SelectHTMLAttributes } from 'react';

export function SelectControl({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="a3s-form-select-control">
      <select {...props} className={className}>
        {children}
      </select>
    </span>
  );
}
