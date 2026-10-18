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
    target = ROOT / "artifacts" / "MenuLens-live-demo.mp4"
    subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y","-f","concat","-safe","0","-i",str(concat),
                    "-map","0:v","-an","-vf","fps=30,format=yuv420p",
                    "-t",f"{position:.5f}","-c:v","libx264","-preset","fast","-crf","18",
                    "-movflags","+faststart","-metadata","title=MenuLens — actual ChatGPT demo",
                    "-metadata","comment=Actual ChatGPT interaction captured 2026-10-18. Idle waits and one-time approval pause shortened. No slides or simulated product output.",str(target)],check=True)
    print(json.dumps({"path":str(target),"seconds":position,"sourceFrames":len(edit)}))


if __name__ == "__main__":
    main()
