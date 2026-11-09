'use strict';
/* 4-nov-2026 — Se carga con --require desde el-robot-corre-como-actions.test.js:
   le agrega a la tabla de topes un mes más, inventado y muy bajo, como la fila
   que traería el robot, sin tocar el archivo. Va por _compile porque el cargador
   de módulos no pasa por un fs.readFileSync parcheado. */
const Module = require('node:module');
const compilar = Module.prototype._compile;
Module.prototype._compile = function (codigo, archivo) {
  if (!/\Wapp\Wcreditos\.js$/.test(String(archivo))) return compilar.call(this, codigo, archivo);
  const filas = codigo.match(/\{ desde: '\d{4}-\d{2}-\d{2}', hasta: '\d{4}-\d{2}-\d{2}', consumo_ordinario: [^}]*\}/g);
  const ult = filas[filas.length - 1];
  const hasta = /hasta: '(\d{4})-(\d{2})/.exec(ult);
  const a = new Date(Date.UTC(Number(hasta[1]), Number(hasta[2]), 1)).toISOString().slice(0, 10);
  const z = new Date(Date.UTC(Number(hasta[1]), Number(hasta[2]) + 1, 0)).toISOString().slice(0, 10);
  const nueva = ult + ", { desde: '" + a + "', hasta: '" + z + "', consumo_ordinario: 0.2000, ibc: 0.1333, fuente: 'Resolución inventada' }";
  return compilar.call(this, codigo.split(ult).join(nueva), archivo);
};
