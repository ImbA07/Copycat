"""Erzeugt Copycats Sprachaufnahmen mit Piper (deutsche Stimme "Thorsten", hohe Qualität).

Aufruf: python3 tools/gen_voices.py <ordner-mit-piper-modellen>
Schreibt audio/voice/*.mp3 und js/voiceManifest.js.
"""
import json, os, subprocess, sys, wave, tempfile, glob
from piper import PiperVoice, SynthesisConfig
import imageio_ffmpeg

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS = sys.argv[1]
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
OUT = os.path.join(ROOT, 'audio', 'voice')
os.makedirs(OUT, exist_ok=True)
for f in glob.glob(os.path.join(OUT, '*.mp3')):
    os.unlink(f)

lines = json.load(open(os.path.join(ROOT, 'tools', 'voice_lines.json'), encoding='utf-8'))
voice = PiperVoice.load(os.path.join(MODELS, 'de_DE-thorsten-high.onnx'))
cfg = SynthesisConfig(length_scale=0.92, noise_scale=0.55, noise_w_scale=0.7)

manifest = {}
for char, triggers in lines.items():
    for trig, moods in triggers.items():
        for mood, texts in moods.items():
            for i, text in enumerate(texts):
                name = f'{char}_{trig}_{i}'
                with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
                    with wave.open(tmp.name, 'wb') as w:
                        voice.synthesize_wav(text, w, syn_config=cfg)
                    dst = os.path.join(OUT, name + '.mp3')
                    # etwas frecher/höher und gleichmäßig leise genug
                    subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-i', tmp.name,
                                    '-af', 'asetrate=22050*1.06,aresample=44100,atempo=0.97,highpass=f=90,loudnorm=I=-21:TP=-3',
                                    '-ac', '1', '-ar', '44100', '-b:a', '64k', dst], check=True)
                    os.unlink(tmp.name)
                manifest.setdefault(char, {}).setdefault(trig, []).append({'file': f'audio/voice/{name}.mp3', 'text': text})
                print(name)

with open(os.path.join(ROOT, 'js', 'voiceManifest.js'), 'w', encoding='utf-8') as f:
    f.write('// Automatisch erzeugt von tools/gen_voices.py\n')
    f.write('export const VOICE = ' + json.dumps(manifest, ensure_ascii=False, indent=1) + ';\n')
