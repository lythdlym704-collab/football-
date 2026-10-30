#!/bin/bash
set -e
# إذن المايك
sed -i 's#<application#<uses-permission android:name="android.permission.RECORD_AUDIO" />\n    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />\n    <application#' android/app/src/main/AndroidManifest.xml
# أيقونة التطبيق
pip install pillow
python3 - <<'PY'
from PIL import Image, ImageDraw
import os
src = Image.open("icon.jpg").convert("RGBA")
res = "android/app/src/main/res"
for d, legacy, fg in [("mdpi",48,108),("hdpi",72,162),("xhdpi",96,216),("xxhdpi",144,324),("xxxhdpi",192,432)]:
    p = res + "/mipmap-" + d
    os.makedirs(p, exist_ok=True)
    im = src.resize((legacy, legacy), Image.LANCZOS)
    im.save(p + "/ic_launcher.png")
    m = Image.new("L", (legacy, legacy), 0)
    ImageDraw.Draw(m).ellipse((0, 0, legacy - 1, legacy - 1), fill=255)
    r = im.copy(); r.putalpha(m); r.save(p + "/ic_launcher_round.png")
    c = Image.new("RGBA", (fg, fg), (0, 0, 0, 0))
    k = int(fg * 0.68)
    c.paste(src.resize((k, k), Image.LANCZOS), ((fg - k) // 2, (fg - k) // 2))
    c.save(p + "/ic_launcher_foreground.png")
PY
echo "prepare done"
