# =============================================================================
# LA CÉDULA AMARILLA DE MENTIRA PARA LA PRUEBA DEL OCR — 21 de octubre de 2026
#
# Fabrica los dos recortes que el escáner le entregaría al OCR (el frente y el
# respaldo), con la tarjeta un poco corrida y más chica que el marco, como la
# pone una persona de verdad, un fondo con rayas de seguridad, desenfoque de
# celular y un grado de inclinación. Los datos son INVENTADOS: ninguna persona.
#
# NO ES UNA CÉDULA MEDIDA. Sigue el diseño público de la amarilla (foto a la
# izquierda, cada valor encima de su rótulo; atrás: nacimiento, lugar, la fila
# de estatura/RH/sexo, la expedición y el código de barras) con las mismas
# fracciones que app/ocr-cedula.js (ZONAS). Prueba que el camino entero
# funciona —recortar, preparar, leer con el Tesseract.js copiado, el consenso y
# las validaciones—, no que las franjas caigan donde caen en una tarjeta real:
# eso se calibra con una de verdad (RECETA-OCR-CEDULA.md).
#
# Uso (Python 3 con Pillow; las fuentes Arial de Windows):
#     python pruebas/fabricar-cedula-ocr.py
# Escribe pruebas/cedula-ocr-frente.pgm.gz y pruebas/cedula-ocr-reverso.pgm.gz
# (gris, PGM binario comprimido: Node lo abre con zlib, sin decodificar PNG).
# =============================================================================
import gzip
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

AQUI = os.path.dirname(os.path.abspath(__file__))
FUENTES = r"C:\Windows\Fonts"

# El recorte: la tarjeta (marco) de 1000 x 631 con un 6 % de aire a cada lado,
# como lo deja EC.margenDeLectura. La GUIA es el marco; la tarjeta real cae un
# poco corrida y más chica (TARJETA), que es lo que pasa en la mano.
ANCHO, ALTO = 1120, 708
GUIA = (60, 38, 1000, 631)
TARJETA = (68, 44, 985, 622)


def fuente(nombre, tam):
    return ImageFont.truetype(os.path.join(FUENTES, nombre), tam)


def fondo(semilla):
    random.seed(semilla)
    img = Image.new("L", (ANCHO, ALTO), 70)  # la mesa, oscura
    tarjeta = Image.new("L", (TARJETA[2], TARJETA[3]), 222)
    d = ImageDraw.Draw(tarjeta)
    # Rayas de seguridad (guilloche): ondas finas que el OCR tiene que ignorar.
    for k in range(0, TARJETA[3], 9):
        pts = [(x, k + 4 * math.sin(x / 23.0 + k / 17.0)) for x in range(0, TARJETA[2], 6)]
        d.line(pts, fill=200, width=1)
    # Un «holograma»: un óvalo más claro que cruza parte del texto.
    d.ellipse((TARJETA[2] * 0.55, TARJETA[3] * 0.25, TARJETA[2] * 0.95, TARJETA[3] * 0.75), outline=235, width=14)
    return img, tarjeta, d


def escribir(d, fx, fy, texto, tam, negrita=True, tinta=25):
    f = fuente("arialbd.ttf" if negrita else "arial.ttf", tam)
    d.text((TARJETA[2] * fx, TARJETA[3] * fy), texto, font=f, fill=tinta)


def terminar(img, tarjeta, nombre, grados):
    tarjeta = tarjeta.rotate(grados, resample=Image.BICUBIC, expand=False, fillcolor=70)
    img.paste(tarjeta, (TARJETA[0], TARJETA[1]))
    img = img.filter(ImageFilter.GaussianBlur(0.7))  # el enfoque de un celular
    datos = b"P5\n%d %d\n255\n" % img.size + img.tobytes()
    with gzip.open(os.path.join(AQUI, nombre), "wb", compresslevel=9) as fh:
        fh.write(datos)
    print(nombre, os.path.getsize(os.path.join(AQUI, nombre)), "bytes")


def frente():
    img, tarjeta, d = fondo(1)
    escribir(d, 0.20, 0.03, "REPUBLICA DE COLOMBIA", 34)
    escribir(d, 0.30, 0.095, "IDENTIFICACION PERSONAL", 22, False)
    escribir(d, 0.30, 0.135, "CEDULA DE CIUDADANIA", 22, False)
    # La foto, a la izquierda (como pide el escáner).
    d.rectangle((TARJETA[2] * 0.03, TARJETA[3] * 0.20, TARJETA[2] * 0.28, TARJETA[3] * 0.80), fill=120)
    d.ellipse((TARJETA[2] * 0.07, TARJETA[3] * 0.28, TARJETA[2] * 0.24, TARJETA[3] * 0.62), fill=170)
    escribir(d, 0.33, 0.22, "NUMERO 52.123.456", 40)
    escribir(d, 0.33, 0.37, "PEREZ GOMEZ", 40)
    escribir(d, 0.33, 0.45, "APELLIDOS", 20, False, 60)
    escribir(d, 0.33, 0.55, "MARIA ALEJANDRA", 40)
    escribir(d, 0.33, 0.63, "NOMBRES", 20, False, 60)
    # La firma: un garabato, y su rótulo, fuera de la franja.
    d.line([(TARJETA[2] * (0.40 + i / 60.0), TARJETA[3] * (0.86 + 0.03 * math.sin(i))) for i in range(25)], fill=60, width=3)
    escribir(d, 0.33, 0.93, "FIRMA", 18, False, 60)
    terminar(img, tarjeta, "cedula-ocr-frente.pgm.gz", 0.8)


def reverso():
    img, tarjeta, d = fondo(2)
    escribir(d, 0.03, 0.05, "FECHA DE NACIMIENTO  15-MAR-1985", 30)
    escribir(d, 0.03, 0.19, "BOGOTA D.C", 28)
    escribir(d, 0.03, 0.25, "(CUNDINAMARCA)", 24)
    escribir(d, 0.03, 0.30, "LUGAR DE NACIMIENTO", 18, False, 60)
    # La fila que NO se lee nunca: estatura, RH y sexo (queda entre las franjas).
    escribir(d, 0.03, 0.355, "1.65", 28)
    escribir(d, 0.22, 0.355, "O+", 28)
    escribir(d, 0.40, 0.355, "F", 28)
    escribir(d, 0.03, 0.405, "ESTATURA        G.S. RH        SEXO", 18, False, 60)
    escribir(d, 0.03, 0.48, "20-ABR-2003 BOGOTA D.C", 30)
    escribir(d, 0.03, 0.545, "FECHA Y LUGAR DE EXPEDICION", 18, False, 60)
    escribir(d, 0.03, 0.66, "REGISTRADOR NACIONAL", 18, False, 60)
    # El índice derecho, arriba a la derecha.
    d.ellipse((TARJETA[2] * 0.72, TARJETA[3] * 0.06, TARJETA[2] * 0.95, TARJETA[3] * 0.55), fill=150)
    # El código de barras abajo: barras al azar (no es un PDF417 de verdad).
    x = int(TARJETA[2] * 0.04)
    while x < TARJETA[2] * 0.96:
        a = random.choice((2, 2, 4, 6))
        if random.random() < 0.5:
            d.rectangle((x, TARJETA[3] * 0.72, x + a - 1, TARJETA[3] * 0.95), fill=20)
        x += a
    terminar(img, tarjeta, "cedula-ocr-reverso.pgm.gz", -0.6)


if __name__ == "__main__":
    frente()
    reverso()
