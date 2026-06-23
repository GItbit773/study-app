import React from 'react';

interface ModernLogoProps {
  className?: string;
  size?: number;
}

export function ModernLogo({ className = "text-white", size = 32 }: ModernLogoProps) {
  return (
    <svg
      viewBox="0 0 120 80"
      width={size}
      height={size}
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g stroke="none" fill="currentColor">
        {/* Left Peak (Peak 1) */}
        <path d="M 12 56 
                 L 46 22 
                 C 49 19, 52 20, 53 23 
                 L 55 28 
                 C 56 31, 52 35, 48 39 
                 L 22 62 
                 Z" 
        />
        
        {/* Middle Peak (Peak 2) */}
        <path d="M 32 50 
                 L 66 16 
                 C 69 13, 72 14, 73 17 
                 L 75 22 
                 C 76 25, 72 29, 68 33 
                 L 42 56 
                 Z" 
        />
        
        {/* Right Arrow Peak (Peak 3) */}
        <path d="M 52 44 
                 L 80 16 
                 L 75 11 
                 L 96 11 
                 L 96 32 
                 L 91 27 
                 L 62 50 
                 Z" 
        />
      </g>
    </svg>
  );
}
