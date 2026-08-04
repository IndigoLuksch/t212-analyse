"use client";

import {
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { placeFloating } from "./floating";

function portalTarget(): HTMLElement {
  return (document.fullscreenElement as HTMLElement | null) ?? document.body;
}

function subscribeFullscreen(onStoreChange: () => void) {
  document.addEventListener("fullscreenchange", onStoreChange);
  return () => document.removeEventListener("fullscreenchange", onStoreChange);
}

function getPortalTarget(): HTMLElement {
  return portalTarget();
}

function getServerPortalTarget(): HTMLElement | null {
  return null;
}

export interface FloatingBoxProps {
  anchor: { x: number; y: number };
  children: ReactNode;
  className?: string;
  id?: string;
  role?: string;
  style?: CSSProperties;
  gap?: number;
  margin?: number;
}

export function FloatingBox({
  anchor,
  children,
  className,
  id,
  role,
  style,
  gap = 12,
  margin = 8,
}: FloatingBoxProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const target = useSyncExternalStore(
    subscribeFullscreen,
    getPortalTarget,
    getServerPortalTarget,
  );

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const { left, top } = placeFloating(
      anchor,
      { width: w, height: h },
      { width: window.innerWidth, height: window.innerHeight },
      gap,
      margin,
    );
    el.style.transform = `translate(${left}px, ${top}px)`;
  }, [anchor, gap, margin, children]);

  if (!mounted || !target) return null;

  const boxClass = [
    "pointer-events-none fixed left-0 top-0 z-50 rounded border border-border bg-surface",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return createPortal(
    <div
      ref={boxRef}
      id={id}
      role={role}
      className={boxClass}
      style={{
        boxShadow: "0 1px 2px var(--border)",
        ...style,
      }}
    >
      {children}
    </div>,
    target,
  );
}
