// Tiny shader assembler: #include "chunk" + #define injection.

const INCLUDE_RE = /^[ \t]*#include[ \t]+"([^"]+)"[ \t]*$/gm;

export function assemble(src, chunks, defines = {}, seen = new Set()) {
  const withDefines = Object.entries(defines)
    .map(([k, v]) => `#define ${k} ${v}`)
    .join('\n');

  const out = src.trimStart().replace(INCLUDE_RE, (m, name) => {
    const chunk = chunks[name];
    if (chunk === undefined) throw new Error(`Unknown shader include "${name}"`);
    return assemble(chunk, chunks, {}, seen);
  });

  if (!seen.size) {
    // Put defines straight after #version.
    return out.replace(/(#version[^\n]*\n)/, `$1${withDefines}\n`);
  }
  return out;
}

export function programSource(desc, chunks, defines) {
  const key = desc.name;
  return {
    name: key,
    vs: assemble(desc.vs, chunks, defines),
    fs: assemble(desc.fs, chunks, defines),
  };
}
