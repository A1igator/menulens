#!/usr/bin/env python3
"""Assemble actual ChatGPT screen captures, with no slides or product mockups.

Run after CUA capture has written artifacts/screen-demo/frames.json.
Long idle gaps and the one-time tool approval pause are cut. UI pixels and
responses remain unchanged; unrelated browser chrome is cropped out.
"""
from pathlib import Path
import json
import subprocess
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CAPTURE = ROOT / "artifacts" / "screen-demo"
VOICE = [
    (0, "I'm using MenuLens inside ChatGPT. My Android phone is already paired, and I ask what's healthy where I am."),
    (13, "It uses the phone's current location to find nearby restaurants. I confirm The Harlequin."),
    (26, "Selecting a restaurant keeps the original request. MenuLens retrieves the published menu and recommends a small set of balanced options."),
    (40, "Here are salmon, yellowfin tartare, and kale salad. The chat explains its top pick, and I can open a dish to inspect ingredients and the source."),
    (60, "I can keep refining in chat. I ask which choices could work dairy-free, then show those checks in the card."),
    (80, "The fish dishes need confirmation because preparation isn't fully listed. The kale salad conflicts because it contains goat cheese. The uncertainty stays visible."),
]


def main():
    frames = json.loads((CAPTURE / "frames.json").read_text())
    listing, edit, position = [], [], 0.0
    for i, frame in enumerate(frames):
        # The paused approval was inspected and allowed once during capture.
        # It is omitted from this concise product walkthrough.
        if 4 <= i <= 14:
            continue
        duration = min(1.6, max(.15, frames[i+1]["time"]-frame["time"])) if i+1<len(frames) else 3.0
        source = Image.open(CAPTURE / frame["path"]).convert("RGB")
        # Central ChatGPT canvas only: no emails, other tabs or address bar.
        source = source.crop((500, 180, 2540, 1688))
        width = round(source.width * 1080/source.height)
        source = source.resize((width, 1080), Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", (1920, 1080), "#FCFCFC")
        canvas.paste(source, ((1920-width)//2, 0))
        filename = f"screen-{i:05d}.png"
        canvas.save(CAPTURE / filename)
        listing.append(f"file '{filename}'\nduration {duration:.5f}\n")
        edit.append({"sourceFrame":i,"start":position,"duration":duration})
        position += duration
    listing.append(f"file '{filename}'\n")
    concat = CAPTURE / "screen-concat.txt"
    concat.write_text("".join(listing))
    (CAPTURE / "screen-edit.json").write_text(json.dumps(edit, indent=2))
    if position >= 120:
        raise SystemExit(f"Edit is too long: {position:.2f}s")
    inputs, filters, mix = [], [], []
    for i,(start,text) in enumerate(VOICE):
        voice = CAPTURE / f"narration-{i+1}.aiff"
        (CAPTURE / f"narration-{i+1}.txt").write_text(text)
        if not voice.exists() or voice.stat().st_size <= 4096:
            raise SystemExit(f"Generate {voice.name} using macOS say before rendering.")
        inputs += ["-i", str(voice)]
        filters.append(f"[{i+1}:a]adelay={start*1000}|{start*1000}[voice{i}]")
        mix.append(f"[voice{i}]")
    filters.append("".join(mix)+f"amix=inputs={len(VOICE)}:normalize=0,apad,loudnorm=I=-16:TP=-1.5:LRA=9[a]")
    target = ROOT / "artifacts" / "MenuLens-live-demo.mp4"
    subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y","-f","concat","-safe","0","-i",str(concat),
                    *inputs,"-filter_complex",";".join(filters),"-map","0:v","-map","[a]","-vf","fps=30,format=yuv420p",
                    "-t",f"{position:.5f}","-c:v","libx264","-preset","fast","-crf","18","-c:a","aac","-b:a","192k",
                    "-movflags","+faststart","-metadata","title=MenuLens — actual ChatGPT demo",
                    "-metadata","comment=Actual ChatGPT interaction captured 2026-10-18. Idle waits and one-time approval pause shortened. No slides or simulated product output.",str(target)],check=True)
    print(json.dumps({"path":str(target),"seconds":position,"sourceFrames":len(edit)}))


if __name__ == "__main__":
    main()
