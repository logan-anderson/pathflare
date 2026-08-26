import type { SVGProps } from "react";

export function Logo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <rect width="64" height="64" rx="16" fill="#12161e" />
      <path
        d="M10 50 C18 46, 22 40, 26 32 S36 16, 44 14"
        fill="none"
        stroke="url(#pathflare-g)"
        strokeWidth="5"
        strokeLinecap="round"
        opacity="0.7"
      />
      <path
        d="M10 50 C18 46, 22 40, 26 32 S36 16, 44 14"
        fill="none"
        stroke="url(#pathflare-g)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="47.5" cy="13.5" r="5.2" fill="#e8fff7" />
      <circle cx="47.5" cy="13.5" r="2.2" fill="#2ee6c5" />
      <defs>
        <linearGradient id="pathflare-g" x1="8" y1="48" x2="52" y2="12">
          <stop stopColor="#5b4dff" />
          <stop offset="0.55" stopColor="#2ee6c5" />
          <stop offset="1" stopColor="#e8fff7" />
        </linearGradient>
      </defs>
    </svg>
  );
}
