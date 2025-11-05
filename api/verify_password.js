const bcrypt = require('bcrypt');

// Replace with the hash from your database and the password you want to check
const hash = '$2b$10$ryh3gcpR2rALHpxK2zizAO39EOE.YZCa9B5..lnkbDOzrx1yvV2.2'; // Example hash for ADA23026
const password = '123'; // The password you want to verify

bcrypt.compare(password, hash)
  .then(result => {
    console.log('Password matches:', result); // true if correct, false if not
  })
  .catch(err => {
    console.error('Error comparing password:', err);
  });
