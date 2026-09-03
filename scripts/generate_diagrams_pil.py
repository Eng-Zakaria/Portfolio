#!/usr/bin/env python3
"""Generate architecture diagrams with icons using PIL/Pillow."""

import os
from PIL import Image, ImageDraw, ImageFont

def create_layer_image(width, height, title, layer_color="#eff6ff", border_color="#bfdbfe"):
    """Create a background layer with title."""
    img = Image.new('RGB', (width, height), '#ffffff')
    draw = ImageDraw.Draw(img)

    # Draw layer background
    draw.rectangle([0, 0, width, height], fill=layer_color, outline=border_color, width=2)

    # Add title
    try:
        font = ImageFont.truetype("arial.ttf", 14)
    except:
        font = ImageFont.load_default()

    draw.text((20, 10), title, fill=layer_color.replace('#', '#').ljust(7, '0'), font=font)

    return img, draw

def main():
    output_dir = "docs/diagrams"
    os.makedirs(output_dir, exist_ok=True)

    # Example: Create a simple diagram structure
    width, height = 960, 800
    img = Image.new('RGB', (width, height), '#f8fafc')
    draw = ImageDraw.Draw(img)

    # Title
    try:
        title_font = ImageFont.truetype("arial.ttf", 24)
        label_font = ImageFont.truetype("arial.ttf", 16)
        small_font = ImageFont.truetype("arial.ttf", 12)
    except:
        title_font = ImageFont.load_default()
        label_font = ImageFont.load_default()
        small_font = ImageFont.load_default()

    # Draw title
    draw.text((480, 30), "Waffarha Assistant — RAG Chatbot",
              anchor="mm", fill="#0f172a", font=title_font)
    draw.text((480, 60), "Production Architecture with Hybrid Intent Routing",
              anchor="mm", fill="#6b7280", font=small_font)

    # Draw layers
    # Layer 1: User Interface
    draw.rectangle([30, 90, 930, 180], fill="#eff6ff", outline="#bfdbfe", width=2)
    draw.text((50, 105), "USER INTERFACE LAYER", fill="#2563eb", font=small_font)

    # Components in layer
    components = [
        (50, "Streamlit", "#2563eb"),
        (220, "FastAPI", "#009688"),
        (400, "User Query", "#0ea5e9")
    ]

    for x, name, color in components:
        draw.rounded_rectangle([x, 115, x+120, 155], radius=8, fill="#ffffff", outline=color, width=2)
        draw.text((x+60, 135), name, anchor="mm", fill="#475569", font=label_font)

    # Save
    output_path = os.path.join(output_dir, "waffarha-assistant-pillow.png")
    img.save(output_path)
    print(f"Saved: {output_path}")

if __name__ == "__main__":
    main()
