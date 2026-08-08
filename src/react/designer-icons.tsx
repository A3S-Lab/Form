import type { SVGProps } from 'react';

export type DesignerIconName =
  | 'alert'
  | 'arrow-down'
  | 'arrow-up'
  | 'calendar'
  | 'card'
  | 'check-square'
  | 'chevron-down'
  | 'close'
  | 'collapse'
  | 'columns-2'
  | 'columns-3'
  | 'components'
  | 'copy'
  | 'desktop'
  | 'edit'
  | 'email'
  | 'eye'
  | 'field'
  | 'grip'
  | 'grid'
  | 'hash'
  | 'info'
  | 'layout'
  | 'list'
  | 'lock'
  | 'mobile'
  | 'radio'
  | 'redo'
  | 'search'
  | 'settings'
  | 'spacer'
  | 'sparkles'
  | 'tabs'
  | 'text'
  | 'textarea'
  | 'toggle'
  | 'trash'
  | 'undo';

export interface DesignerIconProps extends SVGProps<SVGSVGElement> {
  name: DesignerIconName;
  size?: number;
}

export function DesignerIcon({ name, size = 16, ...props }: DesignerIconProps) {
  return (
    <svg aria-hidden="true" fill="none" height={size} viewBox="0 0 24 24" width={size} {...props}>
      {name === 'alert' && (
        <>
          <path d="M12 3 2.8 20h18.4L12 3Z" stroke="currentColor" strokeLinejoin="round" />
          <path d="M12 9v5m0 3h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        </>
      )}
      {name === 'arrow-down' && (
        <path
          d="M12 5v14m0 0 5-5m-5 5-5-5"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
      )}
      {name === 'arrow-up' && (
        <path
          d="M12 19V5m0 0 5 5m-5-5-5 5"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
      )}
      {name === 'calendar' && (
        <>
          <rect
            x="4"
            y="5.5"
            width="16"
            height="14"
            rx="2.5"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M8 3.5v4M16 3.5v4M4 9.5h16M8 13h2m4 0h2m-8 3h2"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.6"
          />
        </>
      )}
      {name === 'card' && (
        <>
          <rect
            x="3.5"
            y="5"
            width="17"
            height="14"
            rx="2.5"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M7 9h7M7 13h10M7 16h6"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.6"
          />
        </>
      )}
      {name === 'check-square' && (
        <>
          <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="m8 12 2.6 2.7L16.5 9"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </>
      )}
      {name === 'chevron-down' && (
        <path
          d="m6.5 9 5.5 5.5L17.5 9"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      )}
      {name === 'close' && (
        <path
          d="m7 7 10 10M17 7 7 17"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.8"
        />
      )}
      {name === 'collapse' && (
        <>
          <rect
            x="4"
            y="4"
            width="16"
            height="6"
            rx="1.5"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <rect
            x="4"
            y="14"
            width="16"
            height="6"
            rx="1.5"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="m16.5 6.5-2 2-2-2"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.3"
          />
        </>
      )}
      {name === 'columns-2' && (
        <>
          <rect
            x="3.5"
            y="4"
            width="17"
            height="16"
            rx="2.5"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path d="M12 4v16" stroke="currentColor" strokeWidth="1.6" />
        </>
      )}
      {name === 'columns-3' && (
        <>
          <rect
            x="3.5"
            y="4"
            width="17"
            height="16"
            rx="2.5"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path d="M9.2 4v16M14.8 4v16" stroke="currentColor" strokeWidth="1.5" />
        </>
      )}
      {name === 'components' && (
        <>
          <rect
            x="4"
            y="4"
            width="6.5"
            height="6.5"
            rx="1.5"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <rect
            x="13.5"
            y="4"
            width="6.5"
            height="6.5"
            rx="1.5"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <rect
            x="4"
            y="13.5"
            width="6.5"
            height="6.5"
            rx="1.5"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M13.5 16.75H20M16.75 13.5V20"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.6"
          />
        </>
      )}
      {name === 'copy' && (
        <>
          <rect x="8" y="8" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"
            stroke="currentColor"
            strokeWidth="1.6"
          />
        </>
      )}
      {name === 'desktop' && (
        <>
          <rect
            x="3.5"
            y="4.5"
            width="17"
            height="12"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M9 20h6m-3-3.5V20"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.6"
          />
        </>
      )}
      {name === 'edit' && (
        <path
          d="M5 19h4L19 9l-4-4L5 15v4Zm8.5-12.5 4 4"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.6"
        />
      )}
      {name === 'email' && (
        <>
          <rect
            x="3.5"
            y="5"
            width="17"
            height="14"
            rx="2.5"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="m5 7 7 6 7-6"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
        </>
      )}
      {name === 'eye' && (
        <>
          <path
            d="M2.8 12s3.2-6 9.2-6 9.2 6 9.2 6-3.2 6-9.2 6-9.2-6-9.2-6Z"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
          <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.6" />
        </>
      )}
      {name === 'field' && (
        <>
          <rect
            x="3.5"
            y="5"
            width="17"
            height="14"
            rx="2.5"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M7 9h4M7 13h10M7 16h7"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.5"
          />
        </>
      )}
      {name === 'grip' && (
        <>
          <circle cx="9" cy="7" r="1" fill="currentColor" />
          <circle cx="15" cy="7" r="1" fill="currentColor" />
          <circle cx="9" cy="12" r="1" fill="currentColor" />
          <circle cx="15" cy="12" r="1" fill="currentColor" />
          <circle cx="9" cy="17" r="1" fill="currentColor" />
          <circle cx="15" cy="17" r="1" fill="currentColor" />
        </>
      )}
      {name === 'grid' && (
        <>
          <rect
            x="4"
            y="4"
            width="16"
            height="16"
            rx="2.5"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16"
            stroke="currentColor"
            strokeWidth="1.3"
          />
        </>
      )}
      {name === 'hash' && (
        <path
          d="M9 3 7 21m10-18-2 18M4 9h17M3 15h17"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.6"
        />
      )}
      {name === 'info' && (
        <>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M12 10.5V17m0-10h.01"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.8"
          />
        </>
      )}
      {name === 'layout' && (
        <>
          <rect
            x="3.5"
            y="4"
            width="17"
            height="16"
            rx="2.5"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path d="M3.5 9h17M9 9v11" stroke="currentColor" strokeWidth="1.5" />
        </>
      )}
      {name === 'list' && (
        <>
          <path
            d="M9 6h11M9 12h11M9 18h11"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.6"
          />
          <circle cx="5" cy="6" r="1" fill="currentColor" />
          <circle cx="5" cy="12" r="1" fill="currentColor" />
          <circle cx="5" cy="18" r="1" fill="currentColor" />
        </>
      )}
      {name === 'lock' && (
        <>
          <rect
            x="5"
            y="10"
            width="14"
            height="10"
            rx="2.5"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.6" />
        </>
      )}
      {name === 'mobile' && (
        <>
          <rect
            x="7"
            y="2.5"
            width="10"
            height="19"
            rx="2.5"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M10.5 5h3M11 18.5h2"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.5"
          />
        </>
      )}
      {name === 'radio' && (
        <>
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="12" cy="12" r="3" fill="currentColor" />
        </>
      )}
      {name === 'redo' && (
        <path
          d="M20 8h-8a7 7 0 1 0 6.3 10M20 8l-4-4m4 4-4 4"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
      )}
      {name === 'search' && (
        <>
          <circle cx="10.5" cy="10.5" r="6" stroke="currentColor" strokeWidth="1.7" />
          <path d="m15 15 4.5 4.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
        </>
      )}
      {name === 'settings' && (
        <>
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M19.2 13.8 21 15l-2 3.5-2.1-.9a7.9 7.9 0 0 1-2.2 1.3l-.3 2.3h-4l-.3-2.3a7.9 7.9 0 0 1-2.2-1.3l-2.1.9-2-3.5 1.8-1.2a8.2 8.2 0 0 1 0-2.6L3.8 10l2-3.5 2.1.9a7.9 7.9 0 0 1 2.2-1.3l.3-2.3h4l.3 2.3a7.9 7.9 0 0 1 2.2 1.3l2.1-.9 2 3.5-1.8 1.2a8.2 8.2 0 0 1 0 2.6Z"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.35"
          />
        </>
      )}
      {name === 'spacer' && (
        <path
          d="M5 5h14M5 19h14M12 8v8m0-8-2 2m2-2 2 2m-2 6-2-2m2 2 2-2"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
      )}
      {name === 'sparkles' && (
        <path
          d="M12 2.8c.4 4 2.4 6 6.2 6.5-3.8.4-5.8 2.5-6.2 6.4-.4-3.9-2.4-6-6.2-6.4C9.6 8.8 11.6 6.8 12 2.8ZM18.5 15.5c.2 1.8 1.1 2.7 2.7 3-1.6.2-2.5 1.1-2.7 2.8-.2-1.7-1.1-2.6-2.7-2.8 1.6-.3 2.5-1.2 2.7-3Z"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.4"
        />
      )}
      {name === 'tabs' && (
        <>
          <path
            d="M4 9h16v11H4V9Z"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.5"
          />
          <path
            d="M4 9V5h6l1.5 4M12 5h5l1.5 4"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.5"
          />
        </>
      )}
      {name === 'text' && (
        <path
          d="M5 6V4h14v2M12 4v16m-4 0h8"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
      )}
      {name === 'textarea' && (
        <>
          <rect
            x="3.5"
            y="4"
            width="17"
            height="16"
            rx="2.5"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M7 8h10M7 12h10M7 16h6"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.5"
          />
        </>
      )}
      {name === 'toggle' && (
        <>
          <rect x="3" y="7" width="18" height="10" rx="5" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="15.5" cy="12" r="3" fill="currentColor" />
        </>
      )}
      {name === 'trash' && (
        <>
          <path
            d="M5 7h14M9 7V4h6v3m2 0-1 13H8L7 7"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
          <path
            d="M10 11v5M14 11v5"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.5"
          />
        </>
      )}
      {name === 'undo' && (
        <path
          d="M4 8h8a7 7 0 1 1-6.3 10M4 8l4-4M4 8l4 4"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
      )}
    </svg>
  );
}

const catalogIconById: Readonly<Record<string, DesignerIconName>> = {
  text: 'text',
  textarea: 'textarea',
  number: 'hash',
  email: 'email',
  password: 'lock',
  date: 'calendar',
  select: 'chevron-down',
  radio: 'radio',
  checkbox: 'check-square',
  switch: 'toggle',
  repeater: 'list',
  'repeater-group': 'list',
  grid: 'grid',
  'columns-2': 'columns-2',
  'columns-3': 'columns-3',
  card: 'card',
  tabs: 'tabs',
  collapse: 'collapse',
  content: 'info',
  divider: 'layout',
  spacer: 'spacer',
};

export function CatalogIcon({ id, fallback }: { id: string; fallback: string }) {
  const name = catalogIconById[id];
  return name ? <DesignerIcon name={name} size={16} /> : <span>{fallback}</span>;
}
