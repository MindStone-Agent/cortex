"use client";

type Props = {
  values: number[];
  min?: number;
  max?: number;
  height?: number;
  color: string;
  fillOpacity?: number;
};

export function Sparkline({
  values,
  min,
  max,
  height = 50,
  color,
  fillOpacity = 0.15,
}: Props) {
  const width = 200; // viewBox width — scales via preserveAspectRatio
  const n = values.length;

  if (n === 0) {
    return (
      <svg
        viewBox={"0 0 " + width + " " + height}
        preserveAspectRatio="none"
        style={{ width: "100%", height: height + "px" }}
        aria-hidden
      />
    );
  }

  const lo = min ?? Math.min(...values);
  const hi = max ?? Math.max(...values);
  const range = hi - lo || 1;
  const step = n > 1 ? width / (n - 1) : width;

  const points = values.map((v, i) => {
    const x = i * step;
    const y = height - ((v - lo) / range) * height;
    return [x, y] as const;
  });

  const linePath = points
    .map(([x, y], i) => (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1))
    .join(" ");
  const areaPath =
    linePath +
    " L" + (points[points.length - 1][0]).toFixed(1) + "," + height +
    " L" + points[0][0].toFixed(1) + "," + height + " Z";

  return (
    <svg
      viewBox={"0 0 " + width + " " + height}
      preserveAspectRatio="none"
      style={{ width: "100%", height: height + "px" }}
      aria-hidden
    >
      <path d={areaPath} fill={color} fillOpacity={fillOpacity} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
