"""Builds the test media used by qa/opus_tests.py into qa/media/ (idempotent)."""
import pathlib, subprocess
from PIL import Image, ImageDraw
import imageio_ffmpeg
ROOT = pathlib.Path(__file__).resolve().parent.parent
M = ROOT / "qa" / "media"; M.mkdir(parents=True, exist_ok=True)
hero = Image.open(ROOT / "img" / "hero-dog.jpg").convert("RGB")
hero.resize((4000, 3000), Image.BICUBIC).save(M / "large-4000x3000.jpg", quality=92)
rgba = hero.resize((600, 450)).convert("RGBA"); a = Image.new("L", rgba.size, 0); ImageDraw.Draw(a).ellipse((40, 20, 560, 430), fill=255); rgba.putalpha(a)
rgba.save(M / "transparent.png")
# EXIF orientation 6 = stored rotated; viewers rotate 90 CW on display
rot = hero.rotate(90, expand=True); ex = Image.Exif(); ex[0x0112] = 6
rot.save(M / "exif-orient6.jpg", exif=ex.tobytes(), quality=92)
hero.resize((50, 50)).save(M / "tiny-50x50.jpg")
(M / "not-an-image.jpg").write_bytes(b"%PDF-1.4\nthis is not a jpeg at all\n" * 50)
(M / "not-a-video.mp4").write_bytes(b"garbage" * 500)
ff = imageio_ffmpeg.get_ffmpeg_exe()
def run(args): subprocess.run([ff, "-y", "-loglevel", "error"] + args, check=True)
run(["-loop", "1", "-i", str(ROOT / "img" / "hero-dog.jpg"), "-t", "0.6", "-vf", "scale=320:-2,format=yuv420p", "-r", "25", "-c:v", "libx264", str(M / "short-0.6s.mp4")])
run(["-loop", "1", "-i", str(ROOT / "img" / "hero-dog.jpg"), "-t", "75", "-vf", "scale=320:-2,format=yuv420p", "-r", "5", "-c:v", "libx264", str(M / "long-75s.mp4")])
print("media in", M)
