#!/usr/bin/env python3
"""Assemble the MintAnchor pitch video.

Per-scene webm recordings (video/segments/raw) are normalised to
the narration timeline, concatenated, mixed with the Inspiring
Gong voice lines (video/vo, speed 84), and captioned with chunked
ASS subtitles: short chunks, never more than two short lines,
timed inside each narration line. A small watermark event runs
across the site scenes. Output: the goal files mintanchor-pitch.mp4.
"""
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
RAW = HERE / "segments" / "raw"
SEG = HERE / "segments"
WORK = HERE / "work"
VO = HERE / "vo"
OUT = Path.home() / "workspace/goals/mezo-buildathon-wave-2-submission/files/mintanchor-pitch.mp4"

# Tail after each narration line, per scene. Scene duration is
# narration duration plus tail; matches the filmed targets, with
# scene 4 extended for the corrected loop line.
TAILS = [1.6, 2.05, 2.35, 1.75, 2.95, 2.6, 2.45]
VO_LEAD = 0.35  # voice starts this far into each scene

CHUNKS = [
    ["Most borrowers meet their liquidation line",
     "on the worst possible day:",
     "the day the market finds it for them.",
     "MintAnchor lets you find it first."],
    ["Paste any Mezo address.",
     "The X-Ray reads the live trove",
     "from the chain itself:",
     "over seven thousand bitcoin of collateral,",
     "nearly one point four million MUSD of debt,",
     "and a liquidation price",
     "of two hundred fifteen dollars."],
    ["Or build your own position.",
     "Two bitcoin against fifty thousand MUSD.",
     "Now drag the price down,",
     "and watch the band fall with it:",
     "safe, then watch, then danger,",
     "closing on the one hundred ten percent line."],
    ["Looping multiplies everything:",
     "the gains and the risk together.",
     "Four loops at fifty percent each.",
     "Leverage over five times.",
     "Liquidation just twelve percent",
     "below the live price.",
     "One bad day ends it.",
     "Rehearsed here, before any real loan."],
    ["A check you cannot find again",
     "is just a rumour.",
     "So save it on chain:",
     "ratio, liquidation price, band and label,",
     "written to the MintAnchor registry",
     "on Mezo testnet.",
     "Signed by the demo wallet,",
     "and labelled as such."],
    ["Every result becomes a card,",
     "ready to share: the position,",
     "the drop, the verdict.",
     "Your risk, in one picture,",
     "watermark and all."],
    ["MintAnchor.",
     "Stress-test your MUSD position",
     "before the market does.",
     "Built for the Mezo Buildathon, Wave Two.",
     "Live on testnet: no real funds,",
     "and not financial advice."],
]


def dur(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                        "format=duration", "-of", "csv=p=0", str(path)],
                       capture_output=True, text=True)
    return float(r.stdout.strip())


def run(cmd, **kw):
    subprocess.run(cmd, check=True, capture_output=True, text=True, **kw)


def ass_time(t):
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def main():
    vo_durs = [dur(VO / f"line{i}.mp3") for i in range(1, 8)]
    scene_durs = [round(vo_durs[i] + TAILS[i], 2) for i in range(7)]
    starts = []
    t = 0.0
    for d in scene_durs:
        starts.append(t)
        t += d
    total = t
    print("scene durations:", scene_durs, "total:", round(total, 2))

    # 1. Normalise each scene recording to its exact duration.
    seg_files = []
    for i in range(7):
        out = SEG / f"scene{i + 1}.mp4"
        run(["ffmpeg", "-y", "-i", str(RAW / f"scene{i + 1}.webm"),
             "-vf", "scale=1280:720,fps=30,format=yuv420p,"
                    "tpad=stop_mode=clone:stop_duration=30",
             "-t", f"{scene_durs[i]:.2f}",
             "-c:v", "libx264", "-crf", "18", "-an", str(out)])
        seg_files.append(out)
        print("segment", out.name, f"{dur(out):.2f}s")

    # 2. Concatenate.
    listfile = WORK / "concat.txt"
    listfile.write_text("".join(f"file '{p}'\n" for p in seg_files))
    concat = WORK / "concat.mp4"
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(listfile),
         "-c", "copy", str(concat)])
    print("concat:", f"{dur(concat):.2f}s")

    # 3. Captions (ASS): chunked inside each voice line, plus a
    # watermark event per scene.
    lines = [
        "[Script Info]",
        "ScriptType: v4.00+",
        "PlayResX: 1280",
        "PlayResY: 720",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
        "OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, "
        "ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding",
        "Style: Cap,DejaVu Sans,23,&H00FFFFFF,&H00FFFFFF,&H00000000,"
        "&H8C000000,1,0,0,0,100,100,0,0,3,10,0,2,60,60,26,1",
        "Style: WM,DejaVu Sans Mono,15,&H00A8A8A8,&H00A8A8A8,&H66000000,"
        "&H00000000,0,0,0,0,100,100,0,0,1,1,0,9,10,22,14,1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, "
        "MarginV, Effect, Text",
    ]
    for i in range(7):
        lines.append(
            f"Dialogue: 0,{ass_time(starts[i])},{ass_time(starts[i] + scene_durs[i])},"
            "WM,,0,0,0,,@heisdave01 / DEXTER WEB3")
        chunks = CHUNKS[i]
        weights = [len(c) for c in chunks]
        wsum = sum(weights)
        ct = starts[i] + VO_LEAD
        for c, w in zip(chunks, weights):
            cd = vo_durs[i] * w / wsum
            lines.append(
                f"Dialogue: 1,{ass_time(ct)},{ass_time(ct + cd)},Cap,,0,0,0,,{c}")
            ct += cd
    ass = WORK / "captions.ass"
    ass.write_text("\n".join(lines) + "\n")

    # 4. Final mix: captions burned in, voice lines delayed to
    # their scene starts.
    cmd = ["ffmpeg", "-y", "-i", str(concat)]
    for i in range(7):
        cmd += ["-i", str(VO / f"line{i + 1}.mp3")]
    filters = ["[0:v]subtitles=captions.ass[vout]"]
    amix_in = []
    for i in range(7):
        ms = int((starts[i] + VO_LEAD) * 1000)
        filters.append(f"[{i + 1}:a]adelay={ms}|{ms},apad[a{i}]")
        amix_in.append(f"[a{i}]")
    filters.append("".join(amix_in) +
                   f"amix=inputs=7:duration=longest:normalize=0[aout]")
    cmd += ["-filter_complex", ";".join(filters),
            "-map", "[vout]", "-map", "[aout]",
            "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "160k", "-t", f"{total:.2f}",
            "-movflags", "+faststart", str(OUT)]
    run(cmd, cwd=str(WORK))
    print("final:", OUT, f"{dur(OUT):.2f}s")
    (WORK / "assembly.json").write_text(json.dumps(
        {"scene_durs": scene_durs, "starts": starts, "total": total,
         "vo_durs": vo_durs}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
