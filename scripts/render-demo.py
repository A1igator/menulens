#!/usr/bin/env python3
"""Render the two-minute edit from real, locally captured MenuLens screens.

Requires Python/Pillow, FFmpeg and macOS `say`. Source captures remain local.
Run from the repo root: python scripts/render-demo.py
"""
from pathlib import Path
import json
import subprocess
import textwrap

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts" / "demo"
OUT.mkdir(parents=True, exist_ok=True)
FONT = Path("/System/Library/Fonts/Supplemental")
BG, FG, MUTED, ACCENT = "#101A16", "#F5F5EB", "#ADBBB2", "#D5EEAC"

SCENES = [
    (12, "MenuLens", "Your menu. Understood.", "shortlist.png",
     "MenuLens helps ChatGPT answer a simple real-world question: what's healthy where I am? Your phone supplies location, and the conversation stays in ChatGPT."),
    (14, "Connect once", "A tiny Android companion", None,
     "Pair the Android companion once, then explicitly start sharing. It sends the latest location in the background, with a persistent notification and a stop button. Your signed-in account reconnects across chats."),
    (18, "Find your restaurant", "Location narrows the search. You confirm.", "nearby.png",
     "Here, the real phone lookup found nearby restaurants in San Francisco. G P S doesn't tell us which restaurant you're inside, so ChatGPT asks you to confirm. I'll select The Harlequin."),
    (22, "Keep the original goal", "A few relevant choices. One clear answer.", "shortlist.png",
     "That selection continues the original healthy-food request. MenuLens reads the restaurant's published menu and shows just three relevant choices: salmon, yellowfin tartare, and kale salad. ChatGPT explains its best pick, rather than printing the entire menu or inventing a health score."),
    (16, "Understand the dish", "Ingredients, evidence and honest limits", "salmon-open.png",
     "Open a dish for ingredients, preparation context, and meal-balance observations. Prices come from the published source. This menu is partial, and calories aren't published, so those limits remain visible."),
    (16, "Just ask in chat", "Preferences stay in the conversation", "dietary.png",
     "Follow-up preferences belong in chat. Ask about dairy, an unfamiliar ingredient, or a budget, and the agent narrows its answer. Missing ingredient information stays uncertain; a menu description is never treated as an allergy guarantee."),
    (14, "Built for agents", "One MCP. Cards or headless clients.", None,
     "The same structured tools work without the cards. MenuLens uses M C P use on Manufact, Ins Forge Postgres for private phone links and menu caching, and capped X four oh two payments for retrieval and extraction."),
    (8, "MenuLens", "Real context. A useful answer.", "shortlist.png",
     "Location-aware, source-backed, and conversational. MenuLens helps agents understand a menu and finish the user's actual request."),
]


def run(args):
    subprocess.run([str(a) for a in args], check=True, stdout=subprocess.DEVNULL)


def font(size, bold=False):
    return ImageFont.truetype(str(FONT / ("Arial Bold.ttf" if bold else "Arial.ttf")), size)


def multiline(draw, xy, value, size, width, fill=FG, bold=False, spacing=13):
    words, lines, current = value.split(), [], ""
    f = font(size, bold)
    for word in words:
        candidate = f"{current} {word}".strip()
        if draw.textlength(candidate, font=f) > width and current:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    draw.multiline_text(xy, "\n".join(lines), font=f, fill=fill, spacing=spacing)


