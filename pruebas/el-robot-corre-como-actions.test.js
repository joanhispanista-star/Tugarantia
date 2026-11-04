'use strict';
/* ==========================================================================
 * EL ROBOT DE LA USURA NO CORRE COMO ESTE COMPUTADOR — 4 de noviembre de 2026
 *
 *   cd pruebas && node --test el-robot-corre-como-actions.test.js
 *
 * traer-usura.yml corre `node --test` antes de abrir el PR de la fila del mes, y
 * un solo rojo deja la tabla vencida el día 1: la calculadora pública se queda
 * sin precio y el CRM sin propuestas a cuotas. Pasó el 1-oct y el 1-nov. El
 * arreglo del 3-nov (80a13f6) se midió con una «réplica exacta de Actions» que no
 * lo era: `git archive` no trae .git y corrió con la hora de Windows, así que no
 * vio dos pruebas que caen allá siempre. Y una tercera esperaba a enero.
 *
 * Estas pruebas ponen a cada una en las condiciones del runner, en un proceso
 * aparte: lo que las habría cazado. Para medir de verdad a mano: archive con
 * core.autocrlf=false, git init, commit, origin/main en ese commit y TZ=UTC.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');

const AQUI = __dirname;
const RAIZ = path.join(AQUI, '..');
function correr(args, env) {
  const e = Object.assign({}, process.env, env);
  delete e.NODE_TEST_CONTEXT;   // si no, el hijo le reporta a este proceso y no a su salida
  return spawnSync(process.execPath, args, { cwd: AQUI, env: e, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
}
const queCayo = r => (String(r.stdout || '').match(/not ok .*/g) || []).join(' | ') || String(r.stderr || '').slice(0, 300);

describe('lo que en Actions es distinto', () => {

  test('en UTC, el «domingo a las 23:00» de Bogotá sigue siendo domingo', () => {
    const r = correr(['chat-1-crm.test.js'], { TZ: 'UTC' });
    assert.equal(r.status, 0, 'chat-1-crm cae con TZ=UTC: ' + queCayo(r));
  });

  test('con origin/main en el mismo commit del checkout, el ícono no «sigue siendo el de antes»', () => {
    /* Un repositorio de usar y tirar, solo con el ícono de hoy en origin/main: lo
       que ve el runner cuando la marca de oro ya está publicada. */
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-robot-'));
    try {
      const git = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: 'ignore' });
      execFileSync('git', ['init', '-q', dir], { stdio: 'ignore' });
      fs.mkdirSync(path.join(dir, 'app'));
      fs.copyFileSync(path.join(RAIZ, 'app', 'icono-maskable-512.png'), path.join(dir, 'app', 'icono-maskable-512.png'));
      git('add', 'app');
      git('-c', 'user.name=robot', '-c', 'user.email=robot@ejemplo.invalid', 'commit', '-qm', 'el mismo commit');
      git('update-ref', 'refs/remotes/origin/main', 'HEAD');
      const r = correr(['--test-name-pattern=son los de la marca de oro', 'marca-oro.test.js'], { GIT_DIR: path.join(dir, '.git') });
      assert.equal(r.status, 0, 'marca-oro cae con origin/main igual al checkout: ' + queCayo(r));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('una fila nueva y legal, más baja que la tasa del día siguiente, no tumba la vitrina', () => {
    /* La tabla con un mes más, inventado y muy bajo, como la que traería el robot:
       el día siguiente la tarjeta se niega a publicar (es lo correcto) y eso no
       puede dejar sin PR a la fila que le da el techo a ese mes. */
    const r = correr(['--require', path.join(AQUI, 'una-fila-mas-en-los-topes.js'), '--test-name-pattern=EL 1 DE OCTUBRE', 'vitrina.test.js'], {});
    assert.equal(r.status, 0, 'la vitrina cae con una fila legal: ' + queCayo(r));
  });
});
