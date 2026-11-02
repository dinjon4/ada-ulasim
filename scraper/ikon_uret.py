"""icon-180.png ve icon-512.png uretir (saf Python, ek paket yok): mavi zemin, vapur ve dalga."""
import math
import struct
import zlib
from pathlib import Path

KOK = Path(__file__).resolve().parent.parent


def piksel(x, y):
    """x,y: 0..1 koordinat. Renk (r,g,b) doner."""
    # zemin: koyu maviden acik maviye
    t = y
    r, g, b = int(11 + 20 * t), int(94 - 20 * t), int(168 - 30 * t)
    # gunes
    if (x - 0.75) ** 2 + (y - 0.25) ** 2 < 0.07 ** 2:
        return (255, 214, 102)
    # govde (yamuk)
    if 0.20 <= y <= 0.62:
        if y >= 0.50 and 0.18 + (y - 0.50) * 0.5 <= x <= 0.82 - (y - 0.50) * 0.5:
            return (255, 255, 255)
        # ust kat
        if 0.34 <= y < 0.50 and 0.30 <= x <= 0.70:
            return (240, 244, 250)
        # baca
        if 0.24 <= y < 0.34 and 0.44 <= x <= 0.56:
            return (230, 80, 60)
        # pencereler
        if 0.38 <= y < 0.45 and 0.34 <= x <= 0.66 and int((x - 0.34) / 0.065) % 2 == 0:
            return (r, g, b)
    # dalgalar
    for k, ofs in enumerate((0.70, 0.80, 0.90)):
        yy = ofs + 0.02 * math.sin(x * 6.28 * 3 + k * 1.7)
        if abs(y - yy) < 0.018:
            return (200 + 10 * k, 225 + 5 * k, 250)
    return (r, g, b)


def png(boyut, dosya, ss=3):
    satirlar = []
    for j in range(boyut):
        satir = bytearray([0])
        for i in range(boyut):
            R = G = B = 0
            for a in range(ss):
                for c in range(ss):
                    p = piksel((i + (c + .5) / ss) / boyut, (j + (a + .5) / ss) / boyut)
                    R += p[0]; G += p[1]; B += p[2]
            n = ss * ss
            satir += bytes((R // n, G // n, B // n))
        satirlar.append(bytes(satir))
    ham = b"".join(satirlar)

    def parca(tur, veri):
        return struct.pack(">I", len(veri)) + tur + veri + struct.pack(">I", zlib.crc32(tur + veri) & 0xFFFFFFFF)

    veri = (b"\x89PNG\r\n\x1a\n" + parca(b"IHDR", struct.pack(">IIBBBBB", boyut, boyut, 8, 2, 0, 0, 0))
            + parca(b"IDAT", zlib.compress(ham, 9)) + parca(b"IEND", b""))
    Path(dosya).write_bytes(veri)


if __name__ == "__main__":
    png(180, KOK / "icon-180.png")
    png(512, KOK / "icon-512.png")
