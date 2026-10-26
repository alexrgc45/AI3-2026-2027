#!/usr/bin/env node
import bcrypt from "bcryptjs";

const palavraPasse = process.argv[2];
if (!palavraPasse) {
  console.error('Utilização: node gerar-hash.js "palavra-passe"');
  process.exit(1);
}
if (palavraPasse.length < 8 || palavraPasse.length > 128) {
  console.error("A palavra-passe deve ter entre 8 e 128 caracteres.");
  process.exit(1);
}
console.log(await bcrypt.hash(palavraPasse, 10));
