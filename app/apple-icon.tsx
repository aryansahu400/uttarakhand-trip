import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Home-screen icon (iOS): the same mountain mark as the favicon, rendered to PNG.
export default function AppleIcon() {
  const svg = readFileSync(join(process.cwd(), "app", "icon.svg"), "utf8").replace('rx="14"', 'rx="0"');
  return new ImageResponse(
    (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`} width={180} height={180} alt="" />
    ),
    size
  );
}
