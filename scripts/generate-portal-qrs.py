#!/usr/bin/env python3
"""Generate print-ready QUAD portal QR codes and 4x6 inch label artwork."""

from pathlib import Path
import argparse

import qrcode
from qrcode.constants import ERROR_CORRECT_H
from qrcode.image.svg import SvgPathImage
from PIL import Image, ImageDraw, ImageFont


PORTALS = {
    "customer-website": {
        "url": "https://film-shop-management-production.up.railway.app/customer.html",
        "title": "CUSTOMER WEBSITE",
        "subtitle": "客户产品网站",
    },
    "dealer-ordering": {
        "url": "https://film-shop-management-production.up.railway.app/customer.html?view=order",
        "title": "SCAN TO ORDER",
        "subtitle": "扫码进入订购中心",
    },
    "employee-mobile": {
        "url": "https://film-shop-management-production.up.railway.app/mobile.html",
        "title": "EMPLOYEE PORTAL",
        "subtitle": "员工端",
    },
    "management-system": {
        "url": "https://film-shop-management-production.up.railway.app/",
        "title": "MANAGEMENT SYSTEM",
        "subtitle": "总系统（仅限内部）",
    },
}


def font(size: int, bold: bool = False):
    candidates = [
        "/System/Library/Fonts/STHeiti Medium.ttc" if bold else "/System/Library/Fonts/STHeiti Light.ttc",
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/HelveticaNeue.ttc",
    ]
    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            try:
                return ImageFont.truetype(str(path), size=size, index=0)
            except OSError:
                continue
    return ImageFont.load_default()


def centered(draw, xy, text, chosen_font, fill):
    box = draw.textbbox((0, 0), text, font=chosen_font)
    width = box[2] - box[0]
    draw.text((xy[0] - width / 2, xy[1]), text, font=chosen_font, fill=fill)


def make_qr(url: str, output_base: Path):
    qr = qrcode.QRCode(version=None, error_correction=ERROR_CORRECT_H, box_size=24, border=4)
    qr.add_data(url)
    qr.make(fit=True)
    png = qr.make_image(fill_color="#000000", back_color="#ffffff").convert("RGB")
    png.save(output_base.with_suffix(".png"), dpi=(300, 300), optimize=True)

    svg_qr = qrcode.QRCode(version=None, error_correction=ERROR_CORRECT_H, box_size=10, border=4)
    svg_qr.add_data(url)
    svg_qr.make(fit=True)
    svg_qr.make_image(image_factory=SvgPathImage).save(output_base.with_suffix(".svg"))
    return png


def make_label(qr_image: Image.Image, item: dict, output: Path, logo_path: Path):
    canvas = Image.new("RGB", (1800, 2400), "white")
    draw = ImageDraw.Draw(canvas)
    teal = "#08677a"
    dark = "#101820"

    draw.rounded_rectangle((90, 90, 1710, 2310), radius=70, outline=teal, width=18)
    draw.rounded_rectangle((90, 90, 1710, 500), radius=70, fill=teal)
    draw.rectangle((90, 360, 1710, 500), fill=teal)

    if logo_path.exists():
        logo = Image.open(logo_path).convert("RGBA")
        logo.thumbnail((210, 210), Image.Resampling.LANCZOS)
        logo_x = 900 - logo.width // 2
        canvas.paste(logo, (logo_x, 135), logo)

    centered(draw, (900, 360), "QUAD FILM", font(74, True), "white")
    centered(draw, (900, 555), item["title"], font(104, True), dark)
    centered(draw, (900, 690), item["subtitle"], font(68, True), teal)

    qr_size = 1320
    qr = qr_image.resize((qr_size, qr_size), Image.Resampling.NEAREST)
    canvas.paste(qr, ((1800 - qr_size) // 2, 810))

    centered(draw, (900, 2160), "Point your iPhone camera at the QR code", font(42), dark)
    centered(draw, (900, 2220), "打开苹果相机扫一扫，即可进入", font(42), dark)
    canvas.save(output, dpi=(300, 300), optimize=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--logo", required=True, type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    lines = ["QUAD portal QR codes", ""]
    for name, item in PORTALS.items():
        base = args.output / f"QUAD-{name}-QR"
        qr_image = make_qr(item["url"], base)
        make_label(qr_image, item, args.output / f"QUAD-{name}-4x6-label.png", args.logo)
        lines.extend([f"{item['title']} / {item['subtitle']}", item["url"], ""])

    (args.output / "QR-URL-list.txt").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
