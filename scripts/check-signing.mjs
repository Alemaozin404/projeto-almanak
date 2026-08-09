/**
 * check-signing.mjs — valida se há certificado de assinatura disponível antes
 * de um build assinado (npm run dist:signed).
 *
 * O electron-builder lê automaticamente:
 *   CSC_LINK        → caminho/URL do .pfx ou Base64 do certificado
 *   CSC_KEY_PASSWORD→ senha do certificado
 *
 * Se não houver certificado, o script falha (exit 1) com instruções,
 * impedindo que um build "assinado" saia sem assinatura.
 */
const hasLink = !!process.env.CSC_LINK;
const hasPassword = !!process.env.CSC_KEY_PASSWORD;

console.log('🔏 Verificação de assinatura de código');
console.log(`   CSC_LINK         ${hasLink ? '✅ definida' : '❌ ausente'}`);
console.log(`   CSC_KEY_PASSWORD ${hasPassword ? '✅ definida' : '❌ ausente'}`);

if (hasLink && hasPassword) {
  console.log('\n✅ Certificado detectado — o build será ASSINADO.');
  process.exit(0);
}

console.log('\n⚠️  Nenhum certificado configurado — o build NÃO será assinado.');
console.log('\nComo obter um certificado (remove o aviso do Windows de verdade):');
console.log('  1. Compre um certificado de assinatura de código (Code Signing) de uma CA');
console.log('     confiável — ex.: DigiCert, Sectigo, GlobalSign (~R$1.000-2.500/ano).');
console.log('  2. Exporte o certificado como .pfx com senha.');
console.log('  3. Configure as variáveis antes de rodar npm run dist:signed:');
console.log('       export CSC_LINK="/caminho/para/seu-certificado.pfx"');
console.log('       export CSC_KEY_PASSWORD="sua-senha"');
console.log('\nAlternativa gratuita (NÃO remove o aviso em outras máquinas):');
console.log('  Certificado auto-assinado via PowerShell:');
console.log('    New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=Nucleo Clicker"');
console.log('  (Só remove o aviso na máquina onde o certificado é instalado manualmente.)');
console.log('\nPara build SEM assinatura (como antes), use: npm run dist');
process.exit(1);