def screen_card(canvas, path):
    source = Image.open(path).convert("RGB")
    # Captures are already cropped to the chat; don't include browser tabs.
    fitted = ImageOps.contain(source, (1152, 822), Image.Resampling.LANCZOS)
    panel = Image.new("RGB", (1180, 850), "#0D0D0D")
    panel.paste(fitted, ((1180-fitted.width)//2, (850-fitted.height)//2))
    canvas.paste(panel, (674, 112))
    d = ImageDraw.Draw(canvas)
    d.rounded_rectangle((673, 111, 1855, 963), radius=20, outline="#405047", width=2)


def boxes(draw, entries, y=260, x=700, width=1100, step=160):
    for number, (heading, detail) in enumerate(entries):
        top = y + number * step
        draw.rounded_rectangle((x, top, x+width, top+125), radius=18, fill="#1E3027", outline="#344B3D", width=2)
        draw.text((x+28, top+19), heading, font=font(30, True), fill=ACCENT)
        multiline(draw, (x+28, top+65), detail, 23, width-56, MUTED, spacing=6)


def render_scene(index, title, subtitle, image_name, destination=None):
    canvas = Image.new("RGB", (1920, 1080), BG)
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((64, 48, 112, 96), radius=12, fill=ACCENT)
    draw.text((75, 49), "m", font=font(35, True), fill=BG)
    draw.text((129, 55), "MENULENS", font=font(23, True), fill=FG)
    draw.text((1600, 58), "YC HACKATHON 2026", font=font(19), fill=MUTED)
    draw.text((64, 220), f"0{index+1}", font=font(24, True), fill=ACCENT)
    multiline(draw, (64, 270), title, 62, 560, bold=True, spacing=14)
    multiline(draw, (64, 455), subtitle, 30, 530, MUTED, spacing=12)
    if image_name:
        screen_card(canvas, OUT / image_name)
        label = "RECORDED PHONE LOOKUP" if image_name == "nearby.png" else "CAPTURED CHATGPT · CACHED PUBLISHED MENU"
        draw.text((694, 982), label, font=font(16), fill=MUTED)
    elif index == 1:
        boxes(draw, [
            ("01   Pair in ChatGPT", "Enter the short-lived code in the Android companion."),
            ("02   Start sharing", "Explicit permission. Persistent notification. Stop at any time."),
            ("03   Return to the conversation", "The account reuses its phone link across new chats."),
        ], y=240, step=190)
        draw.text((700, 875), "CONNECTION FLOW · DIAGRAM", font=font(17), fill=MUTED)
    else:
        boxes(draw, [
            ("mcp-use / Manufact", "Focused tools, validated results and interactive React cards."),
            ("InsForge Postgres", "Private phone links, latest fix, public menu cache and payment ledger."),
            ("x402 retrieval + inference", "$0.10 / call · $0.50 / workflow · $10 / day · 24-hour menu cache"),
            ("Headless evidence", "3 sourced fixtures · 10 tool calls · $0 fixture retrieval cost"),
        ], y=190, step=175)
    draw.line((64, 1024, 1855, 1024), fill="#344339", width=2)
    draw.text((64, 1040), "Make Something Agents Want  /  Developer-mode demonstration", font=font(16), fill=MUTED)
    draw.text((1580, 1040), f"{index+1:02d} / 08", font=font(17), fill=ACCENT)
    result = destination or OUT / f"scene-{index+1:02d}.png"
    canvas.save(result)
    return result


def video_input(index, title, subtitle, image_name, duration, picture):
    motion = {4: ("ingredients-motion.json", (730, 290, 2310, 1470)),
              5: ("dietary-motion.json", (730, 275, 2310, 1450))}.get(index)
    if not motion:
        if index == 3:
            # Show the real concise answer after the shortlist in the same scene.
            answer = render_scene(index, title, subtitle, "answer.png", OUT / "scene-04-answer.png")
            listing = OUT / "scene-04-images.txt"
            listing.write_text(f"file '{picture.name}'\nduration 14\nfile '{answer.name}'\nduration 8\nfile '{answer.name}'\n")
            return ["-f", "concat", "-safe", "0", "-i", listing]
        return ["-loop", "1", "-framerate", "30", "-i", picture]
    entries = json.loads((OUT / motion[0]).read_text())
    output = []
    for number, entry in enumerate(entries):
        crop_name = f"motion-{index}-{number:04d}-crop.png"
        Image.open(OUT / entry["path"]).crop(motion[1]).save(OUT / crop_name)
        frame = render_scene(index, title, subtitle, crop_name, OUT / f"motion-{index}-{number:04d}.png")
        next_time = entries[number+1]["time"] if number+1<len(entries) else duration
        current_time = entry["time"] if number else 0
        frame_duration = max(0.05, min(duration, next_time)-current_time)
        output.append(f"file '{frame.name}'\nduration {frame_duration:.4f}\n")
    output.append(f"file '{frame.name}'\n")
    listing = OUT / f"scene-{index+1:02d}-motion.txt"
    listing.write_text("".join(output))
    return ["-f", "concat", "-safe", "0", "-i", listing]


def subtitle_chunks(text):
    # One concise caption per phrase; no more than two lines at 84 characters.
    import re
    phrases = re.split(r"(?<=[.!?])\s+", text)
    chunks = []
    for phrase in phrases:
        lines = textwrap.wrap(phrase, 80)
        chunks.extend("\n".join(lines[i:i+2]) for i in range(0, len(lines), 2))
    return chunks


def stamp(seconds):
    ms = int(round(seconds*1000))
    return f"{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}"


def caption_overlay(entries):
    listing, previous, number = [], 0.0, 0
    for start, end, text in [*entries, (120.0, 120.0, "")]:
        for a, b, content in ((previous, start, ""), (start, end, text)):
            if b-a < 0.01:
                continue
            image = Image.new("RGB", (1920, 80), BG)
            draw = ImageDraw.Draw(image)
            content = content.replace("G P S", "GPS").replace("M C P use", "mcp-use").replace("Ins Forge", "InsForge").replace("X four oh two", "x402")
            lines = content.splitlines()
            y = (80-len(lines)*29)//2
            for line in lines:
                width = draw.textlength(line, font=font(25))
                draw.text(((1920-width)//2, y), line, font=font(25), fill=FG)
                y += 29
            path = OUT / f"caption-{number:03d}.png"
            image.save(path)
            listing.append(f"file '{path.name}'\nduration {b-a:.4f}\n")
            number += 1
        previous = end
    listing.append(f"file '{path.name}'\n")
    result = OUT / "caption-images.txt"
    result.write_text("".join(listing))
    return result


def main():
    # Capture files must be actual screenshots; fail rather than use substitutes.
    for required in ("nearby.png", "shortlist.png", "salmon-open.png", "dietary.png"):
        if not (OUT / required).is_file():
            raise SystemExit(f"Missing actual screen capture: {OUT / required}")
    timeline, caption_entries, cursor = [], [], 0
    for index, (duration, title, subtitle, image, narration) in enumerate(SCENES):
        picture = render_scene(index, title, subtitle, image)
        script, voice = OUT / f"voice-{index+1:02d}.txt", OUT / f"voice-{index+1:02d}.aiff"
        script.write_text(narration)
        if not voice.exists() or voice.stat().st_size <= 4096:
            run(["say", "-v", "Samantha", "-r", "165", "-f", script, "-o", voice])
        measured = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(voice)])
        try:
            audio_length = float(measured)
        except ValueError:
            raise SystemExit(f"Speech synthesis produced no audio: {voice}. Run macOS say with access to the speech service, then rerun.")
        if audio_length <= 0:
            raise SystemExit(f"Empty narration: {voice}")
        if audio_length > duration-0.5:
            # A small measured speed correction keeps every sentence intact.
            tempo = max(1.0, audio_length/(duration-0.8))
        else:
            tempo = 1.0
        audio_seconds = audio_length/tempo
        chunks = subtitle_chunks(narration)
        weight = sum(len(c) for c in chunks)
        cap_start = cursor+0.25
        for chunk in chunks:
            cap_duration = audio_seconds*len(chunk)/weight
            caption_entries.append((cap_start, cap_start+cap_duration, chunk))
            cap_start += cap_duration
        clip = OUT / f"clip-{index+1:02d}.mp4"
        source = video_input(index, title, subtitle, image, duration, picture)
        run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *source, "-i", voice,
             "-t", duration, "-vf", "fps=30,format=yuv420p", "-af", f"atempo={tempo},adelay=250|250,apad,loudnorm=I=-16:TP=-1.5:LRA=9",
             "-c:v", "libx264", "-preset", "fast", "-crf", "19", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", clip])
        timeline.append({"start":cursor,"duration":duration,"title":title,"capture":image,"voiceSeconds":audio_seconds})
        cursor += duration
    (OUT / "timeline.json").write_text(json.dumps(timeline, indent=2)+"\n")
    captions = "\n\n".join(f"{i+1}\n{stamp(a)} --> {stamp(b)}\n{text}" for i,(a,b,text) in enumerate(caption_entries))+"\n"
    srt = ROOT / "artifacts" / "MenuLens-demo.srt"
    srt.write_text(captions)
    concat = OUT / "concat.txt"
    concat.write_text("".join(f"file 'clip-{i+1:02d}.mp4'\n" for i in range(len(SCENES))))
    # Burn captions into the footer so upload sites cannot silently drop them.
    overlay = caption_overlay(caption_entries)
    final = ROOT / "artifacts" / "MenuLens-demo.mp4"
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", concat,
         "-f", "concat", "-safe", "0", "-i", overlay, "-i", srt,
         "-filter_complex", "[1:v]fps=30[cc];[0:v][cc]overlay=x=0:y=1000:shortest=1,format=yuv420p[v]",
         "-map", "[v]", "-map", "0:a", "-map", "2", "-c:v", "libx264", "-preset", "fast", "-crf", "19", "-c:a", "copy", "-c:s", "mov_text", "-disposition:s:0", "0", "-t", "120", "-movflags", "+faststart",
         "-metadata", "title=MenuLens — location-aware menu understanding", "-metadata", "comment=Edited actual ChatGPT captures. Synthesized narration. Nearby lookup recorded previously; menu data cached. Developer-mode demo.", final])
    print(final)


if __name__ == "__main__":
    main()
