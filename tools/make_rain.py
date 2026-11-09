"""生成黑客风绿色二进制数字雨视频（固定镜头，纯黑背景，只有 0 和 1）。

前半段：自上而下的纵向数字流。
后半段：从左往右的横向数字流穿插进来（更稀疏）。
CRT 质感：扫描线、像素噪点、轻微闪烁、数字拖影、暗角。
"""
import subprocess
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080
FPS = 30
DUR = 8.0
FRAMES = int(FPS * DUR)
OUT = sys.argv[1] if len(sys.argv) > 1 else "binary_rain.mp4"
FONT_PATH = r"C:\Windows\Fonts\consola.ttf"

rng = np.random.default_rng(20261109)

# ---- 纵向数据流：三层深度 ----
COL_W = 26
N_COLS = W // COL_W + 1
layers = []
for depth, (bright, speed_lo, speed_hi, prob, font_size) in enumerate(
    [(255, 620, 980, 0.62, 22), (150, 360, 620, 0.8, 18), (80, 180, 360, 0.95, 15)]
):
    cols = []
    for i in range(N_COLS):
        if rng.random() > prob:
            continue
        cols.append({
            "x": i * COL_W + int(rng.integers(0, 8)),
            "y": float(rng.integers(-H, 0)),
            "speed": float(rng.uniform(speed_lo, speed_hi)),
            "gap": float(rng.uniform(18, 34)),
            "bright": bright,
            "size": font_size,
            "chars": [str(rng.integers(0, 2)) for _ in range(60)],
        })
    layers.append(cols)

# ---- 横向数据流（后段才出现）----
ROW_H = 30
N_ROWS = H // ROW_H + 1
hcols = []
for j in range(N_ROWS):
    if rng.random() > 0.42:
        continue
    hcols.append({
        "y": j * ROW_H + int(rng.integers(0, 8)),
        "x": float(rng.integers(-W, 0)),
        "speed": float(rng.uniform(420, 760)),
        "gap": float(rng.uniform(22, 40)),
        "bright": int(rng.uniform(70, 130)),
        "size": int(rng.integers(14, 18)),
        "chars": [str(rng.integers(0, 2)) for _ in range(200)],
    })

fonts = {}
def get_font(size):
    if size not in fonts:
        fonts[size] = ImageFont.truetype(FONT_PATH, size)
    return fonts[size]


def render_trail(draw_items, hsize):
    """把一帧的字符画到 L 通道遮罩上，返回 float32 强度图。"""
    mask = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(mask)
    for x, y, ch, size, bright in draw_items:
        d.text((x, y), ch, fill=bright, font=get_font(size))
    arr = np.asarray(mask, dtype=np.float32)
    if hsize != (W, H):
        arr = np.asarray(mask.resize(hsize, Image.BILINEAR), dtype=np.float32)
    return arr


# 预生成扫描线与暗角
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
scan = np.where((yy.astype(np.int32) % 3) == 0, 0.55, 1.0).astype(np.float32)
cx, cy = W / 2, H / 2
vign = 1.0 - 0.55 * (((xx - cx) ** 2 / (cx ** 2) + (yy - cy) ** 2 / (cy ** 2)) ** 1.1)
vign = np.clip(vign, 0.0, 1.0).astype(np.float32)
# 绿色荧光：微弱的青色偏移，模拟磷光
fluo = np.stack([np.ones_like(xx) * 0.06, np.ones_like(xx), np.ones_like(xx) * 0.30], axis=-1).astype(np.float32)

ff = subprocess.Popen(
    ["ffmpeg", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
     "-r", str(FPS), "-i", "-", "-an", "-c:v", "libx264", "-preset", "slow",
     "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", OUT],
    stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
)

trail = np.zeros((H, W), dtype=np.float32)
htrail = np.zeros((H, W), dtype=np.float32)

for f in range(FRAMES):
    t = f / FPS
    # 拖影衰减
    trail *= 0.84
    htrail *= 0.80

    items = []
    for cols in layers:
        for c in cols:
            c["y"] += c["speed"] / FPS
            head = int(c["y"])
            if head > H + 260:
                c["y"] = float(rng.integers(-H - 300, -30))
                head = int(c["y"])
                c["chars"] = [str(rng.integers(0, 2)) for _ in range(60)]
            # 头部最亮，尾巴递减
            for k in range(24):
                yk = head - k * int(c["gap"])
                if yk < -30 or yk > H:
                    continue
                bright = int(c["bright"] * (1.0 - k / 24.0) ** 1.5)
                if bright <= 6:
                    continue
                items.append((c["x"], yk, c["chars"][k % len(c["chars"])], c["size"], bright))

    # 横向流：45% 之后才出现，从左往右
    h_items = []
    if t > DUR * 0.42:
        for c in hcols:
            c["x"] += c["speed"] / FPS
            head = int(c["x"])
            if head > W + 200:
                c["x"] = float(rng.integers(-600, -80))
                head = int(c["x"])
            for k in range(14):
                xk = head - k * int(c["gap"])
                if xk < -20 or xk > W:
                    continue
                bright = int(c["bright"] * (1.0 - k / 14.0) ** 1.6)
                if bright <= 5:
                    continue
                h_items.append((xk, c["y"], c["chars"][k % len(c["chars"])], c["size"], bright))

    trail += render_trail(items, (W, H))
    if h_items:
        htrail += render_trail(h_items, (W, H))

    inten = np.clip(trail + htrail * 0.85, 0, 255)
    frame = (fluo * inten[..., None]) * scan[..., None] * vign[..., None]

    # 噪点 + 轻微闪烁
    noise = rng.normal(0, 3.2, (H, W, 1)).astype(np.float32)
    flicker = 1.0 + rng.normal(0, 0.012)
    frame = np.clip(frame * flicker + noise, 0, 255).astype(np.uint8)

    ff.stdin.write(frame.tobytes())
    if f % 30 == 0:
        print(f"frame {f}/{FRAMES}", flush=True)

ff.stdin.close()
ff.wait()
print("done:", OUT)
