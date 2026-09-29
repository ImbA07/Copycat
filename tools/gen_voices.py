"""Erzeugt die Sprachaufnahmen für COPYCAT mit Piper (deutsche Stimmen).

Aufruf: python3 tools/gen_voices.py <ordner-mit-piper-modellen>
Schreibt audio/voice/*.mp3 und js/voiceManifest.js.
"""
import json, os, subprocess, sys, wave, tempfile
from piper import PiperVoice, SynthesisConfig
import imageio_ffmpeg

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS = sys.argv[1]
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
OUT = os.path.join(ROOT, 'audio', 'voice')
os.makedirs(OUT, exist_ok=True)

lines = json.load(open(os.path.join(ROOT, 'tools', 'voice_lines.json'), encoding='utf-8'))
voices = {
    'mango': PiperVoice.load(os.path.join(MODELS, 'de_DE-pavoque-low.onnx')),
    'emo': PiperVoice.load(os.path.join(MODELS, 'de_DE-thorsten_emotional-medium.onnx')),
}
EMO = {'whisper': 7, 'angry': 1, 'amused': 0}
# Stimmung -> Sprechtempo (kleiner = schneller)
TEMPO = {'conf': 1.0, 'neutral': 0.95, 'desp': 0.82, 'whisper': 1.05, 'angry': 0.9, 'amused': 0.9}

manifest = {}
for char, triggers in lines.items():
    for trig, moods in triggers.items():
        for mood, texts in moods.items():
            for i, text in enumerate(texts):
                name = f'{char}_{trig}_{mood}_{i}'
                if char == 'mango':
                    voice, spk = voices['mango'], None
                else:
                    voice, spk = voices['emo'], EMO[mood]
                cfg = SynthesisConfig(speaker_id=spk, length_scale=TEMPO[mood], noise_scale=0.7)
                with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
                    with wave.open(tmp.name, 'wb') as w:
                        voice.synthesize_wav(text, w, syn_config=cfg)
                    dst = os.path.join(OUT, name + '.mp3')
                    subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-i', tmp.name,
                                    '-af', 'loudnorm=I=-16:TP=-1.5', '-ac', '1',
                                    '-ar', '44100', '-b:a', '64k', dst], check=True)
                    os.unlink(tmp.name)
                manifest.setdefault(char, {}).setdefault(trig, {}).setdefault(mood, []).append(
                    {'file': f'audio/voice/{name}.mp3', 'text': text})
                print(name)

with open(os.path.join(ROOT, 'js', 'voiceManifest.js'), 'w', encoding='utf-8') as f:
    f.write('// Automatisch erzeugt von tools/gen_voices.py\n')
    f.write('export const VOICE = ' + json.dumps(manifest, ensure_ascii=False, indent=1) + ';\n')
