import React from 'react';

/**
 * VerifiedBadge: Official Blue Tick for profiles verified by Turfington Admin & Security.
 * Sizes: 'xs' (14px), 'sm' (16px), 'md' (20px), 'lg' (24px)
 */
export default function VerifiedBadge({ size = 'md', className = '', showTooltip = true }) {
  const sizeMap = {
    xs: 'w-3.5 h-3.5',
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  };
  const sizeClass = sizeMap[size] || sizeMap.md;

  return (
    <span
      className={`inline-flex items-center justify-center flex-shrink-0 align-middle ${className}`}
      title={showTooltip ? "Verified Profile (Authenticated by Turfington Security)" : undefined}
    >
      <svg
        className={`${sizeClass} drop-shadow-[0_1px_4px_rgba(56,189,248,0.45)] transition-transform hover:scale-110`}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Scalloped Verified Badge */}
        <path
          d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
          fill="#0284c7"
          stroke="#38bdf8"
          strokeWidth="1.2"
        />
        {/* Crisp Checkmark */}
        <path
          d="m9 12 2 2 4-4"
          stroke="#ffffff"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
