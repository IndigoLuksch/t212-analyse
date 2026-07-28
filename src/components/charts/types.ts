export interface ChartMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ChartDimensions {
  width: number;
  height: number;
  margins: ChartMargins;
}

export interface DatePoint {
  date: Date;
  value: number;
}

export interface SeriesDefinition {
  id: string;
  name: string;
  color: string;
}

export interface TooltipEntry {
  seriesId: string;
  seriesName: string;
  color: string;
  value: string;
}

export type TimeRangePreset = "1Y" | "3Y" | "5Y" | "Max" | "custom";

export interface TimeRangeValue {
  start?: string;
  end?: string;
  preset: TimeRangePreset;
}

export function plotSize(dim: ChartDimensions): { width: number; height: number } {
  const { width, height, margins } = dim;
  return {
    width: Math.max(0, width - margins.left - margins.right),
    height: Math.max(0, height - margins.top - margins.bottom),
  };
}
