import math
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent / "icons"


def chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def write_png(path, size, pixels):
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        raw.extend(pixels[y])
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)


def render(size, letters):
    scale = 4
    big = size * scale
    buf = [0.0] * (big * big * 4)

    def plot(x, y, red, green, blue, alpha):
        if x < 0 or y < 0 or x >= big or y >= big or alpha <= 0:
            return
        index = (y * big + x) * 4
        dst_a = buf[index + 3]
        out_a = alpha + dst_a * (1 - alpha)
        if out_a <= 0:
            return
        buf[index] = (red * alpha + buf[index] * dst_a * (1 - alpha)) / out_a
        buf[index + 1] = (green * alpha + buf[index + 1] * dst_a * (1 - alpha)) / out_a
        buf[index + 2] = (blue * alpha + buf[index + 2] * dst_a * (1 - alpha)) / out_a
        buf[index + 3] = out_a

    def disc(cx, cy, radius, color, cover=1):
        red, green, blue, alpha = color
        reach = int(radius) + 2
        for y in range(int(cy) - reach, int(cy) + reach + 1):
            for x in range(int(cx) - reach, int(cx) + reach + 1):
                distance = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
                edge = radius - distance
                if edge <= 0:
                    continue
                plot(x, y, red, green, blue, alpha * min(1, edge) * cover)

    def rect(x0, y0, x1, y1, color):
        red, green, blue, alpha = color
        for y in range(int(math.floor(y0)), int(math.ceil(y1))):
            for x in range(int(math.floor(x0)), int(math.ceil(x1))):
                coverage = min(x + 1, x1) - max(x, x0)
                coverage *= min(y + 1, y1) - max(y, y0)
                if coverage > 0:
                    plot(x, y, red, green, blue, alpha * min(1, coverage))

    center = big / 2
    disc(center, center, big * 0.48, (5, 5, 6, 1))
    disc(center, center, big * 0.455, (255, 255, 255, 0.95))
    disc(center, center, big * 0.415, (5, 5, 6, 1))
    disc(center, center, big * 0.16, (255, 255, 255, 0.16))
    if letters:
        white = (255, 255, 255, 1)
        thickness = big * 0.038
        height = big * 0.30
        top = center - height / 2
        bottom = center + height / 2

        def letter_l(x):
            rect(x, top, x + thickness, bottom, white)
            rect(x, bottom - thickness, x + big * 0.105, bottom, white)

        letter_l(center - big * 0.30)
        letter_l(center - big * 0.145)
        left = center + big * 0.01
        width = big * 0.22
        steps = max(1, int(height))
        for step in range(steps):
            progress = step / steps
            y = top + step
            x_left = left + progress * (width * 0.5 - thickness / 2)
            x_right = left + width - thickness - progress * (width * 0.5 - thickness / 2)
            rect(x_left, y, x_left + thickness, y + 1.4, white)
            rect(x_right, y, x_right + thickness, y + 1.4, white)

    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            red = green = blue = alpha = 0.0
            for yy in range(scale):
                for xx in range(scale):
                    index = ((y * scale + yy) * big + (x * scale + xx)) * 4
                    red += buf[index]
                    green += buf[index + 1]
                    blue += buf[index + 2]
                    alpha += buf[index + 3]
            count = scale * scale
            row.extend(bytes([
                max(0, min(255, round(red / count))),
                max(0, min(255, round(green / count))),
                max(0, min(255, round(blue / count))),
                max(0, min(255, round(alpha / count * 255))),
            ]))
        rows.append(row)
    return rows


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for size, letters in ((16, False), (48, True), (128, True)):
        write_png(OUT / f"icon{size}.png", size, render(size, letters))


if __name__ == "__main__":
    main()
