interface IconProps {
  readonly size?: number;
  readonly color?: string;
}

function Svg({
  size,
  color,
  children,
}: IconProps & { readonly children: React.ReactNode }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
    </svg>
  );
}

export function CubeIcon({ size = 18, color = "currentColor" }: IconProps): React.JSX.Element {
  return (
    <Svg size={size} color={color}>
      <path d="m12 2 8 4.5v9L12 20l-8-4.5v-9L12 2Z" />
      <path d="M12 11 4 6.5" />
      <path d="m12 11 8-4.5" />
      <path d="M12 11v9" />
    </Svg>
  );
}

export function CameraIcon({ size = 18, color = "currentColor" }: IconProps): React.JSX.Element {
  return (
    <Svg size={size} color={color}>
      <path d="M4 8h3l2-3h6l2 3h3v11H4V8Z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </Svg>
  );
}

export function UploadIcon({ size = 18, color = "currentColor" }: IconProps): React.JSX.Element {
  return (
    <Svg size={size} color={color}>
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 20h14" />
    </Svg>
  );
}

export function SparkleIcon({ size = 18, color = "currentColor" }: IconProps): React.JSX.Element {
  return (
    <Svg size={size} color={color}>
      <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
      <path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" />
    </Svg>
  );
}

export function ArrowRightIcon({ size = 18, color = "currentColor" }: IconProps): React.JSX.Element {
  return (
    <Svg size={size} color={color}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </Svg>
  );
}

export function CheckIcon({ size = 18, color = "currentColor" }: IconProps): React.JSX.Element {
  return (
    <Svg size={size} color={color}>
      <path d="m5 12 4 4L19 6" />
    </Svg>
  );
}

export function CodeIcon({ size = 18, color = "currentColor" }: IconProps): React.JSX.Element {
  return (
    <Svg size={size} color={color}>
      <path d="m8 9-4 3 4 3" />
      <path d="m16 9 4 3-4 3" />
      <path d="m14 5-4 14" />
    </Svg>
  );
}

export function DotIcon({ size = 8, color = "currentColor" }: IconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" fill="none" aria-hidden="true">
      <circle cx="4" cy="4" r="4" fill={color} />
    </svg>
  );
}
