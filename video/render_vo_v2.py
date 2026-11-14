#!/usr/bin/env python3
"""Re-render the MintAnchor narration, pause-broken (Dexter, 2026-11-14:
the first cut read like there was no punctuation and felt emotionless).
Same voice (Inspiring Gong) and speed 84. Every line is now short
sentences with full stops, so the delivery lands in beats. No em dashes.
"""
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
VO = HERE / "vo"
VOICE = "avocado_v2:vg_ng_m23"
SPEED = "84"

LINES = {
    1: ("Most borrowers meet their liquidation line on the worst "
        "possible day. The day the market finds it for them. "
        "Mint Anchor lets you find it first."),
    2: ("Enter any Mezo address. The X-Ray reads the live trove. "
        "Straight from the chain itself. Over seven thousand bitcoin "
        "of collateral. Nearly one point four million M U S D of "
        "debt. And a liquidation price of two hundred fifteen "
        "dollars."),
    3: ("Or build your own position. Two bitcoin. Against fifty "
        "thousand M U S D. Now drag the price down. Watch the band "
        "fall with it. Safe. Then watch. Then danger. Closing on "
        "the one hundred ten percent line."),
    4: ("Looping multiplies everything. The gains. And the risk "
        "together. Four loops. At fifty percent each. Leverage over "
        "five times. Liquidation just twelve percent below the live "
        "price. One bad day ends it. So rehearse it here. Before "
        "any real loan."),
    5: ("A check you cannot find again is just a rumour. So save it "
        "on chain. The ratio. The liquidation price. The band and "
        "the label. All written to the Mint Anchor registry on Mezo "
        "testnet. Signed by the demo wallet. And labelled as such."),
    6: ("Every result becomes a card. Ready to share. The position. "
        "The drop. The verdict. Your risk in one picture. Watermark "
        "and all."),
    7: ("Mint Anchor. Stress-test your M U S D position before the "
        "market does. Built for the Mezo Buildathon. Wave two. "
        "Live on testnet. No real funds. And not financial advice."),
}


def dur(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                        "format=duration", "-of", "csv=p=0", str(path)],
                       capture_output=True, text=True)
    return float(r.stdout.strip())


def main():
    total = 0.0
    for i, text in LINES.items():
        out = VO / f"line{i}.mp3"
        subprocess.run(["/opt/hatch/bin/tts", "--text", text,
                        "--voice", VOICE, "--speed", SPEED,
                        "--output", str(out)], check=True,
                       capture_output=True)
        d = dur(out)
        total += d
        print(f"line{i}: {d:.2f}s")
    print(f"total narration: {total:.2f}s")


if __name__ == "__main__":
    main()
