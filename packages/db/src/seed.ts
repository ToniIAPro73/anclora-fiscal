if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL no definida. No se ha realizado ninguna conexión externa.');
  process.exit(1);
}

console.log('Seed remoto deshabilitado hasta confirmar la conexión externa.');
