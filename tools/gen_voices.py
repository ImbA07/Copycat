"""Erzeugt Copycats Sprachaufnahmen (echtes Deutsch) mit Piper, Stimme "Thorsten emotional".

Aufruf: python3 tools/gen_voices.py <ordner-mit-piper-modellen>
Liest die Sprüche aus js/lines.js, schreibt audio/voice/*.mp3 und js/voiceManifest.js.
Die Stimmung (mood) eines Spruchs bestimmt die Emotion der Stimme.
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

js = subprocess.run(['node', '--input-type=module', '-e',
                     "import('" + os.path.join(ROOT, 'js', 'lines.js') + "').then(m=>console.log(JSON.stringify(m.LINES)))"],
                    capture_output=True, text=True, check=True).stdout
lines = json.loads(js)
voice = PiperVoice.load(os.path.join(MODELS, 'de_DE-thorsten_emotional-medium.onnx'))
SPK = {'amused': 0, 'angry': 1, 'disgusted': 2, 'neutral': 4, 'surprised': 6}
# Stimmung -> (Sprecher-Emotion, Sprechtempo, Tonhöhe)
MOOD = {
    'frech':     ('amused',    0.88, 1.10),
    'lachen':    ('amused',    0.86, 1.12),
    'wuetend':   ('angry',     0.86, 1.06),
    'aufgeregt': ('surprised', 0.84, 1.12),
    'fies':      ('disgusted', 0.92, 1.07),
}

manifest = {}
for trig, entry in lines.items():
    spk, ls, pitch = MOOD.get(entry['mood'], MOOD['frech'])
    cfg = SynthesisConfig(speaker_id=SPK[spk], length_scale=ls, noise_scale=0.7, noise_w_scale=0.85)
    for i, text in enumerate(entry['lines']):
        name = f'{trig}_{i}'
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
            with wave.open(tmp.name, 'wb') as w:
                voice.synthesize_wav(text, w, syn_config=cfg)
            rate = voice.config.sample_rate
            dst = os.path.join(OUT, name + '.mp3')
            # comichaft verstellt: etwas höher, knackig komprimiert, kräftig aber nicht zu laut
            af = (f'asetrate={rate}*{pitch},aresample=44100,atempo={1/pitch*1.04:.3f},'
                  'highpass=f=110,equalizer=f=2800:t=q:w=1.2:g=4,'
                  'acompressor=threshold=-20dB:ratio=4:attack=5:release=80,'
                  'loudnorm=I=-17:TP=-2,silenceremove=start_periods=1:start_threshold=-45dB')
            subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-i', tmp.name, '-af', af,
                            '-ac', '1', '-ar', '44100', '-b:a', '64k', dst], check=True)
            os.unlink(tmp.name)
        manifest[text] = f'audio/voice/{name}.mp3'
        print(name, '|', text)

with open(os.path.join(ROOT, 'js', 'voiceManifest.js'), 'w', encoding='utf-8') as f:
    f.write('// Automatisch erzeugt von tools/gen_voices.py – Spruch -> Audiodatei\n')
    f.write('export const VOICE = ' + json.dumps(manifest, ensure_ascii=False, indent=1) + ';\n')
