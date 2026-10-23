# =============================================================================
# EL FRENTE DE LA AMARILLA DE MENTIRA, NÍTIDO — 23 de octubre de 2026
#
# El mismo diseño que pruebas/fabricar-cedula-ocr.py (foto a la izquierda, el
# número y los nombres en letra grande, las mismas fracciones), dibujado de
# otra manera: al doble de tamaño, sobre el amarillo de la cédula, y achicado
# después, sin girar. Sale más nítido y con las rayas de seguridad más suaves
# en gris. Los datos son INVENTADOS: ninguna persona.
#
# POR QUÉ HACE FALTA OTRO. La verificación de a21746b encontró el frente
# guardado como respaldo sobre un mantel de rayas finas (ver LAS COLUMNAS DE
# LA TARJETA en app/escaner-cedula.js), y lo encontró con ESTA tarjeta, la de
# la demo de la verificación: sus renglones grandes («NUMERO 52.123.456»)
# llegan a la franja del código. Con el frente de fabricar-cedula-ocr.py
# (girado 0,8° y con las rayas de seguridad más marcadas) no pasaba en 300
# escenas de ±58 a ±95: una prueba con él no veía ese camino.
#
# Uso (Python 3 con Pillow; las fuentes Arial de Windows):
#     python pruebas/fabricar-cedula-nitida.py
# Escribe pruebas/cedula-nitida-frente.pgm.gz con la geometría del banco
# (pruebas/banco-camara.js): 1120 x 708, la tarjeta en 60,38 de 1000 x 631,
# la mesa en 70 alrededor. Gris, PGM binario comprimido.
# =============================================================================
import gzip
import math
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

AQUI = os.path.dirname(os.path.abspath(__file__))
FUENTES = r"C:\Windows\Fonts"
W, H = 1970, 1244   # la tarjeta, al doble del recorte del banco


def fuente(nombre, tam):
    return ImageFont.truetype(os.path.join(FUENTES, nombre), tam)


def escribir(d, fx, fy, texto, tam, negrita=True, tinta=(25, 25, 25)):
    d.text((W * fx, H * fy), texto, font=fuente("arialbd.ttf" if negrita else "arial.ttf", tam), fill=tinta)


def frente():
    t = Image.new("RGB", (W, H), (236, 224, 168))   # el amarillo de la cédula
    d = ImageDraw.Draw(t)
    # Las rayas de seguridad (guilloche), en un amarillo apenas más oscuro.
    for k in range(0, H, 18):
        d.line([(x, k + 8 * math.sin(x / 46.0 + k / 34.0)) for x in range(0, W, 12)], fill=(222, 208, 150), width=2)
    d.ellipse((W * .55, H * .25, W * .95, H * .75), outline=(244, 236, 200), width=28)
    escribir(d, .20, .03, "REPUBLICA DE COLOMBIA", 68)
    escribir(d, .30, .095, "IDENTIFICACION PERSONAL", 44, False)
    escribir(d, .30, .135, "CEDULA DE CIUDADANIA", 44, False)
    d.rectangle((W * .03, H * .20, W * .28, H * .80), fill=(120, 110, 90))
    d.ellipse((W * .07, H * .28, W * .24, H * .62), fill=(170, 160, 140))
    escribir(d, .33, .22, "NUMERO 52.123.456", 80)
    escribir(d, .33, .37, "RODRIGUEZ PEREZ", 80)
    escribir(d, .33, .45, "APELLIDOS", 40, False, (60, 60, 60))
    escribir(d, .33, .55, "MARIA JOSE", 80)
    escribir(d, .33, .63, "NOMBRES", 40, False, (60, 60, 60))
    d.line([(W * (.40 + i / 60.0), H * (.86 + .03 * math.sin(i))) for i in range(25)], fill=(60, 60, 60), width=6)
    escribir(d, .33, .93, "FIRMA", 36, False, (60, 60, 60))
    t = t.filter(ImageFilter.GaussianBlur(0.6))
    t = t.convert("L").resize((1000, 631), Image.LANCZOS)
    img = Image.new("L", (1120, 708), 70)   # la mesa, oscura
    img.paste(t, (60, 38))
    datos = b"P5\n%d %d\n255\n" % img.size + img.tobytes()
    nombre = os.path.join(AQUI, "cedula-nitida-frente.pgm.gz")
    with gzip.open(nombre, "wb", compresslevel=9) as fh:
        fh.write(datos)
    print(nombre, os.path.getsize(nombre), "bytes")


if __name__ == "__main__":
    frente()
