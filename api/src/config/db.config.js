console.log('DB_PASSWORD type:', typeof process.env.DB_PASSWORD);
console.log('DB_PASSWORD value (masked):', process.env.DB_PASSWORD ? process.env.DB_PASSWORD.replace(/./g, '*') : 'undefined');
module.exports = {
  HOST: process.env.DB_HOST,
  USER: process.env.DB_USER,
  PASSWORD: process.env.DB_PASSWORD,
  DB: process.env.DB_NAME,
  dialect: 'postgres',
};