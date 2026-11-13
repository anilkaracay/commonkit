"""Narration for the demo video (D-039): one WAV per spoken line with Kokoro-82M (Apache-2.0) via kokoro-onnx (MIT).

    uv run --python 3.12 --exclude-newer 2026-10-30 --with kokoro-onnx==0.4.9 --with soundfile \
        python scripts/video/voice.py video/build/voice/lines.json video/build/voice

lines.json: [{"key": "...", "say": "..."}]. Writes <key>.wav (24 kHz mono) and durations.json ({key: seconds}).
Model files (video/build/kokoro/, gitignored) come from the kokoro-onnx model-files-v1.0 release; build.sh fetches them.
"""
import json
import sys
from pathlib import Path

import soundfile as sf
from kokoro_onnx import Kokoro

VOICE = "af_heart"
SPEED = 1.05

def main() -> None:
    lines_path, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
    model = Path(__file__).resolve().parents[2] / "video/build/kokoro"
    kokoro = Kokoro(str(model / "kokoro-v1.0.onnx"), str(model / "voices-v1.0.bin"))
    durations = {}
    for line in json.loads(lines_path.read_text()):
        samples, rate = kokoro.create(line["say"], voice=VOICE, speed=SPEED, lang="en-us")
        sf.write(out_dir / f"{line['key']}.wav", samples, rate)
        durations[line["key"]] = round(len(samples) / rate, 3)
        print(f"[voice] {line['key']}: {durations[line['key']]:.2f} s")
    (out_dir / "durations.json").write_text(json.dumps(durations, indent=2) + "\n")

if __name__ == "__main__":
    main()
